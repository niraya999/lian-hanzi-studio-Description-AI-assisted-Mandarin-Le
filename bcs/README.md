# BCS inspection and source recovery

## Published application observed

Inspected the authenticated public site at Buddhist Content Studio. The screen identified itself as “Buddhist CONTENT STUDIO” and exposed these primary navigation controls: Studio, Calendar, Asset library, Sources, and Connected accounts. It showed a Google Drive hybrid-storage note and a Creator workspace.

The Studio view included:

- Content pipeline: TikTok connection status, Import from Drive, New content.
- Counters: Active projects, Ready for TikTok, Assets missing, Next draft upload.
- Five visible projects: Maitreya, Orange Tara, Medicine Tara, Red Tara, Green Tara.
- Project canvas for Maitreya: Source & context, Raw visuals, Main character, 9:16 Video teaser, Music & lyrics, Music video, TikTok inbox.
- Eight required project fields: Raw image, Realistic image, Video teaser 9:16, Music lyrics, Music MP3, Music video clip, TikTok summary, News / reference source.
- Save draft and Schedule draft upload controls. Scheduling was disabled until required assets were complete. TikTok displayed “Not connected” and “API NOT CONNECTED”.
- Existing Green Tara card displayed an 88% asset indicator and a Google Drive thumbnail.

Calendar, Asset library, Sources, Connected accounts, Import from Drive, New content, and individual project interactions were not confirmed end-to-end. Clicking the four top-level navigation buttons left the visible Studio screen unchanged during inspection. Private records, user content values, and backend behavior were not inferred.

## Source recovery assessment

The rendered BCS page exposed a Next/Vinext-style React runtime marker, a Google Identity client script, a hashed stylesheet, and a dynamically imported hashed JavaScript bundle path. Directly opening the bundle was blocked in the inspection browser. No original repository/source map or backend was made available. Therefore:

- **Recovered original source:** none.
- **Recovered from observable behavior:** screen layout, visible field labels, project names, status copy, and available menu labels.
- **Unavailable/unverified:** original frontend source code, private project data, backend database/API, Drive picker behavior, write/sync semantics, calendar contents, TikTok OAuth/API implementation, and credentials.
- No API keys, access tokens, or credentials were copied into this repository.

## Native reconstruction

The LHS implementation adds a native BCS tab and replaces the old external launcher. It is a reconstruction under `bcs/bcs-native.js`, not recovered BCS source. The current module provides Studio, Calendar, Asset library, Sources, and Connected accounts views, a project editor for the eight observed fields, project creation, filtering, and device-local draft saving.

The module reuses LHS's existing read-only Buddhist Drive catalog, which is configured to the same BCS root folder. This does not upload, move, delete, or edit source Drive files. Project fields accept links or text references; selecting Drive files into fields is not implemented.

## Screens inspected

1. Published BCS Studio: dashboard with five project cards and Maitreya editor.
2. LHS published Apps screen: Lian Universe Hub card and external BCS launcher before integration.
3. LHS Music Library screen: Music/Buddhist source switch, Google Drive connection controls, and existing bottom navigation.

Screenshots were inspected in the browser session; they are not committed as image files in this branch.

## Verification and release readiness

- GitHub Actions preview build and browser smoke tests passed through commit `07a0701`.
- Chromium mobile (390 × 844): five BCS views, project creation, asset reference editing, local draft persistence after reload, and LHS Library/Learn/Settings navigation passed.
- Chromium desktop (1440 × 900): native BCS tab opens without navigating to the external BCS website.
- Browser screenshots are uploaded as GitHub Actions artifacts for review.
- JavaScript syntax, static integration checks, and preview packaging passed.
- Service worker BCS script URL and page script version were aligned in commit `3811db9`; that new commit still requires CI confirmation.
- Google Drive OAuth, actual Drive browsing with a signed-in account, Music playback, Android hardware, and service worker upgrade behavior are **not yet verified end-to-end**.
- The BCS module is a local-draft reconstruction, not the original application/backend. There is no cross-device project sync or TikTok scheduling/publishing.
- Production acceptance requires explicit approval of these limitations and a post-deployment smoke test. Keep this PR in Draft until that decision.
