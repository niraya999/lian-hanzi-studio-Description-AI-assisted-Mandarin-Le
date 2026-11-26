import test from 'node:test';
import assert from 'node:assert/strict';
import { createDriveAuthorization } from '../drive-auth.mjs';

const expires = () => Date.now() + 60 * 60 * 1000;
const response = async (_url, options) => {
  assert.match(options.headers.Authorization, /^Bearer /);
  return Response.json({ user: { permissionId: 'lhs-account', emailAddress: 'martin@installindonesia.org' } });
};
const storage = initial => {
  const values = new Map(initial ? [['lhs.drive.session.v1', JSON.stringify(initial)]] : []);
  return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};

test('reader reuses the active LHS Drive token and account identity', async () => {
  const session = { token: 'lhs-token', expires: expires() };
  const auth = createDriveAuthorization({ brokerProvider: () => ({ getAccessToken: async () => session }), fetchImpl: response, sessionStorage: storage() });
  assert.deepEqual(await auth.getAccessToken(), { ...session, accountId: 'lhs-account', email: 'martin@installindonesia.org' });
});

test('reader requests access through the LHS broker only', async () => {
  let requests = 0;
  const session = { token: 'new-lhs-token', expires: expires() };
  const auth = createDriveAuthorization({ brokerProvider: () => ({ getAccessToken: async () => { throw new Error('not connected'); }, requestAccessToken: async () => { requests++; return session; } }), fetchImpl: response, sessionStorage: storage() });
  assert.equal((await auth.connect()).token, 'new-lhs-token');
  assert.equal(requests, 1);
});

test('reader can reuse the existing same-tab LHS session when the broker is unavailable', async () => {
  const session = { token: 'same-tab-token', expires: expires() };
  const auth = createDriveAuthorization({ brokerProvider: () => null, fetchImpl: response, sessionStorage: storage(session) });
  assert.equal((await auth.getAccessToken()).token, session.token);
});

test('reader never starts a separate Google OAuth request without the LHS broker', async () => {
  const auth = createDriveAuthorization({ brokerProvider: () => null, fetchImpl: response, sessionStorage: storage() });
  await assert.rejects(auth.connect(), /Open The Living Book from LHS Home/);
});
