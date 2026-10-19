# PrompterPro (Teleprompter)

Branch `readiness-20261019`. Worktree of the vault repo at `~/Documents/AnthoneyOS/Products/Teleprompter` (its `main` still holds the untouched January original).

## Layout
- `app/` - the product. Static files, no build step, no network requests. Open `app/index.html` directly or serve the folder.
- `index.html` - landing page draft (noindex, checkout box is a placeholder until pricing is approved).
- `tools/build-release.py <version>` - builds `dist/PrompterPro-<version>.zip` + hash manifest. Local only.
- `tests/` - Playwright checks (bundled browsers only):
  - `readiness.cjs` - 72 checks, Chromium/WebKit/Firefox (Oct 9 suite)
  - `failure-paths.cjs` - 6 Chromium failure-path checks
  - `usability.cjs` - 60 checks for the Oct 19 changes, three engines x desktop/phone/small phone
  - `landing-and-zip.cjs` - landing renders with live demo; release ZIP opens from a clean folder
- `evidence/` - screenshots and JSON results from the last run.

## Run the tests
```
node tests/readiness.cjs && node tests/failure-paths.cjs && node tests/usability.cjs
python3 tools/build-release.py 1.0.0-review && node tests/landing-and-zip.cjs
```
Set `PLAYWRIGHT_PATH` / `PLAYWRIGHT_EXTRA_PATH` if Playwright lives elsewhere.

## Deploy (not done; needs Anthoney's approval)
Static: any host that serves this folder. Landing at `/`, app at `/app/`, free tryout link is `/app/index.html?sample`.
