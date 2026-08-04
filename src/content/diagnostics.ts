import { detectProfessorsClassic } from './detector-classic';
import { detectProfessorsNew } from './detector-new';
import { candidateTextRuns, detectProfessorsGeneric } from './detector-generic';
import { BADGE_TAG } from './components/Badge';
import type { PageDiagnostics } from '@shared/types';

/**
 * Reports what the content script can see on the current page.
 *
 * Exists because the failure that matters most — "no badges appeared" — is
 * invisible from the outside, and its two causes need opposite fixes: the
 * script not running at all, versus the selectors not matching. Asking a user
 * to paste console output to tell those apart is a poor trade when the
 * extension can answer it itself.
 */

/** A short CSS-ish path, enough to write a selector against. */
function describe(element: Element, depth = 4): string {
  const parts: string[] = [];

  for (
    let node: Element | null = element, i = 0;
    node && i < depth;
    node = node.parentElement, i++
  ) {
    if (node.tagName === 'BODY') break;
    const id = node.id ? `#${node.id}` : '';
    const cls =
      typeof node.className === 'string' && node.className.trim()
        ? `.${node.className.trim().split(/\s+/).slice(0, 3).join('.')}`
        : '';
    parts.push(`${node.tagName.toLowerCase()}${id}${cls}`);
  }

  return parts.join(' < ');
}

/** Text runs that look like they could be names but were rejected. */
function nearMisses(doc: Document, limit: number): PageDiagnostics['nearMisses'] {
  const out: PageDiagnostics['nearMisses'] = [];

  for (const { element, text } of candidateTextRuns(doc)) {
    if (out.length >= limit) break;
    // Two or more capitalised words. Deliberately looser than the detector's
    // own test — the point is to show what was *nearly* accepted, including
    // single-letter initials.
    if (!/^[A-Z][\w'’-]*(?:[\s,]+[A-Z][\w'’-]*){1,4}$/.test(text)) continue;
    out.push({ text: text.slice(0, 80), path: describe(element) });
  }

  return out;
}

export function collectDiagnostics(doc: Document): PageDiagnostics {
  const classic = detectProfessorsClassic(doc);
  const modern = detectProfessorsNew(doc);
  const generic = classic.length + modern.length === 0 ? detectProfessorsGeneric(doc) : [];

  const detected = [...classic, ...modern, ...generic];

  return {
    url: doc.location?.href ?? 'unknown',
    title: doc.title,
    inFrame: doc.defaultView !== doc.defaultView?.top,
    classicCount: classic.length,
    newCount: modern.length,
    genericCount: generic.length,
    badgesInPage: doc.querySelectorAll(BADGE_TAG).length,
    textRuns: candidateTextRuns(doc).length,
    names: detected.slice(0, 12).map((p) => p.name),
    samples: detected.slice(0, 6).map((p) => ({ text: p.rawName, path: describe(p.element) })),
    nearMisses: detected.length === 0 ? nearMisses(doc, 12) : [],
  };
}
