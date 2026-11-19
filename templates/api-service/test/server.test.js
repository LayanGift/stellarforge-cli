import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { setImmediate, setTimeout } from 'node:timers';
import { getConfig } from '../src/config.js';
import { BASELINE_SECURITY_HEADERS, createApiServer } from '../src/server.js';
import {
  createStellarBoundary,
  getStellarNetworkDescriptor,
} from '../src/stellar-client.js';

test('configuration validates ports and remote endpoint protocols', () => {
  assert.throws(() => getConfig({ API_PORT: '70000' }), /API_PORT/);
  assert.throws(
    () => getConfig({ STELLAR_RPC_URL: 'http://example.com/rpc' }),
    /HTTPS/,
  );
});

test('Stellar boundary exposes configured public endpoints without network calls', () => {
  const config = getConfig({
    STELLAR_NETWORK: 'TESTNET',
    STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
    STELLAR_RPC_URL: 'https://soroban-testnet.stellar.org',
  });

  assert.deepEqual(
    getStellarNetworkDescriptor(createStellarBoundary(config)),
    {
      network: 'TESTNET',
      horizonUrl: 'https://horizon-testnet.stellar.org',
      rpcUrl: 'https://soroban-testnet.stellar.org',
    },
  );
});

test('HTTP server exposes health and Stellar network routes', async () => {
  const server = createApiServer({ STELLAR_NETWORK: 'TESTNET' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const address = server.address();
    assert.notEqual(address, null);
    assert.equal(typeof address, 'object');

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const health = await globalThis.fetch(`${baseUrl}/health`);
    const healthPayload = await health.json();

    assert.equal(health.status, 200);
    assert.deepEqual(healthPayload, { status: 'ok' });

    // Readiness reports ready only after initialization completes.
    const ready = await globalThis.fetch(`${baseUrl}/ready`);
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), { status: 'ready' });

    const stellar = await globalThis.fetch(`${baseUrl}/stellar/network`);
    const stellarPayload = await stellar.json();

    assert.equal(stellar.status, 200);
    assert.equal(stellarPayload.network, 'TESTNET');
    assert.match(stellarPayload.horizonUrl, /^https:\/\//);
    assert.match(stellarPayload.rpcUrl, /^https:\/\//);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test('health route rejects invalid HTTP methods', async () => {
  const server = createApiServer({ STELLAR_NETWORK: 'TESTNET' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const address = server.address();
    assert.notEqual(address, null);
    assert.equal(typeof address, 'object');

    const baseUrl = `http://127.0.0.1:${address.port}`;

    // Test POST to /health
    const postResponse = await globalThis.fetch(`${baseUrl}/health`, {
      method: 'POST',
    });
    assert.equal(postResponse.status, 404);
    const postPayload = await postResponse.json();
    assert.deepEqual(postPayload, { error: 'not_found' });

    // Test PUT to /health
    const putResponse = await globalThis.fetch(`${baseUrl}/health`, {
      method: 'PUT',
    });
    assert.equal(putResponse.status, 404);
    const putPayload = await putResponse.json();
    assert.deepEqual(putPayload, { error: 'not_found' });

    // Test DELETE to /health
    const deleteResponse = await globalThis.fetch(`${baseUrl}/health`, {
      method: 'DELETE',
    });
    assert.equal(deleteResponse.status, 404);
    const deletePayload = await deleteResponse.json();
    assert.deepEqual(deletePayload, { error: 'not_found' });

    // Test PATCH to /health
    const patchResponse = await globalThis.fetch(`${baseUrl}/health`, {
      method: 'PATCH',
    });
    assert.equal(patchResponse.status, 404);
    const patchPayload = await patchResponse.json();
    assert.deepEqual(patchPayload, { error: 'not_found' });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test('health route rejects invalid paths', async () => {
  const server = createApiServer({ STELLAR_NETWORK: 'TESTNET' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const address = server.address();
    assert.notEqual(address, null);
    assert.equal(typeof address, 'object');

    const baseUrl = `http://127.0.0.1:${address.port}`;

    // Test /health with trailing slash
    const trailingSlashResponse = await globalThis.fetch(
      `${baseUrl}/health/`,
    );
    assert.equal(trailingSlashResponse.status, 404);
    const trailingSlashPayload = await trailingSlashResponse.json();
    assert.deepEqual(trailingSlashPayload, { error: 'not_found' });

    // Test /health with extra path segments
    const extraPathResponse = await globalThis.fetch(
      `${baseUrl}/health/status`,
    );
    assert.equal(extraPathResponse.status, 404);
    const extraPathPayload = await extraPathResponse.json();
    assert.deepEqual(extraPathPayload, { error: 'not_found' });

    // Test completely invalid path
    const invalidPathResponse = await globalThis.fetch(`${baseUrl}/invalid`);
    assert.equal(invalidPathResponse.status, 404);
    const invalidPathPayload = await invalidPathResponse.json();
    assert.deepEqual(invalidPathPayload, { error: 'not_found' });

    // Test root path
    const rootResponse = await globalThis.fetch(`${baseUrl}/`);
    assert.equal(rootResponse.status, 404);
    const rootPayload = await rootResponse.json();
    assert.deepEqual(rootPayload, { error: 'not_found' });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test('health route response structure remains stable', async () => {
  const server = createApiServer({ STELLAR_NETWORK: 'MAINNET' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const address = server.address();
    assert.notEqual(address, null);
    assert.equal(typeof address, 'object');

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const health = await globalThis.fetch(`${baseUrl}/health`);
    const healthPayload = await health.json();

    // Verify the liveness response is status-only (no configuration values).
    assert.equal(typeof healthPayload, 'object');
    assert.deepEqual(Object.keys(healthPayload), ['status']);
    assert.equal(healthPayload.status, 'ok');

    // Readiness reports a stable exact shape.
    const ready = await globalThis.fetch(`${baseUrl}/ready`);
    const readyPayload = await ready.json();
    assert.deepEqual(Object.keys(readyPayload), ['status']);
    assert.equal(readyPayload.status, 'ready');

    // Verify content-type header
    assert.equal(
      health.headers.get('content-type'),
      'application/json',
    );
    assert.equal(
      ready.headers.get('content-type'),
      'application/json',
    );
    assert.equal(
      health.headers.get('x-content-type-options'),
      'nosniff',
    );
    assert.equal(
      health.headers.get('x-frame-options'),
      'DENY',
    );
    assert.equal(
      health.headers.get('referrer-policy'),
      'no-referrer',
    );
    assert.equal(
      health.headers.get('strict-transport-security'),
      null,
    );
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test('HTTP server applies baseline security headers to success and error responses without HSTS', async () => {
  const server = createApiServer({ STELLAR_NETWORK: 'TESTNET' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const address = server.address();
    assert.notEqual(address, null);
    assert.equal(typeof address, 'object');

    const baseUrl = `http://127.0.0.1:${address.port}`;

    for (const path of ['/health', '/stellar/network', '/non-existent']) {
      const response = await globalThis.fetch(`${baseUrl}${path}`);
      for (const [header, expectedValue] of Object.entries(BASELINE_SECURITY_HEADERS)) {
        assert.equal(
          response.headers.get(header),
          expectedValue,
          `expected header ${header} to match ${expectedValue} on ${path}`,
        );
      }
      assert.equal(
        response.headers.get('strict-transport-security'),
        null,
        `HSTS must not be enabled without an HTTPS deployment context on ${path}`,
      );
      assert.equal(
        response.headers.get('content-type'),
        'application/json',
      );
      const json = await response.json();
      assert.equal(typeof json, 'object');
    }
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test('readiness reports unavailable until a delayed initialization completes', async () => {
  let releaseInit;
  const gate = new Promise((resolve) => {
    releaseInit = resolve;
  });

  const server = createApiServer(
    { STELLAR_NETWORK: 'TESTNET' },
    {
      initialize: () => gate,
      initializationTimeoutMs: 5000,
    },
  );
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    // Readiness is unavailable during initialization.
    const during = await globalThis.fetch(`${baseUrl}/ready`);
    assert.equal(during.status, 503);
    assert.deepEqual(await during.json(), { status: 'unavailable' });

    // Liveness is always available, independent of initialization.
    const alive = await globalThis.fetch(`${baseUrl}/health`);
    assert.equal(alive.status, 200);

    // Recovery: readiness flips to ready once initialization completes.
    releaseInit();
    await gate;
    await new Promise((resolve) => setImmediate(resolve));

    const after = await globalThis.fetch(`${baseUrl}/ready`);
    assert.equal(after.status, 200);
    assert.deepEqual(await after.json(), { status: 'ready' });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test('readiness stays unavailable and does not expose internal error details on failure', async () => {
  const server = createApiServer(
    { STELLAR_NETWORK: 'TESTNET' },
    {
      initialize: () =>
        Promise.reject(new Error('secret C:\\internal\\path bootstrap')),
      initializationTimeoutMs: 5000,
    },
  );
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    // Let the initialization rejection settle.
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    const ready = await globalThis.fetch(`${baseUrl}/ready`);
    assert.equal(ready.status, 503);
    const payload = await ready.json();
    assert.deepEqual(payload, { status: 'unavailable' });
    assert.doesNotMatch(JSON.stringify(payload), /secret|internal|path/i);

    // Liveness still responds; no internal details leak there either.
    const alive = await globalThis.fetch(`${baseUrl}/health`);
    assert.equal(alive.status, 200);
    assert.deepEqual(await alive.json(), { status: 'ok' });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test('readiness fails within the bounded initialization timeout', async () => {
  const server = createApiServer(
    { STELLAR_NETWORK: 'TESTNET' },
    {
      initialize: () => new Promise(() => {}), // never settles
      initializationTimeoutMs: 50,
    },
  );
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    // The liveness probe answers immediately regardless.
    const alive = await globalThis.fetch(`${baseUrl}/health`);
    assert.equal(alive.status, 200);

    // Wait beyond the configured bound, then readiness must be 503.
    await new Promise((resolve) => setTimeout(resolve, 150));

    const ready = await globalThis.fetch(`${baseUrl}/ready`);
    assert.equal(ready.status, 503);
    assert.deepEqual(await ready.json(), { status: 'unavailable' });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test('ready route rejects invalid HTTP methods', async () => {
  const server = createApiServer({ STELLAR_NETWORK: 'TESTNET' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const response = await globalThis.fetch(`${baseUrl}/ready`, { method });
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: 'not_found' });
    }
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});