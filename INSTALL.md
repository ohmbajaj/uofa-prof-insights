# Install UofA Prof Insights

UofA Prof Insights shows Rate My Professors ratings beside instructors in
UAccess class search. Installation takes about two minutes and does not require
coding experience.

## 1. Get the extension files

Download `uofa-prof-insights-1.0.0.zip` from the person sharing the extension
and extract it. The extracted folder should contain `manifest.json`.

Keep this folder in a permanent location such as Documents. Chrome loads the
extension from that location each time it starts, so moving or deleting the
folder will disable it.

To build from source instead:

```bash
npm install
npm run build
```

Use the generated `dist/` folder in the remaining steps.

## 2. Enable Developer mode

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** in the top-right corner.

## 3. Load the extension

1. Select **Load unpacked**.
2. Choose the extracted folder that contains `manifest.json`.
3. Confirm that UofA Prof Insights appears with its cardinal star icon.

Chrome may show a startup warning for extensions installed outside the Chrome
Web Store. This is expected for a side-loaded extension.

## 4. Try it in UAccess

1. Sign in to UAccess.
2. Open Class Search and search for a course.
3. Wait for a rating badge to appear beside each listed instructor.

For quick access, open Chrome's extensions menu and pin UofA Prof Insights.

## Using the extension

| Badge        | Meaning                                                 |
| ------------ | ------------------------------------------------------- |
| Green ★ 4.2  | Rating of 3.5 or higher                                 |
| Amber ★ 3.0  | Rating from 2.5 to 3.4                                  |
| Red ★ 1.8    | Rating below 2.5                                        |
| Grey **N/A** | No matching profile or no ratings yet                   |
| Red **?**    | Rate My Professors could not be reached; click to retry |

The number in parentheses is the number of ratings behind the average. A high
score based on a few reviews carries less evidence than one based on hundreds.

Click a badge to view difficulty, retake percentage, common tags, recent course
ratings, and a link to the professor's profile. Press Escape, click elsewhere,
or click the same badge again to close the card.

The rating filter appears above results with at least two sections. Co-taught
sections remain visible when any instructor meets the selected threshold. Use
**Keep unrated** to control sections taught by Staff or instructors without a
rating.

The toolbar popup provides manual search, recent views, settings, and local data
controls.

## Settings

| Setting                        | Purpose                                    |
| ------------------------------ | ------------------------------------------ |
| **Show ratings automatically** | Enable or disable badges in UAccess        |
| **Show rating filter**         | Show or hide section filter controls       |
| **Keep ratings for**           | Choose a cache duration from 1 to 90 days  |
| **Clear cache**                | Remove stored professor ratings            |
| **Clear history**              | Remove recent views and local usage counts |

## Troubleshooting

### No badges appear

Confirm that you are viewing class search results and that **Show ratings
automatically** is enabled. Reload the UAccess page after installing or updating
the extension. The Settings tab also includes **Diagnose this page**, which can
confirm whether the content script detected instructor fields.

### A badge shows `?`

The request failed. Click the badge to retry. If every badge fails, Rate My
Professors may be unavailable or blocked by the current network.

### A badge shows `N/A`

The instructor has no matching Rate My Professors profile or has not received
ratings. This is common for new faculty, teaching assistants, and Staff entries.

### A rating appears out of date

Ratings are cached for seven days by default. Open the detail card and select
**Refresh**, or clear the full cache from Settings.

### The extension disappeared after a restart

The extracted folder was probably moved or deleted. Restore it to a permanent
location, return to `chrome://extensions`, and load it again.

## Privacy note

The extension sends instructor names to Rate My Professors to retrieve public
ratings. It has no account, analytics, advertising, or developer-operated
server. Cached ratings, settings, recent views, and usage counts stay in local
browser storage. See [PRIVACY.md](PRIVACY.md) for the complete policy.

Rate My Professors ratings are self-selected feedback. Use them alongside the
syllabus, degree requirements, and advice from students who took the course.
