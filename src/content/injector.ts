import { BADGE_CLICK_EVENT, UPIBadge } from './components/Badge';
import type { BadgeData } from './components/Badge';
import { closeCard, closeCardIfOrphaned, openCardFor } from './card-controller';
import type { DetectedProfessor } from './detector';

/**
 * Badges currently in the page, keyed by the element they were injected into.
 *
 * The value is an array rather than a single badge because one UAccess cell can
 * list several instructors (`Mercer, Richard<br>Debray, Saumya`), each of which
 * gets its own badge.
 */
const injected = new Map<Element, UPIBadge[]>();

export interface InjectedBadge {
  badge: UPIBadge;
  professor: DetectedProfessor;
}

function badgesFor(element: Element): UPIBadge[] {
  return injected.get(element) ?? [];
}

/**
 * Injects a loading badge for every professor that does not already have one.
 *
 * Returns the new badges so the caller can apply lookup results without
 * exposing mutable module state.
 */
export function injectBadges(profs: DetectedProfessor[]): InjectedBadge[] {
  pruneDetached();

  const added: InjectedBadge[] = [];

  for (const professor of profs) {
    const { element, name } = professor;

    // This exact name was already handled in an earlier detection pass.
    if (badgesFor(element).some((b) => b.dataset.upiName === name)) continue;

    const badge = new UPIBadge(element.ownerDocument);
    badge.dataset.upiName = name;
    badge.data = 'loading';

    badge.addEventListener(BADGE_CLICK_EVENT, (event) => {
      const detail = (event as CustomEvent<BadgeData>).detail;
      console.info(`[UPI] badge clicked for ${name}:`, detail);

      // Only a resolved professor has anything to show. Loading, error and
      // "no match" states stay as the badge alone.
      if (detail && detail !== 'loading' && detail !== 'error') {
        openCardFor(badge.el, detail, professor.courseCode ?? null);
      }
    });

    // Appended INSIDE the cell rather than after it. The classic detector
    // anchors on a <td>, and inserting a sibling there would place a non-cell
    // element directly inside <tr>, which browsers hoist out of the table and
    // which visibly breaks the results grid.
    element.appendChild(badge.el);

    injected.set(element, [...badgesFor(element), badge]);
    added.push({ badge, professor });
  }

  if (added.length > 0) {
    console.info(`[UPI] Injected ${added.length} badges`);
  }
  return added;
}

/** Removes the badges belonging to the given professors. */
export function removeBadges(profs: DetectedProfessor[]): void {
  let removed = 0;

  for (const { element } of profs) {
    for (const badge of badgesFor(element)) {
      badge.remove();
      removed += 1;
    }
    injected.delete(element);
  }

  if (removed > 0) {
    closeCard();
    console.info(`[UPI] Removed ${removed} badges`);
  }
}

/**
 * Drops badges whose host element has left the document.
 *
 * This is what keeps a new search or a page of results from accumulating stale
 * entries: PeopleSoft replaces the results container wholesale, so the old
 * cells are detached rather than emptied.
 */
export function pruneDetached(): number {
  let removed = 0;

  for (const [element, badges] of injected) {
    if (element.isConnected) continue;
    for (const badge of badges) badge.remove();
    injected.delete(element);
    removed += badges.length;
  }

  if (removed > 0) {
    closeCardIfOrphaned();
    console.info(`[UPI] Removed ${removed} badges`);
  }
  return removed;
}

/** Drops tracking state without touching the DOM. */
export function resetInjectorState(): void {
  injected.clear();
}

export function injectedCount(): number {
  let total = 0;
  for (const badges of injected.values()) total += badges.length;
  return total;
}
