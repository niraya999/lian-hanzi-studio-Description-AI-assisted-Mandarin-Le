const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded' });
    // Verify the actual Home gear Browse click handler runs on mobile, without Google OAuth.
    await page.locator('#hub .hub-card-more').first().click();
    await page.locator('.hub-card-dialog').getByText('Drive browser ready (build 10)').waitFor();
    await page.locator('.hub-card-dialog').getByRole('button', { name: 'Browse Google Drive' }).click();
    await page.locator('.hub-card-dialog [role="status"]').getByText(/Connecting Google Drive|Drive picker unavailable|Opening Google Drive/).waitFor();
    await page.locator('.hub-card-dialog').getByRole('button', { name: 'Close' }).click();
    await page.locator('nav [data-tab="bcs"]').click();
    await page.locator('#bcsGallery').waitFor();
    assert.equal(await page.locator('#bcsGallery').isVisible(), true);
    await page.locator('#bcsGallery').getByRole('button', { name: 'Studio editor' }).click();
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
    await page.locator('#bcsGallery').getByRole('button', { name: 'Studio editor' }).click();
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
    assert.equal(await desktop.locator('#bcsGallery').isVisible(), true, 'Desktop deity gallery must be visible');
    assert.ok(navigations.every(url => !url.includes('buddhist-content-studio.mrtnhasen.chatgpt.site')), 'BCS must remain inside LHS');
    // Mock read-only Drive data: deterministic UI coverage without external OAuth.
    await desktop.evaluate(() => {
      const folders = {
        root: [{id:'tara',name:'Green Tara',mimeType:'application/vnd.google-apps.folder'},{id:'testing',name:'Testing',mimeType:'application/vnd.google-apps.folder'},{id:'nestedDeity',name:'Nested Deity',mimeType:'application/vnd.google-apps.folder'}],
        tara: [
          {id:'image1',name:'cover.png',mimeType:'image/png'},
          {id:'video1',name:'teaser.mp4',mimeType:'video/mp4'},
          {id:'text1',name:'notes.txt',mimeType:'text/plain'},
          {id:'nested',name:'Research',mimeType:'application/vnd.google-apps.folder'}
        ],
        nested: [{id:'note2',name:'detail.txt',mimeType:'text/plain'}],
        nestedDeity: [{id:'artFolder',name:'Images',mimeType:'application/vnd.google-apps.folder'}],
        artFolder: [{id:'nestedImage',name:'artwork.svg',mimeType:'image/svg+xml'}]
      };
      window.lhsBcsDrive.connected = () => true;
      window.lhsBcsDrive.identity = async () => 'smoke@example.com';
      window.__bcsBlobCalls = 0;
      window.lhsBcsDrive.list = async id => folders[id === '16E4O7n0oVTVOXqXg4ff_Vz6TxK-qdJv1' ? 'root' : id] || [];
      window.lhsBcsDrive.blob = async id => { window.__bcsBlobCalls++; return id === 'text1' ? new Blob(['Tara research notes'], {type:'text/plain'}) : new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="green"/></svg>'], {type:'image/svg+xml'}); };
      window.lhsBcsGallery.refresh();
    });
    assert.equal(await desktop.getByRole('button', { name: 'Testing' }).count(), 0, 'Non-deity collections must be excluded');
    await desktop.locator('#bcsGallery .dg-cover img').first().waitFor();
    await desktop.getByRole('button', { name: 'Nested Deity' }).locator('img').waitFor();
    // Cache must survive a gallery refresh without downloading artwork again.
    const beforeRefresh = await desktop.evaluate(() => window.__bcsBlobCalls);
    await desktop.evaluate(() => window.lhsBcsGallery.refresh());
    await desktop.locator('#bcsGallery .dg-cover img').first().waitFor();
    const afterRefresh = await desktop.evaluate(() => window.__bcsBlobCalls);
    assert.equal(afterRefresh, beforeRefresh, 'Thumbnail cache should avoid repeat Drive blob download');
    // Simulate OAuth success notification: gallery must refresh without a manual click.
    await desktop.evaluate(() => {
      window.lhsBcsDrive.list = async id => id === '16E4O7n0oVTVOXqXg4ff_Vz6TxK-qdJv1'
        ? [{id:'tara',name:'Green Tara',mimeType:'application/vnd.google-apps.folder'},{id:'maitreya',name:'Maitreya',mimeType:'application/vnd.google-apps.folder'}]
        : id === 'tara' ? [
          {id:'image1',name:'cover.png',mimeType:'image/png'},
          {id:'video1',name:'teaser.mp4',mimeType:'video/mp4'},
          {id:'text1',name:'notes.txt',mimeType:'text/plain'},
          {id:'nested',name:'Research',mimeType:'application/vnd.google-apps.folder'}
        ] : id === 'nested' ? [{id:'note2',name:'detail.txt',mimeType:'text/plain'}] : [];
      window.dispatchEvent(new Event('lhs-drive-connected'));
    });
    await desktop.getByRole('button', { name: 'Maitreya' }).waitFor();
    await desktop.getByRole('button', { name: 'Green Tara' }).click();
    for (const heading of ['Images (1)','Videos (1)','Text & documents (1)','Folders (1)']) {
      await desktop.locator('#bcsGallery').getByRole('heading', { name: heading }).waitFor();
    }
    await desktop.getByRole('button', { name: 'notes.txt' }).click();
    await desktop.getByText('Tara research notes').waitFor();
    await desktop.getByRole('button', { name: 'Back to Green Tara' }).click();
    await desktop.getByRole('button', { name: 'Research' }).click();
    await desktop.getByRole('button', { name: 'detail.txt' }).waitFor();
    await desktop.getByRole('button', { name: 'All deities' }).click();
    await desktop.getByRole('button', { name: 'Green Tara' }).waitFor();
    await desktop.screenshot({ path: '/tmp/lhs-bcs-desktop.png', fullPage: true });

    console.log('Mobile and desktop BCS navigation smoke tests passed');
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
