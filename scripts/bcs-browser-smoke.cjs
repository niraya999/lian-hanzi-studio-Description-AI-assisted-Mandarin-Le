const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded' });
    await page.locator('nav [data-tab="bcs"]').click();
    await page.locator('#bcsRoot [data-view="Studio"]').waitFor();
    for (const section of ['Studio', 'Calendar', 'Asset library', 'Sources', 'Connected accounts']) {
      await page.locator('#bcsRoot [data-view="' + section + '"]').click();
      assert.equal(await page.locator('#bcsRoot [data-view="' + section + '"]').getAttribute('aria-selected'), 'true');
    }
    await page.locator('#bcsRoot [data-view="Studio"]').click();
    assert.equal(await page.locator('#bcs').isVisible(), true);
    page.once('dialog', dialog => dialog.accept('Smoke Test Project'));
    await page.locator('#bcsRoot [data-action="new"]').first().click();
    await page.getByText('Smoke Test Project', { exact: true }).first().waitFor();
    await page.locator('#bcsRoot [data-field="rawImage"]').fill('https://example.com/image');
    await page.locator('#bcsRoot [data-action="save"]').click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('nav [data-tab="bcs"]').click();
    await page.locator('#bcsRoot [data-project]').filter({ hasText: 'Smoke Test Project' }).click();
    assert.equal(await page.locator('#bcsRoot [data-field="rawImage"]').inputValue(), 'https://example.com/image');
    for (const tab of ['library', 'learn', 'settings', 'bcs']) {
      await page.locator('nav [data-tab="' + tab + '"]').click();
      assert.equal(await page.locator('#' + tab).isVisible(), true, tab + ' must be visible');
    }
    assert.deepEqual(errors, [], 'Unexpected browser errors');
    await page.screenshot({ path: '/tmp/lhs-bcs-mobile.png', fullPage: true });
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const navigations = [];
    desktop.on('framenavigated', frame => {
      if (frame === desktop.mainFrame()) navigations.push(frame.url());
    });
    await desktop.goto('http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded' });
    await desktop.locator('nav [data-tab="bcs"]').click();
    assert.equal(await desktop.locator('#bcs').isVisible(), true, 'Desktop BCS must be visible');
    assert.equal(await desktop.locator('#bcsRoot [data-view="Studio"]').getAttribute('aria-selected'), 'true');
    assert.ok(navigations.every(url => !url.includes('buddhist-content-studio.mrtnhasen.chatgpt.site')), 'BCS must remain inside LHS');
    await desktop.screenshot({ path: '/tmp/lhs-bcs-desktop.png', fullPage: true });

    console.log('Mobile and desktop BCS navigation smoke tests passed');
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
