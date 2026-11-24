const CLIENT_ID = '405638478714-hikhdrp7r0ebg35an8asc41guqc014ep.apps.googleusercontent.com';
const READ_ONLY = 'https://www.googleapis.com/auth/drive.readonly';
const SESSION_KEY = 'lhs.drive.session.v1';

/** Session-only credentials: the host LHS session can be reused in the same tab. */
export function createDriveAuthorization({ gis = () => globalThis.google?.accounts?.oauth2, fetchImpl = fetch, sessionStorage = globalThis.sessionStorage } = {}) {
  let current = null;
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
    let saved;
    try { saved = JSON.parse(sessionStorage?.getItem(SESSION_KEY) || 'null'); } catch { saved = null; }
    if (saved?.token && saved.expires > Date.now() + 60000) {
      current = await identify(saved.token, saved.expires);
      return current;
    }
    const e = new Error('Connect Google Drive to view this book.'); e.code = 'AUTH_REQUIRED'; throw e;
  }
  function connect() {
    return new Promise((resolve, reject) => {
      const oauth = gis();
      if (!oauth) return reject(new Error('Google sign-in is unavailable. Check your connection and retry.'));
      let done = false;
      const finish = (error, value) => { if (done) return; done = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
      const timer = setTimeout(() => finish(new Error('Google sign-in did not complete. Please retry.')), 60000);
      try {
        const client = oauth.initTokenClient({ client_id: CLIENT_ID, scope: READ_ONLY, include_granted_scopes: false, login_hint: 'martin@installindonesia.org', callback: async response => {
          if (response.error || !response.access_token) return finish(new Error('Google Drive sign-in was cancelled or denied.'));
          try {
            const expires = Date.now() + Number(response.expires_in || 3600) * 1000;
            current = await identify(response.access_token, expires);
            if (current.email && current.email.toLowerCase() !== 'martin@installindonesia.org') { current = null; return finish(new Error('Please choose martin@installindonesia.org.')); }
            finish(null, current);
          } catch (e) { finish(e); }
        }, error_callback: () => finish(new Error('Google sign-in did not complete. Please retry.')) });
        client.requestAccessToken({ prompt: 'select_account' });
      } catch (e) { finish(e); }
    });
  }
  return { connect, getAccessToken, clear() { current = null; } };
}
