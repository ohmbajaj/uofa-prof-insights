# UofA Prof Insights

A Chrome extension (Manifest V3) that shows RateMyProfessor ratings inline inside
UAccess, so you can see who's teaching a section without leaving registration.

## Status

**Phase 1 complete** — badges are detected, injected, and resolved end to end
against both UAccess layouts. Not yet verified in a real browser (see
[Unverified](#unverified-in-a-real-browser)).

| Layer                                | State                             |
| ------------------------------------ | --------------------------------- |
| `src/shared/*`                       | Done, tested                      |
| `src/background/rmp-api.ts`          | Done, tested against the live API |
| `src/background/cache.ts`            | Done, tested                      |
| `src/background/message-handler.ts`  | Done, tested                      |
| `src/content/detector*.ts`           | Done, tested (both layouts)       |
| `src/content/components/Badge.ts`    | Done, tested                      |
| `src/content/injector.ts`            | Done, tested                      |
| `src/content/components/PopupCard`   | Stubbed — Phase 2                 |
| `src/content/components/Comparison…` | Stubbed — Phase 2                 |
| `src/popup/*`                        | Stubbed — Phase 2                 |

## How it works

```
detector-classic.ts ─┐
                     ├─> detector.ts ──> injector.ts ──> Badge (upi-badge)
detector-new.ts    ──┘   (MutationObserver,   (dedupes,        │
                          250ms debounce)      prunes stale)   │
                                                               ▼
                                   index.ts ──chrome.runtime.sendMessage──>
                                   service-worker ──> cache ──> rmp-api
```

Both detectors run on every pass; each is a scoped `querySelectorAll` that
returns nothing on the other layout, so no page sniffing is needed and a hybrid
page is still covered.

## Commands

```bash
npm run dev         # Vite + CRXJS dev server with HMR
npm run build       # production build into dist/
npm test            # unit tests (offline, deterministic)
npm run test:live   # hits the real RMP API — run after any RMP schema change
npm run typecheck   # tsc --noEmit, strict
npm run check       # typecheck + lint + format:check + test
```

Load the unpacked extension from `dist/` via `chrome://extensions` →
"Load unpacked".

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

## Known gaps

- **Multiple instructors per section** are supported (a `<br>`-separated cell
  gets one badge per name), but each badge is looked up independently — there is
  no "primary instructor" concept yet.
- **TypeScript files are not linted.** typescript-eslint refuses to load against
  TypeScript 7 (TS 6 only shipped as a beta, so downgrading isn't an option).
  `npm run typecheck` covers the ground in the meantime. See
  [eslint.config.js](eslint.config.js).
- **Icons are placeholders** — flat cardinal-red squares.
- A deprecation warning from `@crxjs/vite-plugin` about `server.hmr.*` appears
  during builds. It originates inside the plugin, not this config.
