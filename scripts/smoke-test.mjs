// API smoke test. Run against a running server:  npm run test:smoke
// With LiveKit configured it exercises the full room + token flow;
// without it, it checks that the server reports the missing config cleanly.
const BASE_URL = process.env.TEST_URL || 'http://localhost:3001';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function call(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json' },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const health = await call('/api/health');
assert(health.status === 200 && health.body.ok, 'Health check failed');

if (!health.body.livekit) {
  const create = await call('/api/rooms', { method: 'POST', body: '{}' });
  assert(create.status === 503, `Expected 503 without LiveKit config, got ${create.status}`);
  console.log('Smoke test passed (LiveKit not configured): health OK, room creation reports missing config.');
  process.exit(0);
}

const create = await call('/api/rooms', { method: 'POST', body: JSON.stringify({ title: '  Smoke   test ' }) });
assert(create.status === 201 && /^[a-z0-9]{8}$/.test(create.body.id), `Room creation failed: ${JSON.stringify(create)}`);
assert(create.body.title === 'Smoke test', 'Room title was not cleaned');

const info = await call(`/api/rooms/${create.body.id}`);
assert(info.status === 200 && info.body.title === 'Smoke test', `Room lookup failed: ${JSON.stringify(info)}`);

const missing = await call('/api/rooms/zzzzzzzz');
assert(missing.status === 404, `Expected 404 for unknown room, got ${missing.status}`);

const badCode = await call('/api/rooms/NOT-A-CODE');
assert(badCode.status === 404, `Expected 404 for malformed code, got ${badCode.status}`);

const noName = await call(`/api/rooms/${create.body.id}/token`, { method: 'POST', body: JSON.stringify({ name: '  ' }) });
assert(noName.status === 400, `Expected 400 without a name, got ${noName.status}`);

const token = await call(`/api/rooms/${create.body.id}/token`, { method: 'POST', body: JSON.stringify({ name: 'Smoke Tester' }) });
assert(token.status === 200 && token.body.token && token.body.url, `Token request failed: ${JSON.stringify(token)}`);

const claims = JSON.parse(Buffer.from(token.body.token.split('.')[1], 'base64url').toString());
assert(claims.video?.room === create.body.id && claims.video?.roomJoin, 'Token is not scoped to the room');
assert(!claims.video?.canPublishSources?.includes('camera'), 'Token should not allow camera publishing');
assert(claims.name === 'Smoke Tester', 'Token is missing the display name');

const withCreator = await call('/api/rooms', { method: 'POST', body: JSON.stringify({ title: 'Creator', name: 'Host' }) });
assert(withCreator.status === 201 && withCreator.body.join?.token, 'Room creation with a name should return the creator token');
const creatorClaims = JSON.parse(Buffer.from(withCreator.body.join.token.split('.')[1], 'base64url').toString());
assert(creatorClaims.video?.room === withCreator.body.id, 'Creator token is not scoped to the new room');

console.log(`Smoke test passed: rooms ${create.body.id} and ${withCreator.body.id} created, looked up, and scoped join tokens issued.`);
