import type { IncomingMessage, OutgoingMessage } from '@shared/messages';
import { startDetector } from './detector';
import type { DetectedProfessor } from './detector';
import { injectBadges } from './injector';
import type { InjectedBadge } from './injector';
import type { UPIBadge } from './components/Badge';

console.log('[UPI] Content script loaded on UAccess');

/**
 * Sends one lookup and applies the result to its badge.
 *
 * Never rejects: a failed lookup degrades that single badge to its error state
 * rather than taking down the detection pass that spawned it.
 */
async function resolveBadge(badge: UPIBadge, professor: DetectedProfessor): Promise<void> {
  const message: OutgoingMessage = { type: 'LOOKUP_PROFESSOR', name: professor.name };

  try {
    const reply = (await chrome.runtime.sendMessage(message)) as IncomingMessage | undefined;

    if (!reply) {
      // Service worker asleep or the channel closed before replying.
      throw new Error('no response from service worker');
    }

    if (reply.type === 'ERROR') {
      throw new Error(reply.message);
    }

    if (reply.type !== 'PROFESSOR_RESULT') {
      throw new Error(`unexpected reply: ${reply.type}`);
    }

    badge.data = reply.data;
  } catch (error) {
    badge.data = 'error';
    console.error(`[UPI] lookup failed for "${professor.name}":`, error);
  }
}

function onDetect(profs: DetectedProfessor[]): void {
  let added: InjectedBadge[];
  try {
    added = injectBadges(profs);
  } catch (error) {
    console.error('[UPI] badge injection failed:', error);
    return;
  }

  for (const { badge, professor } of added) {
    // Fire and forget — resolveBadge handles its own failures.
    void resolveBadge(badge, professor);
  }
}

function main(): void {
  try {
    startDetector(document, onDetect);
  } catch (error) {
    console.error('[UPI] failed to start detector:', error);
  }
}

/**
 * The manifest uses `run_at: document_idle`, which normally fires after
 * DOMContentLoaded — but not guaranteed on a slow document, so check first
 * rather than risk waiting for an event that already fired.
 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main, { once: true });
} else {
  main();
}

// Last-resort net: keep any stray async failure in our code from surfacing as
// an unexplained page error. UAccess's own scripts are unaffected — this only
// observes, and never calls preventDefault.
window.addEventListener('unhandledrejection', (event) => {
  console.error('[UPI] unhandled promise rejection:', event.reason);
});
