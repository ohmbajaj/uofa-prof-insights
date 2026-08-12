<img src="docs/screenshots/icon.png" width="72" align="right" alt="UofA Prof Insights icon">

# UofA Prof Insights

UofA Prof Insights is a Chrome extension that adds Rate My Professors data to
University of Arizona class search results. Students can compare instructors,
review course-specific ratings, and filter sections without leaving UAccess.

[Installation](INSTALL.md) · [Privacy](PRIVACY.md) · [License](LICENSE)

## Install the extension

[**Download the ready-to-use ZIP**](https://github.com/ohmbajaj/uofa-prof-insights/releases/latest/download/uofa-prof-insights.zip)

The ZIP contains the complete built extension. You do not need Node.js, npm, or
any programming tools to install it:

1. Download the ZIP and extract all files to a permanent folder.
2. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
3. Turn on **Developer mode**.
4. Select **Load unpacked** and choose the extracted folder containing
   `manifest.json`.
5. Keep that extracted folder in place, then open UAccess Class Search.

See the [full installation and troubleshooting guide](INSTALL.md) for detailed
steps. You can also open the [latest GitHub Release](https://github.com/ohmbajaj/uofa-prof-insights/releases/latest)
and download `uofa-prof-insights.zip` from its **Assets** section.

![Modern UAccess class search with instructor rating badges and professor details](docs/screenshots/uaccess.png)

<table>
<tr>
<td width="50%"><img src="docs/screenshots/popup.png" alt="Extension popup showing professor search and recent results"></td>
<td width="50%"><img src="docs/screenshots/settings.png" alt="Extension settings and local data controls"></td>
</tr>
</table>

## Features

- Rating badges beside instructors in classic and modern UAccess layouts
- A detail card with difficulty, retake rate, tags, and recent course ratings
- Section filtering by minimum instructor rating
- A BEST marker for the highest-rated instructor in the current results
- Strict university and name matching with duplicate-profile disclosure
- Manual professor search, recent views, cache controls, and page diagnostics
- Local storage only, with no accounts, analytics, ads, or tracking

## How it works

The content script detects instructors in known UAccess layouts and uses a
conservative structural fallback for unfamiliar layouts. It asks the extension
service worker for each instructor, then renders isolated UI components inside
shadow roots so UAccess styles cannot interfere with them.

```text
UAccess page -> instructor detector -> content script -> service worker
                                                      -> local cache
                                                      -> Rate My Professors API
```

Rate My Professors search results are fuzzy, so the extension does not trust the
first result. It searches within the University of Arizona, compares names
locally, recognizes common nickname forms, and ranks duplicate profiles by the
amount of rating evidence available. Typed popup searches may use approximate
matching, while names read directly from UAccess stay strict.

## Technical highlights

- Manifest V3 extension built with TypeScript, React, Vite, and CRXJS
- Three layout detectors for classic PeopleSoft tables, Student Center panels,
  and structurally inferred class cards
- `chrome.storage.local` cache with configurable expiry, schema versioning, and
  bounded eviction
- Course summaries derived from recent review records already returned by the
  API, avoiding extra requests
- Unit and integration coverage for matching, caching, injection, filtering,
  popup behavior, and layout-specific DOM handling
- Browser verification against the production bundle in headless Chrome, plus
  a separate side-loaded extension check in Edge or Chromium

## Accuracy decisions

Several implementation details prevent plausible but incorrect ratings:

- The University of Arizona is `School-1402` in Rate My Professors. The commonly
  copied `School-1075` identifier belongs to UCLA.
- Surname searches produce a better candidate pool than full-name searches for
  this API. Final matching still happens locally.
- Rating fields use sentinel values such as `0` and `-1` for missing data. The
  API adapter converts those values to `null` before they reach the UI.
- Classic UAccess tables use `colspan`, so the detector resolves logical grid
  columns instead of relying on raw child indexes.
- Multiple instructors in one section are handled independently, while the
  filter keeps a co-taught section when any instructor meets the threshold.

## Build from source (optional)

Requirements: Node.js `^20.19.0` or `>=22.12.0`, npm, and Chrome or Edge for
browser verification. Regular users should install the ready-to-use ZIP above;
these commands are only for developers who want to change or rebuild the code.

```bash
git clone https://github.com/ohmbajaj/uofa-prof-insights.git
cd uofa-prof-insights
npm install
npm run build
```

Load `dist/` from `chrome://extensions` using **Load unpacked**.

### Commands

```bash
npm run dev               # Start the CRXJS development server
npm run build             # Create a production build in dist/
npm run check             # Typecheck, lint, format-check, and test
npm run test:live         # Check the current Rate My Professors API schema
npm run verify:browser    # Exercise the built UI in headless Chrome
npm run verify:extension  # Side-load the build in Edge or Chromium
npm run package           # Build a shareable zip in release/
```

The offline test suite is deterministic. `test:live` and `verify:extension`
contact Rate My Professors and can fail if its private API changes or is
temporarily unavailable.

## Current limitations

- Final validation against live UAccess markup requires a University NetID.
- The extension depends on an undocumented Rate My Professors GraphQL endpoint.
  A schema or access-policy change may require an update.
- Ratings are self-selected student feedback and should be one input among
  course requirements, syllabi, and advice from students who took the class.

## Privacy and affiliation

The extension has no backend and sends no usage analytics. Instructor names are
sent to Rate My Professors to retrieve public rating data; settings, cache,
recent views, and usage counts remain in the browser. See [PRIVACY.md](PRIVACY.md)
for details.

This independent project is not affiliated with, endorsed by, or sponsored by
the University of Arizona or RateMyProfessors.com.

The University of Arizona Block A is a registered trademark and is not covered
by this project's MIT License. Distribution using the mark remains subject to
the university's [trademark and licensing requirements](https://marcom.arizona.edu/brand-guidelines/logos).

Released under the [MIT License](LICENSE).
