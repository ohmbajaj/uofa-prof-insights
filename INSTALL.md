# Installing UofA Prof Insights

RateMyProfessor ratings shown inline in UAccess, so you can see who's teaching a
section without opening another tab.

Takes about two minutes. You do **not** need to know how to code.

---

## Step 1 — Get the extension files

Ask whoever shared this with you for the **`uofa-prof-insights-1.0.0.zip`** file,
then unzip it. You'll end up with a folder containing a `manifest.json` file.

Keep that folder somewhere permanent — Documents is fine, but **not** your
Downloads folder, and not the Recycle Bin. Chrome loads the extension from this
folder every time it starts, so if you move or delete it the extension stops
working.

> **Building it yourself instead?** See [README.md](README.md). Run
> `npm install && npm run build`, then point Chrome at the `dist/` folder.

## Step 2 — Turn on Developer mode in Chrome

1. Open Chrome and go to **`chrome://extensions`** (type it in the address bar).
2. Find the **Developer mode** switch in the top-right corner and turn it **on**.

## Step 3 — Load the extension

1. Click **Load unpacked** (top-left, appears once Developer mode is on).
2. Select the folder from Step 1 — the one containing `manifest.json`.
3. "UofA Prof Insights" appears in your list with a red star icon.

Chrome will show a "Developer mode extensions" warning each time it starts.
That's normal for an extension not installed from the Chrome Web Store, and it's
safe to dismiss.

## Step 4 — Try it

1. Go to UAccess and sign in as usual.
2. Open **Class Search** and search for any course.
3. A colored rating badge appears next to each instructor's name.

Pin the extension for easier access: click the puzzle-piece icon in Chrome's
toolbar, then the pin next to "UofA Prof Insights".

---

## Using it

**Rating badges** appear next to instructor names, colored by rating:

| Badge        | Meaning                                                |
| ------------ | ------------------------------------------------------ |
| Green ★ 4.2  | 3.5 and above                                          |
| Amber ★ 3.0  | 2.5 – 3.4                                              |
| Red ★ 1.8    | Below 2.5                                              |
| Grey **N/A** | No RateMyProfessor page, or no ratings yet             |
| Red **?**    | Couldn't reach RateMyProfessor — **click it to retry** |

The number in parentheses is how many ratings the average is based on. Treat a
4.9 from 3 students with more caution than a 3.8 from 200.

**Click a badge** for the full card: difficulty, "would take again" percentage,
the most common tags, and a link to the RateMyProfessor page. **Refresh** in the
card's corner refetches if the data looks stale. Press **Escape** or click
elsewhere to close.

**The rating filter** sits above the results. Pick a threshold (2.5+, 3.5+, 4+)
and sections taught by lower-rated instructors are hidden, with a count of
what's left. A section co-taught by someone good stays visible. Untick **Keep
unrated** to also hide "Staff" sections and instructors with no RMP page.

**The comparison sidebar** appears on the right when a search returns two or
more instructors, ranking them best-first. Click any row to jump to that
section. Close it with the × — it stays closed until your next page load.

**A BEST pill** marks the highest-rated instructor on the page.

**The toolbar popup** has a search box for looking up any professor directly,
plus your cache stats and settings.

## Settings

Click the extension icon, then the **Settings** tab:

| Setting                        | What it does                                                           |
| ------------------------------ | ---------------------------------------------------------------------- |
| **Show ratings automatically** | Off leaves UAccess completely untouched; use the popup search instead. |
| **Show comparison sidebar**    | Off hides the right-hand panel permanently.                            |
| **Show rating filter**         | Off hides the filter controls above the results.                       |
| **Keep ratings for**           | Days before a rating is re-fetched. Default 7, range 1–90.             |

Settings also holds **Clear cache** (forget all stored ratings) and **Clear
history** (forget recently viewed professors and usage counts).

---

## Troubleshooting

**No badges appear.**
Confirm you're on a class search results page — the extension only runs on
UAccess and only touches instructor names. Check that "Show ratings
automatically" is on in Settings. If it's still blank, reload the page; UAccess
sometimes renders results before the extension is ready.

**Badges show `?`.**
RateMyProfessor was unreachable. Click the badge to retry. If every badge shows
`?`, RMP may be down or your network may be blocking it.

**Badges show `N/A`.**
That instructor has no RateMyProfessor page, or has a page with no ratings.
Common for new faculty, TAs, and anyone listed as "Staff". This is expected, not
a bug.

**A rating looks wrong for the person I know.**
The extension only accepts an exact first-and-last-name match, but
RateMyProfessor has duplicate and misspelled profiles — some professors have two
pages with different ratings. Click through to RMP to check. Note that
"Rick Mercer" and "Richard Mercer" are treated as different people, because at
UofA they genuinely are.

**Ratings look out of date.**
Ratings are cached for 7 days by default. Open a professor's card and click
**Refresh** for one, or use **Clear cache** in the popup for all of them.

**It stopped working after I restarted Chrome.**
Almost always means the extension folder moved or was deleted. Re-check Step 1,
then reload the extension at `chrome://extensions`.

---

## Privacy

- Nothing about you is collected, stored, or transmitted anywhere.
- The extension talks to exactly one external service: RateMyProfessors.com, to
  look up the instructor names shown on your screen. Nothing else is sent.
- Cached ratings, recently viewed professors and usage counts live only in your
  own browser. Settings has buttons to erase both.
- It runs only on UAccess pages, and reads only instructor names — it cannot see
  your grades, schedule, financial aid, or anything else in your account.
- It requests no permission to read or change data on other websites.

Full details: [PRIVACY.md](PRIVACY.md).

## Fair warning

RateMyProfessor ratings are self-selected: students with strong opinions rate
more often than satisfied ones. A rating built on a handful of reviews says very
little. Use this as one input alongside the syllabus, degree requirements, and
people who've actually taken the course.
