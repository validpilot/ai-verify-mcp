const test = require('node:test');
const assert = require('node:assert/strict');

const { getBackendProbeEndpoints, isCloudApiProbeTarget } = require('../server');

test('cloud-api targets use /v1 probe endpoints instead of /api/v1 defaults', () => {
  const endpoints = getBackendProbeEndpoints('http://192.168.8.4:3001/health');

  assert.deepEqual(endpoints, [
    '/health',
    '/v1/auth/me',
    '/v1/quota',
    '/v1/subscriptions/current'
  ]);
  assert.equal(endpoints.some(endpoint => endpoint.startsWith('/api/v1')), false);
});

test('cloud-api profile hint uses /v1 probe endpoints', () => {
  const endpoints = getBackendProbeEndpoints('http://example.com', { profile: 'cloud-api' });

  assert.equal(endpoints.includes('/v1/auth/me'), true);
  assert.equal(endpoints.includes('/api/v1/identity/me'), false);
});

test('non cloud-api targets keep generic /api/v1 probe endpoints', () => {
  const endpoints = getBackendProbeEndpoints('http://192.168.8.4:5173');

  assert.equal(endpoints.includes('/api/v1/identity/me'), true);
  assert.equal(endpoints.includes('/v1/auth/me'), false);
});

test('cloud-api target detection supports port and service hints', () => {
  assert.equal(isCloudApiProbeTarget('http://localhost:3001'), true);
  assert.equal(isCloudApiProbeTarget('http://example.com', { service: 'cloud_api' }), true);
  assert.equal(isCloudApiProbeTarget('http://192.168.8.4:5173'), false);
});
