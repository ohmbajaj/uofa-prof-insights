# Privacy Policy — UofA Prof Insights

_Last updated: 5 August 2026 · Applies to version 1.0.0_

## The short version

**This extension collects nothing about you.** There is no account, no server,
no analytics, no tracking, and no advertising. Nothing you do is transmitted to
the developer or to any third party.

The only network request it ever makes is to **RateMyProfessors.com**, to look
up instructor names that are already displayed on the UAccess page you are
viewing.

## What is sent off your device

Exactly one thing: **an instructor's name**, sent to RateMyProfessors.com to
retrieve their public rating.

For example, if UAccess shows a section taught by "Mercer, Richard", the
extension asks RateMyProfessors for professors with the surname "Mercer" at the
University of Arizona.

Nothing else is included. The request carries no identifier for you, no
information about which course you are viewing, and nothing about your account.
RateMyProfessors receives what it would receive if you searched their website
yourself, minus your identity.

Their handling of that request is governed by their own privacy policy:
<https://www.ratemyprofessors.com/privacy>

## What is stored, and where

All of it stays in your browser, in Chrome's local extension storage. None of it
is synced, backed up, or sent anywhere.

| Stored                     | Why                                             | Clear it                 |
| -------------------------- | ----------------------------------------------- | ------------------------ |
| Cached professor ratings   | Avoids refetching the same professor for 7 days | Settings → Clear cache   |
| Recently viewed professors | The list on the popup's Status tab              | Settings → Clear history |
| Usage counts               | The tally on the Status tab                     | Settings → Clear history |
| Your settings              | Remembers your preferences                      | Reset by uninstalling    |

The recently-viewed record holds only a professor's name, department, rating,
rating count and RateMyProfessors link. It does **not** record which course or
section you were looking at, so it cannot describe your schedule.

Uninstalling the extension deletes all of it.

## What it can and cannot see

The extension runs only on University of Arizona UAccess pages, and only reads
**instructor names** from the class search results.

It cannot see, and never reads:

- your NetID, password, or any credential
- your grades, transcript, or GPA
- your class schedule, enrolment, or registration actions
- your financial aid, bursar account, or payment details
- your student ID number or any personal record
- any other website you visit — it holds no permission to run anywhere else

## Permissions, and why each exists

| Permission                           | Reason                                                        |
| ------------------------------------ | ------------------------------------------------------------- |
| `storage`                            | Save the cache, settings and recents described above, locally |
| `https://www.ratemyprofessors.com/*` | Fetch public ratings                                          |
| UAccess hosts                        | Read instructor names and place badges on the page            |

There is deliberately no `<all_urls>` permission, no `tabs` permission, and no
ability to read or change data on any site other than UAccess.

## Children

This extension is intended for university students and is not directed at
children under 13. It collects no personal information from anyone.

## Changes

Any future change to what is collected or transmitted will be published here,
with the version it applies to, before that version ships.

## Contact

Questions or concerns: open an issue on the project's GitHub repository.

---

**In one sentence:** the extension sends professor names to RateMyProfessors and
keeps their ratings in your own browser — nothing about you goes anywhere.
