import { BADGE_TAG } from './components/Badge';
import { detectProfessorsClassic } from './detector-classic';
import { detectProfessorsNew } from './detector-new';

export interface DetectedProfessor {
  /** Element the badge is injected into. */
  element: HTMLElement;
  /** Normalized, natural-order name to send to RMP, e.g. "Richard Mercer". */
  name: string;
  /** Original UAccess text, e.g. "Mercer, Richard". Kept for debugging. */
  rawName: string;
}

export const DETECT_DEBOUNCE_MS = 250;

/**
 * Runs both detectors and concatenates the results.
 *
 * Cheaper and more robust than sniffing which UAccess variant we're on: each
 * detector is a single scoped `querySelectorAll` that returns nothing on the
 * other layout, and a page that somehow mixes the two is still fully covered.
 */
export function detectProfessors(doc: Document): DetectedProfessor[] {
  return [...detectProfessorsClassic(doc), ...detectProfessorsNew(doc)];
}

/**
 * `Node.ELEMENT_NODE` by value. The global `Node` constructor is not reliably
 * the same object across realms — an iframe document, or a MutationObserver
 * callback dispatched after teardown — so compare the numeric type instead.
 */
const ELEMENT_NODE = 1;

/** True when a mutation only added or removed our own badges. */
function isOwnMutation(mutation: MutationRecord): boolean {
  const touched = [...mutation.addedNodes, ...mutation.removedNodes];
  if (touched.length === 0) return false;

  return touched.every((node) => {
    if (node.nodeType !== ELEMENT_NODE) return false;
    return (node as Element).tagName.toLowerCase() === BADGE_TAG;
  });
}

/**
 * Watches `doc` for class-search results and reports detected instructors.
 *
 * Returns a stop function. (The spec called for `void`; a disposer costs
 * nothing, keeps tests from leaking observers between cases, and lets the
 * caller tear down cleanly.)
 *
 * On iframes: the manifest sets `all_frames: true`, so Chrome injects a
 * separate copy of this content script into the PeopleSoft target iframe,
 * where `document` already IS the results document. Reaching from the top
 * frame into `iframe.contentDocument` would therefore double-inject every
 * badge. `startDetector` instead takes whichever `Document` it should own, and
 * each frame's instance passes its own.
 */
export function startDetector(
  doc: Document,
  onDetect: (profs: DetectedProfessor[]) => void,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const run = () => {
    if (stopped) return;
    try {
      onDetect(detectProfessors(doc));
    } catch (error) {
      console.error('[UPI] detection pass failed:', error);
    }
  };

  const schedule = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(run, DETECT_DEBOUNCE_MS);
  };

  run();

  const observer = new MutationObserver((mutations) => {
    // Injecting a badge mutates the DOM, which would otherwise retrigger
    // detection forever. Ignore passes that only touched our own elements.
    if (mutations.every(isOwnMutation)) return;
    schedule();
  });

  const target = doc.body ?? doc.documentElement;
  if (target) {
    observer.observe(target, { childList: true, subtree: true });
  }

  return () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    observer.disconnect();
  };
}
