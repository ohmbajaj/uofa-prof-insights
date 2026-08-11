# Privacy Policy for UofA Prof Insights

Last updated: 12 August 2026. Applies to version 1.0.0.

## Summary

UofA Prof Insights does not require an account and does not include analytics,
advertising, tracking, or a developer-operated server. The extension does not
collect personal information from its users.

To provide ratings, the extension sends instructor names displayed in UAccess
to RateMyProfessors.com. All settings, cached ratings, recent views, and usage
counts remain in Chrome's local extension storage.

## Data sent to Rate My Professors

The extension sends a professor name and the University of Arizona school
identifier to `https://www.ratemyprofessors.com/graphql`. It uses the response
to display public professor ratings and review summaries.

The extension does not add a student identifier, course selection, class
schedule, grade, or UAccess account information to this request. As with any web
request, RateMyProfessors.com may receive standard network metadata such as the
device's IP address and browser user agent. Its handling of that information is
governed by the [Rate My Professors privacy policy](https://www.ratemyprofessors.com/privacy).

## Data stored in the browser

| Data                       | Purpose                                        | Removal                 |
| -------------------------- | ---------------------------------------------- | ----------------------- |
| Professor ratings          | Avoid repeated requests for the same professor | Settings: Clear cache   |
| Recently viewed professors | Populate the popup's recent list               | Settings: Clear history |
| Usage counts               | Show local lookup and badge totals             | Settings: Clear history |
| Extension settings         | Remember user preferences                      | Uninstall the extension |

Recent entries contain a professor's name, department, rating, rating count,
profile link, and view time. They do not contain the course or section being
viewed. Chrome does not sync this extension's local storage.

Uninstalling the extension removes its locally stored data.

## Access to UAccess pages

The content script runs only on the UAccess hosts listed in `manifest.json`. It
examines class-search structure and visible text locally to identify instructor
names and nearby course codes. It does not transmit UAccess page content to the
developer or to any analytics service.

The extension does not intentionally read or store:

- NetID credentials or passwords
- grades, transcripts, or GPA
- enrolment and registration actions
- financial aid or payment information
- student identifiers or personal records
- browsing activity outside the permitted UAccess pages

The optional **Diagnose this page** tool creates a local report containing the
page URL, page title, detector counts, instructor names, and short text samples
that may help diagnose changed markup. The report is not transmitted. It is
copied to the clipboard only when the user selects **Copy full report**.

## Permissions

| Permission                           | Reason                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------- |
| `storage`                            | Store settings, cached ratings, recent views, and usage counts locally |
| `https://www.ratemyprofessors.com/*` | Retrieve public professor data                                         |
| Listed UAccess hosts                 | Detect instructors and add rating controls to class results            |

The extension does not request `<all_urls>`, browsing-history, or remote-code
permissions.

## Children

This extension is intended for university students and is not directed to
children under 13. It does not collect personal information.

## Changes

Material changes to data handling will be documented here before the relevant
version is released.

## Contact

Questions or privacy concerns can be submitted through the project's GitHub
issue tracker.
