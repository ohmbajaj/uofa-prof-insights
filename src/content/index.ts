import { DEFAULT_SETTINGS } from '@shared/constants';
import { sendMessage } from '@shared/messaging';
import type { ExtensionSettings, ProfessorData } from '@shared/types';
import { startDetector } from './detector';
import type { DetectedProfessor } from './detector';
import { injectBadges } from './injector';
import { closeCard, updateOpenCard } from './card-controller';
import { syncFilterBar } from './filter-controller';
import { CARD_REFRESH_EVENT } from './components/PopupCard';
import { collectDiagnostics } from './diagnostics';
import { BADGE_CLICK_EVENT, badgeFromElement, badgesIn } from './components/Badge';
import type { BadgeData, UPIBadge } from './components/Badge';

console.log('[UPI] Content script loaded on UAccess');

/**
 * Handle to the previous instance's teardown, parked on `window`.
 *
 * Chrome can inject a content script more than once into the same page
 * (bfcache restores, some PeopleSoft navigations). Without this, each
 * injection would add another set of document-level listeners and a second
 * MutationObserver, so one badge click would fire two retries.
 */
const TEARDOWN_KEY = '__upiTeardown';

type UPIWindow = Window & { [TEARDOWN_KEY]?: () => void };

function teardownPreviousInstance(): void {
  const win = window as UPIWindow;
  try {
    win[TEARDOWN_KEY]?.();
  } catch (error) {
    console.error('[UPI] teardown of previous instance failed:', error);
  }
  delete win[TEARDOWN_KEY];
}

let settings: ExtensionSettings = { ...DEFAULT_SETTINGS };

/** Lookup results by normalized name. Absent means "still pending". */
const results = new Map<string, ProfessorData | null>();
/** Most recent detection pass, used for ranking and filtering. */
let detected: DetectedProfessor[] = [];

/**
 * Recomputes each badge's standing among the rated instructors on the page.
 *
 * Runs after every resolution because the ranking is only meaningful once
 * enough neighbours have loaded, and a professor's position shifts as more
 * results arrive.
 */
function refreshRanks(): void {
  const rated = [...new Set(detected.map((p) => p.name))]
    .map((name) => ({ name, rating: results.get(name)?.overallRating ?? null }))
    .filter((entry): entry is { name: string; rating: number } => entry.rating !== null)
    .sort((a, b) => b.rating - a.rating);

  const total = rated.length;
  const positions = new Map(rated.map((entry, index) => [entry.name, index + 1]));

  for (const badge of badgesIn(document)) {
    const name = badge.dataset.upiName;
    const rank = name ? positions.get(name) : undefined;
    badge.rank = rank === undefined ? null : { rank, total };
  }
}

function refreshFilter(): void {
  try {
    syncFilterBar(document, {
      enabled: settings.showFilterBar,
      professors: detected,
      results,
      onChange: refreshFilter,
    });
  } catch (error) {
    console.error('[UPI] filter update failed:', error);
  }
}

/**
 * Sends one lookup and applies the result to its badge.
 *
 * Never rejects: a failed lookup degrades that single badge to its error state
 * rather than taking down the detection pass that spawned it. `refresh` bypasses
 * the cache, which is what the retry and Refresh actions need.
 */
async function resolveBadge(
  badge: UPIBadge,
  name: string,
  refresh = false,
  speculative = false,
): Promise<void> {
  badge.data = 'loading';

  try {
    const reply = await sendMessage(
      { type: refresh ? 'REFRESH_PROFESSOR' : 'LOOKUP_PROFESSOR', name },
      'PROFESSOR_RESULT',
    );

    /*
     * A guessed name that matches nobody was probably never a name. Withdrawing
     * the badge is the difference between a heuristic that stays out of the way
     * and one that prints "N/A" next to the words "In Person".
     */
    if (speculative && reply.data === null) {
      badge.remove();
      results.set(name, null);
      refreshRanks();
      return;
    }

    badge.data = reply.data;
    results.set(name, reply.data);
    updateOpenCard(name, reply.data);
  } catch (error) {
    badge.data = 'error';
    // Recorded as "no data" so the filter stops counting it as pending.
    results.set(name, null);
    updateOpenCard(name, null);
    console.error(`[UPI] lookup failed for "${name}":`, error);
  }
  refreshRanks();
  refreshFilter();
}

/**
 * Finds the live badge for a professor, if one is still on the page.
 *
 * Compares `dataset` rather than building an attribute selector: names carry
 * apostrophes ("Sean O'Brien"), and this sidesteps selector escaping entirely.
 */
