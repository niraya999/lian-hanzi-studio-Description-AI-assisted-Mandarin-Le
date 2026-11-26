const SESSION_KEY = 'lhs.drive.session.v1';

/** Use the LHS Drive broker; never start a second Google OAuth flow inside the reader. */
export function createDriveAuthorization({ brokerProvider = () => {
  try { return globalThis.lhsDriveBroker || (globalThis.parent !== globalThis ? globalThis.parent.lhsDriveBroker : null); }
  catch { return null; }
}, fetchImpl = fetch, sessionStorage = globalThis.sessionStorage } = {}) {
  let current = null;
  async function fromLhs() {
    const broker = brokerProvider();
    if (!broker?.getAccessToken) return null;
    try { return await broker.getAccessToken(); } catch { return null; }
  }
  function fromSessionStorage() {
    try {
      const saved = JSON.parse(sessionStorage?.getItem(SESSION_KEY) || 'null');
      return saved?.token && saved.expires > Date.now() + 60000 ? saved : null;
    } catch { return null; }
  }
  async function identify(token, expires) {
    const response = await fetchImpl('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress%2CpermissionId)', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!response.ok) { const e = new Error('Unable to identify the connected Drive account. Please reconnect.'); e.code = 'AUTH_REQUIRED'; throw e; }
    const { user } = await response.json();
    if (!user?.permissionId) throw new Error('Google Drive did not provide an account identifier.');
    return { token, expires, accountId: user.permissionId, email: user.emailAddress || '' };
  }
  async function getAccessToken() {
    if (current?.expires > Date.now() + 60000) return current;
    current = null;
    const saved = await fromLhs() || fromSessionStorage();
    if (saved?.token && saved.expires > Date.now() + 60000) {
      current = await identify(saved.token, saved.expires);
      return current;
    }
    const e = new Error('Connect Google Drive to view this book.'); e.code = 'AUTH_REQUIRED'; throw e;
  }
  function connect({ force = false } = {}) {
    const broker = brokerProvider();
    if (!broker?.requestAccessToken) {
      const e = new Error('Open The Living Book from LHS Home and connect Google Drive there.'); e.code = 'AUTH_REQUIRED';
      return Promise.reject(e);
    }
    return Promise.resolve(broker.requestAccessToken({ force })).then(async session => {
      if (!session?.token || !session?.expires) throw new Error('LHS did not return an active Google Drive session.');
      current = await identify(session.token, session.expires);
      return current;
    });
  }
  return { connect, getAccessToken, clear() { current = null; } };
}
