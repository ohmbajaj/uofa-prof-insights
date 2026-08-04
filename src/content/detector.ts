/**
 * Finds instructor names in the UAccess DOM.
 *
 * TODO(Phase 1): UAccess is PeopleSoft Fluid — class search results render into
 * an iframe (`#ptifrmtgtframe`) with generated ids, and the results list is
 * re-rendered on navigation rather than reloaded. Expect to need a
 * MutationObserver rather than a one-shot query. Real selectors still need to
 * be captured from a logged-in session; see the Phase 0 notes.
 */

export interface DetectedInstructor {
  /** Raw text as it appears in UAccess, e.g. "Mercer, Rick". */
  rawName: string;
  /** Element the badge should be appended to. */
  anchor: HTMLElement;
}

export function findInstructors(_root: ParentNode = document): DetectedInstructor[] {
  return [];
}

export function observeInstructors(_onChange: (found: DetectedInstructor[]) => void): () => void {
  // Returns an unsubscribe function.
  return () => {};
}
