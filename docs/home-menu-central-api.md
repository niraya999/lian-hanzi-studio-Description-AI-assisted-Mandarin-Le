# Home Menu — GitHub JSON + private Google Drive

## Implemented
The public `home-menu-config.json` stores only Google Drive file IDs and x/y image positions. The Home page reads the JSON and uses the existing Google Drive OAuth **drive.readonly** bridge to fetch images. Without Drive access, default card art remains. No image binary or token is committed to GitHub.

## Updating images
1. Upload the image to a private Google Drive location, and grant read access to intended viewers.
2. Copy its file ID from its Google Drive URL.
3. On a Home card select ⋮, enter the ID and positions, then copy the generated JSON entry.
4. Select Edit config on GitHub and paste the entry into the `menus` object; commit via GitHub. Only users with repository write access can save.
5. Once GitHub Pages deploys, reconnect Google Drive and reload Home to see the new image.

## Security boundaries
- The ⋮ helper is **visible to everyone**. It does not confer editing privileges. GitHub repository permissions protect writes; this is not an in-app admin-only control.
- A file ID is not an access token; Google Drive ACLs govern image reads. Clones of the repository do not grant Drive access.
- Existing authorized browsers can retain cached or downloaded image copies. Revocation cannot retroactively erase those.
- The JSON and file IDs are public. Avoid storing secrets or personally identifying file names in the repository.
- No server, GitHub token, or new OAuth scope is required. In-app one-click Save and strict admin-only ⋮ would require a separate secure GitHub OAuth authorization flow or backend.
- New Home cards with stable IDs receive the same ⋮ helper automatically. Their IDs can be added to JSON by authorized GitHub collaborators.
- Images must be supported by the current Drive OAuth identity. Do not make images public to work around missing permissions.

## Acceptance
- Public user with no Drive connection sees default art.
- Drive account without file access sees default art.
- Drive account with file access sees configured image.
- Repository non-writer cannot commit changes through GitHub.
- Writer updates JSON, GitHub Pages deploys, then viewers reload to see changes.
- No GitHub credentials stored in frontend.
