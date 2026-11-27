import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGoogleDocument } from '../chapter-document.mjs';

test('Google Docs 403 preserves account identity and API reason for recovery UI', async () => {
  const session = { token: 'test-token', expires: Date.now() + 60_000, email: 'martin@installindonesia.org' };
  const fetchImpl = async () => Response.json({
    error: {
      code: 403,
      message: 'The caller does not have permission',
      errors: [{ reason: 'insufficientFilePermissions' }]
    }
  }, { status: 403 });

  await assert.rejects(
    loadGoogleDocument({ documentId: 'approved-doc', getAccessToken: async () => session, fetchImpl }),
    error => error.code === 'AUTH_REQUIRED'
      && error.status === 403
      && error.accountEmail === 'martin@installindonesia.org'
      && error.driveReason === 'insufficientFilePermissions'
      && error.driveMessage === 'The caller does not have permission'
  );
});

test('Google Docs 401 is reported as an expired or rejected access token', async () => {
  await assert.rejects(
    loadGoogleDocument({
      documentId: 'approved-doc',
      getAccessToken: async () => ({ token: 'test-token' }),
      fetchImpl: async () => new Response('', { status: 401 })
    }),
    error => error.code === 'AUTH_REQUIRED' && error.status === 401 && /expired or was rejected/.test(error.message)
  );
});
