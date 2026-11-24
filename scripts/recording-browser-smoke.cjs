const { chromium, devices } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.LHS_CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  try {
    for (const profile of [{ name: 'desktop', viewport: { width: 1280, height: 900 } }, { name: 'mobile', ...devices['Pixel 5'] }]) {
      const context = await browser.newContext({ viewport: profile.viewport, deviceScaleFactor: profile.deviceScaleFactor || 1, isMobile: !!profile.isMobile, hasTouch: !!profile.hasTouch });
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:8765/', { waitUntil: 'networkidle' });
      await page.locator('[data-tab="settings"]').click();
      await page.locator('#recordingSettings summary').click();
      await page.locator('#enableAudioRecording').check();
      await page.locator('#rememberRecordingConsent').check();
      await page.locator('#reuseAudioCapture').uncheck();
      await page.locator('#recordingBitrate').selectOption('256');
      await page.reload({ waitUntil: 'networkidle' });
      if (!await page.locator('#enableAudioRecording').isChecked()) throw new Error(`${profile.name}: recording setting did not persist`);
      if (!await page.locator('#rememberRecordingConsent').isChecked()) throw new Error(`${profile.name}: recording consent did not persist`);
      if (await page.locator('#reuseAudioCapture').isChecked()) throw new Error(`${profile.name}: capture-session preference did not persist`);
      if (await page.locator('#recordingBitrate').inputValue() !== '256') throw new Error(`${profile.name}: bitrate preference did not persist`);
      await page.goto('http://127.0.0.1:8765/tests/audio-recording-fixture.html', { waitUntil: 'networkidle' });
      await page.locator('#start').click();
      await page.locator('#status[data-state="recording"]').waitFor({ timeout: 10000 });
      await page.waitForTimeout(400);
      await page.locator('#pause').click();
      await page.waitForTimeout(350);
      await page.locator('#resume').click();
      await page.locator('#status[data-state="ready"]').waitFor({ timeout: 20000 });
      if (await page.locator('#status').getAttribute('data-bitrate') !== '256') throw new Error(`${profile.name}: output bitrate was not 256 kbps`);
      const mp3Duration = Number(await page.locator('#status').getAttribute('data-duration'));
      if (Math.abs(mp3Duration - 2) > 0.15) throw new Error(`${profile.name}: recording duration ${mp3Duration} did not match the auto-stop boundary`);
      const previewDuration = await page.locator('#preview').evaluate(async (audio) => new Promise((resolve, reject) => { if (Number.isFinite(audio.duration)) return resolve(audio.duration); audio.addEventListener('loadedmetadata', () => resolve(audio.duration), { once: true }); audio.addEventListener('error', () => reject(Error('Encoded MP3 cannot be decoded by the browser.')), { once: true }); }));
      if (!Number.isFinite(previewDuration) || previewDuration < 1.8 || previewDuration > 2.3) throw new Error(`${profile.name}: MP3 playback duration ${previewDuration} is invalid`);
      if (await page.locator('#autoNext').isDisabled()) throw new Error(`${profile.name}: Auto Next remained disabled after recording`);
      const mp3Bytes = await page.evaluate(async () => Array.from(new Uint8Array(await window.__lastEncoded.arrayBuffer())));
      await page.goto('http://127.0.0.1:8765/', { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!window.lhsMp3Cache);
      const queued = await page.evaluate(async (bytes) => window.lhsMp3Cache.putRecording({
        blob: new Blob([Uint8Array.from(bytes)], { type: 'audio/mpeg' }), trackId: 'synthetic-track-id', folderId: 'synthetic-folder-id',
        trackName: 'Synthetic Track 01', sourceType: 'authorized-native-audio', duration: 2, bitrate: 256, createdAt: new Date().toISOString()
      }), mp3Bytes);
      if (!queued) throw new Error(`${profile.name}: encoded MP3 did not enter persistent cache`);
      await page.locator('#settings').waitFor();
      await page.locator('nav [data-tab="settings"]').click();
      await page.locator('#settings details.settings-group:has(#musicAutoSync) > summary').click();
      await page.locator('#mp3SyncQueue').getByText(/Synthetic Track 01/).waitFor();
      await page.reload({ waitUntil: 'networkidle' });
      await page.locator('nav [data-tab="settings"]').click();
      await page.locator('#settings details.settings-group:has(#musicAutoSync) > summary').click();
      await page.locator('#mp3SyncQueue').getByText(/Synthetic Track 01.*02:00.*256 kbps/).waitFor();
      await page.locator('#mp3SyncQueue').getByRole('button', { name: 'Sync MP3' }).waitFor();
      await context.close();
      console.log(`${profile.name}: settings persistence, pause/resume, 256 kbps MP3 decode, 2-second boundary, Auto Next recovery, IndexedDB queue reload PASS`);
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
