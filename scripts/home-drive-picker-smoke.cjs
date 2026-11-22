const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: 'block'
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route('https://accounts.google.com/gsi/client', route => route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: ''
    }));
    await page.route('https://www.googleapis.com/drive/v3/**', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ files: [] })
    }));
    await page.addInitScript(() => {
      window.__oauthRequests = [];
      window.__installMockGIS = () => {
        window.google = { accounts: { oauth2: {
          initTokenClient: config => ({
            requestAccessToken: () => window.__oauthRequests.push(config)
          })
        } } };
      };
    });

    await page.goto('http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded' });
    const settings = page.locator('.hub-card-dialog');
    await page.locator('#hub .hub-card-more').first().click();
    await settings.waitFor({ state: 'visible' });
    await settings.getByText('Drive browser ready (build 12)').waitFor();

    const browse = settings.getByRole('button', { name: 'Browse Google Drive' });
    const status = settings.locator('[role="status"]');

    // GIS unavailable must be surfaced immediately and not falsely reported as connecting.
    await browse.click();
    await status.getByText(/Google Identity Services is not ready/).waitFor();
    assert.equal(await page.evaluate(() => window.__oauthRequests.length), 0);

    // A failed callback must clear pending state and leave the modal usable for retry.
    await page.evaluate(() => window.__installMockGIS());
    await browse.click();
    assert.equal(await page.evaluate(() => window.__oauthRequests.length), 1);
    await page.evaluate(() => window.__oauthRequests.shift().callback({ error: 'access_denied' }));
    await status.getByText(/cancelled or failed/).waitFor();
    assert.equal(await settings.isVisible(), true);

    // Retry succeeds, opens the Drive picker, and returning from it restores Home settings.
    await browse.click();
    assert.equal(await page.evaluate(() => window.__oauthRequests.length), 1);
    await page.evaluate(() => window.__oauthRequests.shift().callback({
      access_token: 'mock-test-token',
      expires_in: 3600
    }));
    const picker = page.locator('#driveLogoDialog');
    await picker.waitFor({ state: 'visible' });
    await page.locator('#closeDriveLogo').click();
    await settings.waitFor({ state: 'visible' });
    assert.match(await status.textContent(), /Drive picker opened|Google sign-in started|Google connected/);

    assert.deepEqual(pageErrors, [], 'Unexpected browser JavaScript errors');
    await page.screenshot({ path: '/tmp/lhs-home-drive-picker-mobile.png', fullPage: true });
    await context.close();
    console.log('Home Browse, GIS unavailable, OAuth failure/success, modal open/return, and retry passed.');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
