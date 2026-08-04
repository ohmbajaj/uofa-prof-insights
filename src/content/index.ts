import { DEFAULT_SETTINGS } from '@shared/constants';
import { sendMessage } from '@shared/messaging';
import type { ExtensionSettings, ProfessorData } from '@shared/types';
import { startDetector } from './detector';
import type { DetectedProfessor } from './detector';
import { injectBadges } from './injector';
import { syncSidebar } from './sidebar-controller';
import type { ComparisonRow } from './components/ComparisonSidebar';
import type { UPIBadge } from './components/Badge';

console.log('[UPI] Content script loaded on UAccess');

let settings: ExtensionSettings = { ...DEFAULT_SETTINGS };

/** Lookup results by normalized name. Absent means "still pending". */
const results = new Map<string, ProfessorData | null>();
/** Most recent detection pass, used to build the comparison rows. */
let detected: DetectedProfessor[] = [];

function refreshSidebar(): void {
  const names = [...new Set(detected.map((p) => p.name))];
  const rows: ComparisonRow[] = names.map((name) => ({
    name,
    data: results.get(name) ?? null,
  }));

  try {
    syncSidebar(document, {
      enabled: settings.showComparison,
      rows,
      loading: names.some((name) => !results.has(name)),
      anchorFor: (row) => detected.find((p) => p.name === row.name)?.element,
    });
  } catch (error) {
    console.error('[UPI] sidebar update failed:', error);
  }
}

/**
 * Sends one lookup and applies the result to its badge.
 *
 * Never rejects: a failed lookup degrades that single badge to its error state
 * rather than taking down the detection pass that spawned it.
 */
async function resolveBadge(badge: UPIBadge, professor: DetectedProfessor): Promise<void> {
  try {
    const reply = await sendMessage(
      { type: 'LOOKUP_PROFESSOR', name: professor.name },
      'PROFESSOR_RESULT',
    );
    badge.data = reply.data;
    results.set(professor.name, reply.data);
  } catch (error) {
    badge.data = 'error';
    // Recorded as "no data" so the sidebar can stop waiting on it.
    results.set(professor.name, null);
    console.error(`[UPI] lookup failed for "${professor.name}":`, error);
  }
  refreshSidebar();
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

  refreshSidebar();

  for (const { badge, professor } of added) {
    // Fire and forget — resolveBadge handles its own failures.
    void resolveBadge(badge, professor);
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
    await loadSettings();

    if (!settings.autoDetect) {
      console.info('[UPI] autoDetect is off — not scanning this page');
      return;
    }

    startDetector(document, onDetect);
  } catch (error) {
    console.error('[UPI] failed to start:', error);
  }
}

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
