# ipa's — GitHub Pages download site

A dark, responsive IPA download catalog. Plain HTML, CSS, and JavaScript: no build step, dependencies, server, or API keys.

## Set it up

1. Create a **public** repository for your IPA files, for example `ipas`.
2. Put your `.ipa` files in that repository (any folder is fine), or attach them to **published GitHub Releases** in that repository.
3. Extract this ZIP. Upload the **contents** of `ipa-download-site` into the root of your separate website repository. `index.html` must be at the root, not inside another `ipa-download-site` folder.
4. Edit `config.js`:

   ```js
   owner: "YOUR-GITHUB-USERNAME",
   repo: "ipas",
   ```

   Use the exact account and repository slug from `https://github.com/ACCOUNT/REPOSITORY`. The website can be called **ipa's**, but GitHub repository slugs cannot contain an apostrophe. If your repo URL ends in `ipa-s`, set `repo: "ipa-s"` instead.

   You may leave `owner` empty on a standard `https://ACCOUNT.github.io` domain if both repositories belong to that account. Set it explicitly for custom domains or a different account.

5. In the **website** repository, open **Settings → Pages → Build and deployment**. Choose **Deploy from a branch**, select your branch (usually `main`) and **/(root)**, then save. Keep `.nojekyll` in the root if using Git to upload; the site also works with GitHub's default Jekyll publishing when uploading through the web interface.
6. Open the Pages address that GitHub shows. New IPA files appear when the collection is loaded again. **Refresh** bypasses the five-minute session cache.

Your IPA repository does **not** need Pages enabled. The files stay in that repository; the website only lists them and links to GitHub downloads.

## Configuration

| Setting | Default | Purpose |
| --- | --- | --- |
| `owner` | `""` | GitHub user or organization; empty detects it from `ACCOUNT.github.io`. |
| `repo` | `"ipas"` | Exact public IPA repository name. |
| `branch` | `""` | Default branch when empty; can also be a branch, tag, or commit SHA. |
| `folder` | `""` | Scan all folders, or use a path like `apps/ios`. Applies only to committed files. |
| `source` | `"both"` | `"repository"`, `"releases"`, or `"both"`. |
| `title` | `"ipa's"` | Name shown in the header, footer, and browser tab. |

## Uploading larger apps

GitHub's web file uploader allows files up to **25 MiB**. Regular Git commits cannot contain files larger than **100 MiB**. For larger IPAs, create a release in the IPA repository and attach the actual `.ipa` files. The default configuration includes published release attachments automatically. See the linked GitHub documentation for release attachment limits for your plan.

Git LFS pointers are detected and omitted with a notice; LFS storage is not a supported download source in this version. Attach the actual files to releases instead. Symlinks and submodule contents are not followed.

## What the site does

- Lists `.ipa` and `.IPA` files recursively, with their real filenames and sizes.
- Includes uploaded attachments from all published releases, including prereleases, with pagination.
- Uses the default branch unless you configure another ref; committed-file links are pinned to the scanned commit so a changing branch cannot silently change a listed download.
- Distinguishes similarly named files by folder or release tag. The same file in a commit and a release is shown twice because they are different sources.
- Shows honest loading, empty, missing-repository, network, and rate-limit states. A source failure is disclosed even if the other source works.
- Caches results in the current browser tab for five minutes. If refreshing fails, cached results up to 24 hours old may remain available with a warning. Removed files may no longer download from a saved release listing.
- Uses relative asset URLs, so both `ACCOUNT.github.io` and `ACCOUNT.github.io/website-repo/` work.
- Uses system fonts and no third-party scripts, trackers, or CDNs. Requests are made to GitHub's public API; downloads go directly to GitHub.

The site lists files; it does not extract icons, app versions, or iOS compatibility from IPA contents. App tiles use filename initials. Downloading does not install or sign the app; use a compatible installer separately. No files or sample apps are bundled with this website.

## Public repositories and rate limits

The IPA repository must be public because the site runs entirely in the visitor's browser. **Never add a GitHub token to these files.** Unauthenticated GitHub REST requests usually share a limit of 60 requests per hour per IP address. A typical refresh makes three requests: the current commit, its file tree, and the first page of releases. Very large repositories, extra release pages, and checks for small LFS pointer files need more requests. Refreshing repeatedly can exhaust the allowance.

## Local preview

Set `owner` in `config.js` first. You can open `index.html` directly, or serve this folder using:

```sh
python3 -m http.server 8080
```

Then open `http://localhost:8080`. A normal internet connection is needed to load real GitHub files. An unconfigured local copy shows setup instructions instead of invented downloads.

## Files

| File | Role |
| --- | --- |
| `index.html` | Page structure and inline favicon. |
| `styles.css` | Dark theme and responsive layout. |
| `config.js` | Repository and branding settings. |
| `github.js` | Read-only GitHub API loader. |
| `app.js` | Rendering, refresh, and session cache. |
| `.nojekyll` | Allows direct static publishing. |

## GitHub documentation

- [Configure a Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Git trees API and recursive tree limits](https://docs.github.com/en/rest/git/trees)
- [Releases API](https://docs.github.com/en/rest/releases/releases)
- [Large-file and release-asset limits](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)
- [REST API rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
