import { DEFAULT_FILTER, FILTER_CHANGE_EVENT, UPIFilterBar } from './components/FilterBar';
import type { FilterState } from './components/FilterBar';
import type { DetectedProfessor } from './detector';
import type { ProfessorData } from '@shared/types';

let bar: UPIFilterBar | null = null;
let state: FilterState = { ...DEFAULT_FILTER };

/**
 * Most recent professors/results, refreshed on every sync.
 *
 * The change listener has to read this rather than close over the input it was
 * mounted with: lookups resolve after the bar appears, so a mount-time closure
 * would keep filtering against the empty result set it started with.
 */
let latest: FilterInput | null = null;

/** Attribute marking a row we hid, so we only ever restore our own work. */
const HIDDEN_ATTR = 'data-upi-hidden';

export interface FilterInput {
  professors: DetectedProfessor[];
  results: Map<string, ProfessorData | null>;
  onChange: () => void;
}

/**
 * The element representing one bookable section.
 *
 * Classic UAccess is a table, so the row is the unit. The Student Center nests
 * each section in a `.classSection` block. Falls back to null rather than
 * guessing, since hiding the wrong ancestor could blank the page.
 */
export function sectionElementFor(element: HTMLElement): HTMLElement | null {
  return element.closest('tr') ?? element.closest('.classSection');
}

/** Whether a section survives the current filter. */
export function passesFilter(data: ProfessorData | null | undefined, filter: FilterState): boolean {
  const rating = data?.overallRating ?? null;
  if (rating === null) return filter.includeUnrated;
  if (filter.floor === null) return true;
  return rating >= filter.floor;
}

function show(section: HTMLElement): void {
  if (!section.hasAttribute(HIDDEN_ATTR)) return;
  section.style.display = section.getAttribute(HIDDEN_ATTR) ?? '';
  section.removeAttribute(HIDDEN_ATTR);
}

function hide(section: HTMLElement): void {
  if (section.hasAttribute(HIDDEN_ATTR)) return;
  // Remember the inline value so restoring cannot clobber a page style.
  section.setAttribute(HIDDEN_ATTR, section.style.display);
  section.style.display = 'none';
}

/**
 * Applies the filter and returns how many sections are visible.
 *
 * A section is hidden only when every instructor on it fails — a co-taught
 * section with one good instructor is still worth showing.
 */
/**
 * Sibling sections in the same results container.
 *
 * Needed because a "Staff" or "To be Announced" row has no detected
 * instructor, so it never appears in `professors`. Without this it would sit
 * out the filter entirely and stay on screen under a 3.5+ threshold, which
 * reads as a bug. Those rows are treated as unrated and governed by
 * `includeUnrated` like any other section we cannot score.
 */
function siblingSections(section: HTMLElement): HTMLElement[] {
  const parent = section.parentElement;
  if (!parent) return [section];

  const children = [...parent.children] as HTMLElement[];
  if (section.tagName === 'TR') {
    // Data rows only — a header row carries <th> and no <td>.
    return children.filter((el) => el.tagName === 'TR' && el.querySelector('td') !== null);
  }
  return children.filter((el) => el.classList.contains('classSection'));
}

export function applyFilter(input: FilterInput): { visible: number; total: number } {
  const { professors, results } = input;
  const bySection = new Map<HTMLElement, DetectedProfessor[]>();

  for (const professor of professors) {
    const section = sectionElementFor(professor.element);
    if (!section) continue;
    bySection.set(section, [...(bySection.get(section) ?? []), professor]);
  }

  // Fold in sections that have no instructor we could look up.
  for (const section of [...bySection.keys()]) {
    for (const sibling of siblingSections(section)) {
      if (!bySection.has(sibling)) bySection.set(sibling, []);
    }
  }

  let visible = 0;
  for (const [section, occupants] of bySection) {
    // An instructor-less section counts as unrated; a co-taught one survives
    // if any of its instructors passes.
    const keep =
      occupants.length === 0
        ? passesFilter(null, state)
        : occupants.some((p) => passesFilter(results.get(p.name), state));

    if (keep) {
      show(section);
      visible += 1;
    } else {
      hide(section);
    }
  }

  return { visible, total: bySection.size };
}

/** Restores every row we hid. Used when tearing down or disabling the filter. */
export function clearFilter(doc: Document = document): void {
  for (const section of doc.querySelectorAll<HTMLElement>(`[${HIDDEN_ATTR}]`)) show(section);
}

export function getFilterState(): FilterState {
  return state;
}

export function getFilterBar(): UPIFilterBar | null {
  return bar;
}

/**
 * Mounts the filter bar above the results and keeps its counts current.
 *
 * Only worth showing once there is more than one section to choose between.
 */
export function syncFilterBar(
  doc: Document,
  input: FilterInput & { enabled: boolean },
): UPIFilterBar | null {
  const sections = new Set(
    input.professors.map((p) => sectionElementFor(p.element)).filter(Boolean),
  );

  if (!input.enabled || sections.size < 2) {
    removeFilterBar();
    clearFilter(doc);
    return null;
  }

  latest = input;

  if (!bar || !bar.isConnected) {
    bar = new UPIFilterBar(doc);
    bar.state = state;
    bar.addEventListener(FILTER_CHANGE_EVENT, (event) => {
      state = (event as CustomEvent<FilterState>).detail;
      // Apply immediately against the newest data, then let the caller react.
      if (latest) {
        recount(latest);
        latest.onChange();
      }
    });

    // Above the results container, so it reads as part of the search UI.
    const first = [...sections][0] as HTMLElement;
    const anchor = first.closest('table') ?? first.closest('.resultPanel') ?? first;
    anchor.parentElement?.insertBefore(bar.el, anchor);
  }

  recount(input);
  return bar;
}

/** Re-applies the filter and refreshes the bar's counts. */
function recount(input: FilterInput): void {
  const { visible, total } = applyFilter(input);
  const pending = input.professors.filter((p) => !input.results.has(p.name)).length;
  bar?.setCounts(visible, total, pending);
}

export function removeFilterBar(): void {
  bar?.remove();
  bar = null;
}

/** Test seam. */
export function resetFilterState(doc: Document = document): void {
  clearFilter(doc);
  removeFilterBar();
  state = { ...DEFAULT_FILTER };
  latest = null;
}
