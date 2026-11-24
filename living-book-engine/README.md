# The Living Book Engine — Phase 1

A self-contained, static browser reader intended to be embedded into Lian Hanzi Studio later. It uses native HTML, CSS, JavaScript modules, and IndexedDB; it has no backend, paid API, or runtime package dependency.

## Run the preview locally

From this folder, start any static HTTP server, for example:

```sh
python3 -m http.server 4173
```

Open `http://localhost:4173`. IndexedDB is isolated by origin and browser profile, so reading progress and bookmarks stay on the current device/browser.

## Content model

`book-manifest.json` owns book metadata, chapter/page order, localized text, illustration references, and audio slots. Chapters and pages are not linked to music tracks. `playlists` and `tracks` are independent manifest collections. Audio slots are placeholders for Phase 2. The story and illustrations are original sample preview content, not official Lian Universe canon.

## Controls

- Open the cover, then use the arrow buttons or keyboard arrows to turn pages.
- Use the layout control to switch between one-page portrait and two-page spread.
- Swipe horizontally on touch devices.
- Save multiple bookmarks, jump to a saved bookmark, close the reader, and resume later.
- Choose English, Bahasa Indonesia, or Traditional Chinese.
- Respect the browser's reduced-motion preference.

## Tests

Run `node --test tests/engine.test.mjs` from this directory. Tests cover opening, page navigation, the end-book state and restart, independent bookmarks, auto resume, and portrait/spread layout behavior.

The engine API in `engine.mjs` is UI-agnostic and accepts a storage adapter. `storage.mjs` supplies the browser IndexedDB adapter. The reader is static and can be copied into a future LHS route without changing the existing app shell.
