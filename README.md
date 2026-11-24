# Lian Hanzi Studio

Lian Hanzi Studio is a static, mobile-first PWA for Music, Mandarin learning, and the Buddhist Content Studio (BCS).

## BCS integration

- BCS is an internal navigation module in `bcs/bcs-native.js`; it is not an external launcher or iframe.
- The BCS Google Drive root is `16E4O7n0oVTVOXqXg4ff_Vz6TxK-qdJv1`, also used by the existing LHS read-only Buddhist Drive catalog.
- BCS project drafts are stored in this browser's local storage. They do not sync to the original BCS backend or Drive.
- TikTok scheduling/publishing is unavailable because the published BCS showed its TikTok API as not connected.
- See [BCS inspection and recovery notes](bcs/README.md) for recovered behavior, reconstruction boundaries, and verification status.

## Existing features

Music Library, Suno player, Mandarin reader/learning, and device settings remain in the existing single-page application. The PWA service worker pre-caches the native BCS module for offline access.

## Universal Audio Recording Engine

- Recording is available only for authorized MP3 files loaded into LHS's native player. Suno embeds and restricted sources are not captured.
- Audio is tapped from the native player through Web Audio and encoded as MP3 in a dedicated Web Worker. LAME-compatible encoder files are bundled locally; no recording service or audio backend is used.
- Generated MP3s are saved into the existing `lhs-mp3-cache-v1` IndexedDB store with their track folder, duration, bitrate, source type, file size, and creation time. Ready recordings are protected from automatic LRU eviction and appear in the existing manual MP3 Sync Queue.
- Drive upload remains manual. Existing MP3 files block upload; the cache entry is deleted only after the uploaded `song.mp3` is verified in its destination folder.
- The bundled `@breezystack/lamejs` 1.2.7 encoder is distributed under LGPL-3.0. The unmodified bundle and license text are in `vendor/audio/`.
- Tests: `node --test tests/audio-recording-engine.test.mjs`, `python3 -m unittest discover -s tests -p 'test_*.py'`, and the Playwright synthetic audio smoke test in `scripts/recording-browser-smoke.cjs`.
