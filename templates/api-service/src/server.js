import { createServer } from 'node:http';
import { clearTimeout, setTimeout } from 'node:timers';
import { getConfig } from './config.js';
import {
  createStellarBoundary,
  getStellarNetworkDescriptor,
} from './stellar-client.js';

// Upper bound for the initialization handshake; health probes stay fast and
// local even while setup is slow, stuck, or failing.
export const INITIALIZATION_TIMEOUT_MS = 1000;

export const BASELINE_SECURITY_HEADERS = Object.freeze({
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
});

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'content-type': 'application/json',
    ...BASELINE_SECURITY_HEADERS,
  });
  response.end(JSON.stringify(payload));
}

export function createRequestHandler(
  env = globalThis.process.env,
  options = {},
) {
  const initializationTimeoutMs = Number.isFinite(options.initializationTimeoutMs)
    ? options.initializationTimeoutMs
    : INITIALIZATION_TIMEOUT_MS;
  const initialize =
    typeof options.initialize === 'function'
      ? options.initialize
      : () => Promise.resolve();

  const state = { status: 'initializing' }; // 'initializing' | 'ready' | 'unavailable'
  let config;
  let stellar;

  const markUnavailable = () => {
    if (state.status === 'initializing') {
      state.status = 'unavailable';
    }
    // Never echo error details: operators get one generic, honest line.
    globalThis.console.error('Service initialization failed.');
  };

  try {
    config = getConfig(env);
    stellar = createStellarBoundary(config);
  } catch {
    markUnavailable();
  }

  if (state.status === 'initializing') {
    const timeout = setTimeout(markUnavailable, initializationTimeoutMs);
    timeout.unref?.();

    Promise.resolve()
      .then(() => initialize())
      .then(() => {
        clearTimeout(timeout);
        if (state.status === 'initializing') {
          state.status = 'ready';
        }
      })
      .catch(() => {
        clearTimeout(timeout);
        markUnavailable();
      });
  }

  return (request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      // Liveness is local and O(1): process is up, nothing else is implied.
      // No configuration values, no Stellar calls, no initialization state.
      sendJson(response, 200, { status: 'ok' });
      return;
    }

    if (request.method === 'GET' && request.url === '/ready') {
      if (state.status === 'ready') {
        sendJson(response, 200, { status: 'ready' });
        return;
      }

      sendJson(response, 503, { status: 'unavailable' });
      return;
    }

    if (request.method === 'GET' && request.url === '/stellar/network') {
      if (state.status !== 'ready' || !stellar) {
        sendJson(response, 503, { status: 'unavailable' });
        return;
      }

      sendJson(response, 200, getStellarNetworkDescriptor(stellar));
      return;
    }

    sendJson(response, 404, { error: 'not_found' });
  };
}

export function createApiServer(
  env = globalThis.process.env,
  options = {},
) {
  return createServer(createRequestHandler(env, options));
}