function badgeFor(name: string): UPIBadge | null {
  for (const badge of badgesIn(document)) {
    if (badge.dataset.upiName === name) return badge;
  }
  return null;
}

/**
 * Retry on an errored badge.
 *
 * The error tooltip tells the user to click, so the click has to actually
 * refetch — and it must bypass the cache, since a failed lookup is deliberately
 * never cached and a plain lookup would just replay the same failure.
 */
function onBadgeClick(event: Event): void {
  const detail = (event as CustomEvent<BadgeData>).detail;

  // Opening a card counts as viewing a professor. Recorded locally only.
  if (detail && detail !== 'loading' && detail !== 'error') {
    void sendMessage({ type: 'RECORD_VIEW', data: detail }, 'USAGE').catch(() => {
      // A stats failure must never disturb the page.
    });
    return;
  }

  if (detail !== 'error') return;

  const badge = badgeFromElement(event.target as Element | null);
  const name = badge?.dataset.upiName;
  if (badge && name) void resolveBadge(badge, name, true);
}

/** Refresh requested from the detail card's footer. */
function onCardRefresh(event: Event): void {
  const data = (event as CustomEvent<ProfessorData>).detail;
  const badge = badgeFor(data.name);

  if (!badge) {
    // The results re-rendered underneath us; there is nothing to write back to.
    closeCard();
    return;
  }
  void resolveBadge(badge, data.name, true);
}

function onDetect(profs: DetectedProfessor[]): void {
  detected = profs;

  let added;
  try {
    added = injectBadges(profs);
  } catch (error) {
    console.error('[UPI] badge injection failed:', error);
    return;
  }

  refreshFilter();

  if (added.length > 0) {
    void sendMessage({ type: 'BADGES_SHOWN', count: added.length }, 'USAGE').catch(() => {
      // Counters are a nicety; never let them break a detection pass.
    });
  }

  for (const { badge, professor } of added) {
    // Fire and forget — resolveBadge handles its own failures.
    void resolveBadge(badge, professor.name, false, professor.speculative ?? false);
  }
}

async function loadSettings(): Promise<void> {
  try {
    const reply = await sendMessage({ type: 'GET_SETTINGS' }, 'SETTINGS');
    settings = reply.settings;
  } catch (error) {
    // Defaults keep the extension useful even if the worker is unreachable.
    console.error('[UPI] could not load settings, using defaults:', error);
  }
}

async function main(): Promise<void> {
  try {
    teardownPreviousInstance();
    await loadSettings();

    if (!settings.autoDetect) {
      console.info('[UPI] autoDetect is off — not scanning this page');
      return;
    }

    // Delegated at the document level: badges and cards come and go, and both
    // events are `composed` so they cross the shadow boundary to get here.
    document.addEventListener(BADGE_CLICK_EVENT, onBadgeClick);
    document.addEventListener(CARD_REFRESH_EVENT, onCardRefresh);

    const stopDetector = startDetector(document, onDetect);

    (window as UPIWindow)[TEARDOWN_KEY] = () => {
      document.removeEventListener(BADGE_CLICK_EVENT, onBadgeClick);
      document.removeEventListener(CARD_REFRESH_EVENT, onCardRefresh);
      stopDetector();
    };
  } catch (error) {
    console.error('[UPI] failed to start:', error);
  }
}

/**
 * Answers the popup's "Diagnose this page" request.
 *
 * Registered unconditionally, outside `main()`, so it still replies when
 * autoDetect is off or startup failed — those are exactly the cases someone
 * would be diagnosing.
 */
chrome.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
  if ((message as { type?: string })?.type !== 'DIAGNOSE_PAGE') return undefined;

  try {
    sendResponse({ type: 'DIAGNOSTICS', diagnostics: collectDiagnostics(document) });
  } catch (error) {
    sendResponse({ type: 'ERROR', message: String(error) });
  }
  return true;
});

/**
 * The manifest uses `run_at: document_idle`, which normally fires after
 * DOMContentLoaded — but not guaranteed on a slow document, so check first
 * rather than risk waiting for an event that already fired.
 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void main(), { once: true });
} else {
  void main();
}

// Last-resort net: keep any stray async failure in our code from surfacing as
// an unexplained page error. UAccess's own scripts are unaffected — this only
// observes, and never calls preventDefault.
window.addEventListener('unhandledrejection', (event) => {
  console.error('[UPI] unhandled promise rejection:', event.reason);
});
