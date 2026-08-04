# UofA Prof Insights

A Chrome extension (Manifest V3) that shows RateMyProfessor ratings inline inside
UAccess, so you can see who's teaching a section without leaving registration.

> **Just want to install it?** See **[INSTALL.md](INSTALL.md)** — no coding
> required. This file is the developer documentation.

## Status

**Feature complete and packaged.** Every module is implemented, 300+ tests pass,
and `npm run package` produces a Chrome Web Store-ready zip. Not yet verified in
a real browser (see [Unverified](#unverified-in-a-real-browser)).

| Layer                                         | State                             |
| --------------------------------------------- | --------------------------------- |
| `src/shared/*`                                | Done, tested                      |
| `src/background/rmp-api.ts`                   | Done, tested against the live API |
| `src/background/cache.ts`                     | Done, tested                      |
| `src/background/message-handler.ts`           | Done, tested                      |
| `src/content/detector*.ts`                    | Done, tested (both layouts)       |
| `src/content/components/Badge.ts`             | Done, tested                      |
| `src/content/injector.ts`                     | Done, tested                      |
| `src/content/components/PopupCard.ts`         | Done, tested                      |
| `src/content/components/ComparisonSidebar.ts` | Done, tested                      |
| `src/popup/*` (Status, Settings, Search)      | Done, tested                      |

## How it works

```
detector-classic.ts ─┐
                     ├─> detector.ts ──> injector.ts ──> Badge  <upi-badge>
detector-new.ts    ──┘   (MutationObserver,  (dedupes,       │  click
                          250ms debounce)     prunes stale)  └─> Card <upi-card>
                                     │
                                     └─> sidebar-controller ──> <upi-sidebar>
                                                                (2+ instructors)
       index.ts ──chrome.runtime.sendMessage──> service-worker ──> cache ──> rmp-api
       popup/  ──────────────────────────────────────┘
```

Both detectors run on every pass; each is a scoped `querySelectorAll` that
returns nothing on the other layout, so no page sniffing is needed and a hybrid
page is still covered.

## Features

- **Inline badges** next to every instructor, colored by rating.
- **Detail card** on badge click: rating, difficulty, would-retake, top tags,
  and a link to the RMP page. One card at a time; closes on Escape, outside
  click, or a second click on the same badge.
- **Comparison sidebar** ranking every instructor on the results page,
  best-first. Only appears with two or more instructors, since one has nothing
  to compare against. Clicking a row scrolls to that badge.
- **Popup** with a manual professor search, cache stats, and settings
  (`autoDetect`, `showComparison`, `cacheTTLDays`).
- **Retry and refresh.** An errored badge refetches when clicked, and the card's
  Refresh button re-pulls a stale record. Both bypass the cache via
  `REFRESH_PROFESSOR`, since a failed lookup is deliberately never cached and a
  plain lookup would just replay the failure.
- **Idempotent injection.** A second content-script injection into the same page
  tears down the first, so re-injection cannot double-register listeners or
  observers.

All in-page UI is shadow-DOM encapsulated, so PeopleSoft's stylesheets cannot
reach in and our styles cannot leak out.

## Commands

```bash
npm run dev         # Vite + CRXJS dev server with HMR
npm run build       # production build into dist/
npm run package     # build, then zip to release/ for the Web Store
npm run icons       # regenerate src/assets/icon-*.png from source
npm test            # unit tests (offline, deterministic)
npm run test:live   # hits the real RMP API — run after any RMP schema change
npm run typecheck   # tsc --noEmit, strict
npm run check       # typecheck + lint + format:check + test
```

Load the unpacked extension from `dist/` via `chrome://extensions` →
"Load unpacked".

### Releasing

1. Bump `version` in **both** `manifest.json` and `package.json` — `npm run
package` refuses to build if they disagree, since the store rejects a
   mismatch.
2. `npm run check` to gate.
3. `npm run package` → `release/uofa-prof-insights-<version>.zip`.
4. Upload that zip to the Chrome Web Store, or share it with
   [INSTALL.md](INSTALL.md) for unpacked install.

The icons are generated from [scripts/generate-icons.mjs](scripts/generate-icons.mjs)
— a rounded cardinal tile with a white star, rasterized by hand so no image
library is needed. The packaging script writes the zip by hand for the same
reason.

## Phase 0 findings

These were all verified against the live API, and each one is load-bearing.

### The UofA school ID is `School-1402`, not `School-1075`

`U2Nob29sLTEwNzU=` (base64 `School-1075`) is **UCLA**. Querying it returns
plausible-looking results from the wrong university — a search for "Rick Mercer"
returns "Rick Miller, Geography, UCLA". The correct value is
`U2Nob29sLTE0MDI=` (`School-1402`, Tucson, ~848 ratings).

### UAccess is not served from `uaccess.arizona.edu`

That host is only the portal landing page. Class search and registration live on
subdomains, which Chrome match patterns do **not** cover implicitly:

- `student.uaccess.arizona.edu`
- `student851.uaccess.arizona.edu`
- `studentcenter.arizona.edu`

All four hosts are in the manifest, and the content script runs with
`all_frames: true` because PeopleSoft renders into an iframe.

### The teacher search is fuzzy

A school-scoped search for "Rick Mercer" returns 10 hits, including "Dave Rick"
and "Rick Yngve". `selectExactMatch()` therefore accepts only exact first+last
matches. A looser rule (surname + first initial) would conflate the real,
distinct UofA professors "Rick Mercer" and "Richard Mercer" — showing the wrong
person's rating is worse than showing none. Ties break toward the profile with
the most ratings, which handles RMP's duplicate and typo'd profiles.

### Rating fields use sentinel values

- `avgRating` / `avgDifficulty` are `0` for unrated professors — mapped to `null`
- `wouldTakeAgainPercent` is `-1` for "no data" — mapped to `null`, while a
  genuine `0` is preserved

### `teacherRatingTags` is always empty

Even on a direct `node(id:)` lookup. Top tags have to be tallied client-side
from the `--`-delimited `ratingTags` string on individual ratings, via a second
query. `fetchTopTags()` does this and degrades to `[]` rather than failing the
whole lookup.

## Unverified in a real browser

Everything below is covered by automated tests in jsdom, which has no layout
engine and no CSS. These need a human pass in Chrome:

- That the badge doesn't disturb the results grid's row heights or column
  widths (the styles are built for this — `inline-flex`, `vertical-align:
middle`, `em` sizing — but jsdom cannot confirm it).
- That the shadow-root styles actually hold up against PeopleSoft's stylesheets.
- That a custom element defined from a content script's isolated world upgrades
  correctly in the page. This is a well-established pattern, but it is a real
  Chrome behavior that no test here exercises.
- Real UAccess ids. The selectors come from the two supplied snippets; live
  PeopleSoft may carry extra instance suffixes.
- Card and sidebar positioning. `computePosition` is unit-tested arithmetic, but
  jsdom reports every `getBoundingClientRect()` as zero, so the real placement
  has never been observed.
- Whether the 300px sidebar crowds the UAccess results at common window widths.

## Known gaps

- **Multiple instructors per section** are supported (a `<br>`-separated cell
  gets one badge per name), but each badge is looked up independently — there is
  no "primary instructor" concept yet.
- **TypeScript files are not linted.** typescript-eslint refuses to load against
  TypeScript 7 (TS 6 only shipped as a beta, so downgrading isn't an option).
  `npm run typecheck` covers the ground in the meantime. See
  [eslint.config.js](eslint.config.js).
- **Sidebar dismissal is page-scoped**, not persisted. Closing it lasts until
  the next page load; the permanent switch is the `showComparison` setting.
- A deprecation warning from `@crxjs/vite-plugin` about `server.hmr.*` appears
  during builds. It originates inside the plugin, not this config.
