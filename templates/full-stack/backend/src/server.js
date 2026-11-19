import { Buffer } from 'node:buffer';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve } from 'node:path';
import { URL } from 'node:url';

/**
 * Maximum request body size accepted by the backend (64 KiB).
 * Requests exceeding this bound are rejected before unbounded memory buffering.
 */
export const MAX_REQUEST_BODY_BYTES = 64 * 1024;

export const BASELINE_SECURITY_HEADERS = Object.freeze({
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
});

export const STATIC_MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
});

export function getBackendConfig(env = globalThis.process.env) {
  return {
    network: env.STELLAR_NETWORK ?? 'TESTNET',
    horizonUrl:
      env.STELLAR_HORIZON_URL ?? 'https://horizon-testnet.stellar.org',
    rpcUrl: env.STELLAR_RPC_URL ?? 'https://soroban-testnet.stellar.org',
    port: Number.parseInt(env.BACKEND_PORT ?? '3000', 10),
  };
}

export function createHealthPayload(env = {}) {
  const config = getBackendConfig(env);

  return {
    status: 'ok',
    app: '{{projectName}}',
    network: config.network,
  };
}

export function sendResponse(response, statusCode, headers = {}, body) {
  response.writeHead(statusCode, {
    ...BASELINE_SECURITY_HEADERS,
    ...headers,
  });
  response.end(body);
}

export function sendJson(response, statusCode, payload, extraHeaders = {}) {
  sendResponse(
    response,
    statusCode,
    { 'content-type': 'application/json', ...extraHeaders },
    JSON.stringify(payload),
  );
}

/**
 * Reads and validates a JSON request body with a strict size boundary.
 * Returns the parsed JSON payload, or null if the request was rejected.
 */
export async function readJsonBody(
  request,
  response,
  maxBytes = MAX_REQUEST_BODY_BYTES,
) {
  const contentType = request.headers['content-type'] ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    sendJson(response, 415, { error: 'unsupported_media_type' });
    return null;
  }

  const contentLengthHeader = request.headers['content-length'];
  if (contentLengthHeader !== undefined) {
    const contentLength = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      sendJson(response, 413, { error: 'payload_too_large' });
      request.destroy();
      return null;
    }
  }

  return new Promise((resolveBody) => {
    let receivedBytes = 0;
    const chunks = [];
    let exceeded = false;

    request.on('data', (chunk) => {
      if (exceeded) return;
      receivedBytes += chunk.length;
      if (receivedBytes > maxBytes) {
        exceeded = true;
        request.destroy();
        sendJson(response, 413, { error: 'payload_too_large' });
        resolveBody(null);
        return;
      }
      chunks.push(chunk);
    });

    request.on('end', () => {
      if (exceeded) return;
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw.trim().length === 0) {
        resolveBody({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        resolveBody(parsed);
      } catch {
        sendJson(response, 400, { error: 'malformed_json' });
        resolveBody(null);
      }
    });

    request.on('error', () => {
      if (!exceeded) {
        sendJson(response, 400, { error: 'bad_request' });
        resolveBody(null);
      }
    });
  });
}

export function createRequestHandler(
  env = globalThis.process.env,
  options = {},
) {
  const maxBodyBytes = Number.isFinite(options.maxBodyBytes)
    ? options.maxBodyBytes
    : MAX_REQUEST_BODY_BYTES;

  const staticDir = resolve(
    options.staticDir ??
      resolve(import.meta.dirname, '..', '..', 'frontend', 'src'),
  );

  const routes = {
    '/health': {
      methods: ['GET', 'HEAD'],
      handler: (_request, response) => {
        sendJson(response, 200, createHealthPayload(env));
      },
    },
    '/api/echo': {
      methods: ['POST'],
      handler: async (request, response) => {
        const body = await readJsonBody(request, response, maxBodyBytes);
        if (body !== null) {
          sendJson(response, 200, { status: 'ok', data: body });
        }
      },
    },
    ...options.routes,
  };

  return async (request, response) => {
    const method = request.method ?? 'GET';
    const parsedUrl = new URL(
      request.url ?? '/',
      `http://${request.headers.host ?? '127.0.0.1'}`,
    );
    const pathname = parsedUrl.pathname;

    // Reject early if declared Content-Length exceeds max limit
    const contentLengthHeader = request.headers['content-length'];
    if (contentLengthHeader !== undefined) {
      const contentLength = Number.parseInt(contentLengthHeader, 10);
      if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
        sendJson(response, 413, { error: 'payload_too_large' });
        request.destroy();
        return;
      }
    }

    const route = routes[pathname];
    if (route) {
      if (!route.methods.includes(method)) {
        sendJson(
          response,
          405,
          { error: 'method_not_allowed' },
          { allow: route.methods.join(', ') },
        );
        return;
      }

      if (method === 'HEAD') {
        sendResponse(response, 200, { 'content-type': 'application/json' });
        return;
      }

      await route.handler(request, response);
      return;
    }

    // Static asset fallback for GET/HEAD
    if (method === 'GET' || method === 'HEAD') {
      const relativeAssetPath = pathname.startsWith('/')
        ? pathname.slice(1)
        : pathname;

      if (relativeAssetPath.length > 0) {
        const targetPath = resolve(staticDir, relativeAssetPath);
        const isContained =
          targetPath.startsWith(staticDir + '/') ||
          targetPath.startsWith(staticDir + '\\') ||
          targetPath === staticDir;

        const ext = extname(targetPath).toLowerCase();
        const contentType = STATIC_MIME_TYPES[ext];

        if (isContained && contentType && existsSync(targetPath)) {
          try {
            const stat = statSync(targetPath);
            if (stat.isFile()) {
              const content = readFileSync(targetPath);
              sendResponse(
                response,
                200,
                {
                  'content-type': contentType,
                  'cache-control': 'no-cache',
                },
                method === 'HEAD' ? undefined : content,
              );
              return;
            }
          } catch {
            // Fall through to 404
          }
        }
      }
    }

    sendJson(response, 404, { error: 'not_found' });
  };
}

export function createBackendServer(
  env = globalThis.process.env,
  options = {},
) {
  return createServer(createRequestHandler(env, options));
}
