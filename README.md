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
