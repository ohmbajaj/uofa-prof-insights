# Chrome Web Store submission

> **Decision (August 2026): not publishing.**
>
> The extension reads RateMyProfessors through a private API using their own
> web client's credential, and carries the University of Arizona's name and
> palette. A public listing puts a named individual behind both of those, adds
> Google's policy surface on top, and requires a hosted privacy policy. None of
> that is worth it for a project whose audience is a few dozen classmates.
>
> Nothing here is wasted — the listing copy, assets and checklist stay ready if
> the calculus changes. Distribution is by zip instead; see INSTALL.md.

Everything needed for a listing, plus the parts that need a decision rather
than a copy-paste.

---

## Read this before paying the $5

### Install counts are public

The listing shows a bucketed user count ("10+ users", "1,000+ users"), every
review with its author, the version, and the last-updated date. Only the
finer-grained numbers — weekly installs, uninstalls, impressions — stay private
in the dashboard.

A listing reading **"3 users"** is worse than no listing when the audience is a
recruiter: it reads as _built it, nobody wanted it_. An unpublished extension
with a strong README reads as _shipped and iterating_. Consider handing out the
zip until 20–50 people are using it, then publish.

### The RateMyProfessors dependency is a real risk

This extension authenticates to RMP's private GraphQL API with `Basic
dGVzdDp0ZXN0` — the credential their own web client ships. That means:

- RMP can rotate or revoke it at any time, breaking every install at once
- the schema can change without notice (it already did: `teacherRatingTags`
  returns empty, and per-course data had to be tallied from raw ratings)
- it is plausibly contrary to their terms of service

Similar extensions are listed on the store today, so this is not disqualifying.
But a public listing under your name is a different exposure from a zip shared
with classmates, and a takedown request would arrive addressed to you.

### Trademarks

Chrome's policy forbids implying affiliation you do not have. Two exposures:

- **University of Arizona** — the name "UofA Prof Insights" and the cardinal
  palette. Keep the disclaimer prominent.
- **RateMyProfessors** — fine to describe what the extension reads; do not put
  it in the extension name, and do not use their logo.

Both are addressed by the disclaimer text below. Do not drop it.

---

## Listing copy

### Name

```
UofA Prof Insights
```

### Short description (132 characters max)

```
See RateMyProfessor ratings next to every instructor in UAccess class search, and filter sections by rating.
```

### Category

`Productivity` — not `Education`, which is aimed at teaching tools.

### Single purpose

Chrome requires one sentence, and rejects listings whose features sprawl:

```
Display publicly available RateMyProfessors ratings alongside instructor names
on University of Arizona UAccess class pages.
```

### Detailed description

```
UofA Prof Insights shows RateMyProfessor ratings inline in UAccess, so you can
choose a section without opening a second tab.

WHAT IT DOES

• Puts a rating badge next to every instructor in class search
• Click a badge for difficulty, would-take-again, top tags and per-course ratings
• Filter sections by instructor rating — hide anything below 3.5, say
• Marks the best-rated instructor on the page, and ranks the rest
• Search any professor from the toolbar popup

WHY NOT JUST SEARCH RATEMYPROFESSORS YOURSELF

Because a name in UAccess is not a search query. UAccess lists an instructor as
"Mercer, Richard"; the top result for that on RateMyProfessors is a Richard
Mercer at a different university in another state, and nothing tells you so. The
UofA profile carrying his 164 ratings is filed under "Rick".

This extension searches by surname within the University of Arizona, accepts
recognised name variants, and picks the best-evidenced profile — showing you the
duplicates it found rather than hiding the choice.

It also does three things no separate tab can: rank the instructors on the page
against each other, break a rating down by the specific course you are looking
at, and hide sections below a rating you choose.

PRIVACY

Nothing about you is collected or transmitted. The only outbound request is an
instructor's name to RateMyProfessors, to fetch their public rating. Cached
ratings, recently viewed professors and usage counts live in your browser and
are erasable from Settings. The extension runs only on UAccess pages and reads
only instructor names — never your grades, schedule, or account.

NOT AFFILIATED

Not affiliated with, endorsed by, or sponsored by the University of Arizona or
RateMyProfessors.com. Ratings are user-submitted opinions: they are
self-selected, often sparse, and should be one input among several.
```

### Permission justifications

The reviewer reads these individually. Be specific; vagueness causes rejection.

| Permission                           | Justification                                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `storage`                            | Caches fetched ratings for seven days to avoid repeat requests, and stores the user's settings. All local.        |
| `https://www.ratemyprofessors.com/*` | Fetches the public professor ratings the extension displays.                                                      |
| UAccess hosts                        | Reads instructor names from class pages and inserts rating badges beside them. Four specific hosts, no wildcards. |

### Privacy practices form

- Does it collect user data? **No.**
- Personally identifiable information: **none**
- Health, financial, authentication, personal communications, location, web
  history, user activity: **none**
- "Remote code" — answer **no**. All code ships in the package; nothing is
  evaluated from a remote source.
- Privacy policy URL: **required**. See below.

---

## Required assets

| Asset            | Requirement                                   | Status                               |
| ---------------- | --------------------------------------------- | ------------------------------------ |
| Icon             | 128×128 PNG                                   | `src/assets/icon-128.png`            |
| Screenshots      | 1280×800 or 640×400, at least one, up to five | `npm run store:assets`               |
| Small promo tile | 440×280 PNG                                   | needed only if you request featuring |
| Privacy policy   | public URL                                    | see below                            |

Screenshots must show the extension actually working — a marketing graphic with
no product in it gets rejected.

### Privacy policy hosting

`PRIVACY.md` is written, but the store needs a public URL. Cheapest route:

1. Make the GitHub repository public
2. Settings → Pages → deploy from `main`
3. Use `https://<user>.github.io/uofa-prof-insights/PRIVACY`

A public Gist also works if you would rather keep the repository private.

---

## Submission checklist

1. Register as a developer, pay the one-time $5 (Google account, one time ever)
2. Bump `version` in **both** `manifest.json` and `package.json`
3. `npm run check` — typecheck, lint, format, 424 tests
4. `npm run verify:extension` — side-loads the build and confirms badges appear
5. `npm run package` → `release/uofa-prof-insights-<version>.zip`
6. Upload, paste the copy above, attach screenshots, set the privacy policy URL
7. Fill the privacy form exactly as above
8. Submit. Review is usually a few days; a first submission can take longer.

### After publishing

- The public user count starts at zero and is visible immediately
- Every update needs a fresh review, so batch changes rather than shipping daily
- One-star reviews are permanent and public; a bug that reaches users is
  expensive to undo

---

## Honest readiness

Ready: the build, the tests, the privacy policy, the listing copy, the
packaging, and a harness that verifies the extension works when actually
side-loaded.

Not ready: the extension has not yet been confirmed working on live UAccess by
anyone other than the automated harness, and it has zero users. Both should be
true before a public listing, because both are visible on it.
