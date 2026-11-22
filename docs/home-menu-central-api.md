# Home Menu Inline Configuration — centralized contract

## Status
Frontend implementation in PR #6. **NOT production-ready** until the authenticated backend is deployed at the same origin. This repository is GitHub Pages static content and cannot enforce administrator privileges or persist shared uploads by itself.

## Endpoint contract
All endpoints must be served by a trusted backend at https://lhs.installindonesia.org/api/home-menu. Never expose cloud storage credentials or admin API keys to the browser.

- GET /api/home-menu → 200 JSON: {"canEdit":false,"items":{"openMusicApp":{"imageUrl":"/api/home-menu/images/opaque-id.webp","x":50,"y":50}}}. For authenticated admin, canEdit true. For anonymous users, canEdit false. The response must use Cache-Control: private, no-store because it contains an authorization-dependent flag.
- PUT /api/home-menu/:menuId → multipart/form-data image (optional), x, y. Admin session required, return 200 with saved {imageUrl,x,y}. Existing image retained if no file is uploaded. Validate ID against the server-side allowlist of menu IDs, x/y integer 0–100, MIME by file signature, max 5MB, decode image safely and re-encode to a safe image format, generate opaque image identifiers. Protect with CSRF token or same-site Origin verification and SameSite session cookies.
- DELETE /api/home-menu/:menuId → admin session required, returns 204; removes custom image and restores default.
- GET /api/home-menu/images/:opaqueId → serve images from durable object storage with appropriate Content-Type, X-Content-Type-Options: nosniff and caching headers. Never expose arbitrary file paths.

## Security and storage
- Verify the user session and admin role **on the server**, not merely by hiding the ⋮ button.
- Session authentication must use an existing identity provider (e.g. OIDC) with server-side allowlist/role checks. No hardcoded admin email in JavaScript.
- Store image objects in private durable storage and metadata {menu_id,object_key,x,y,updated_at,updated_by} in a durable database. Use backups and audit logging.
- For GitHub Pages deployment, route /api/* to a separate backend behind a reverse proxy or move the frontend to a hosting platform that supports that route. GitHub Pages itself cannot proxy /api/*.
- Browser's built-in HTTP cache may cache the public image endpoint. On update, generate a new opaque image URL.
- In the absence of a configured backend, all Home cards continue to work with default artwork and no edit buttons.

## Acceptance checks
1. Anonymous user sees default/shared images, no ⋮, and receives 403 on PUT/DELETE.
2. Authenticated non-admin sees shared images, no ⋮, and receives 403 on PUT/DELETE.
3. Authenticated admin sees ⋮ on all cards, uploads image and adjusts position; update appears in a second browser after reload.
4. Reset restores default across devices.
5. Reject oversized/malformed files, invalid menu IDs, cross-site writes and unsupported content types.
6. New card with a stable ID automatically receives ⋮ when admin; server must authorize the new ID before saving.
7. Failed backend requests never silently fall back to local-only settings.
