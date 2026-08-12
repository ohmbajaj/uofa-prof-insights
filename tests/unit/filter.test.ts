import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FILTER, FILTER_CHANGE_EVENT, FILTER_TAG } from '@content/components/FilterBar';
import type { FilterState } from '@content/components/FilterBar';
import {
  applyFilter,
  clearFilter,
  getFilterBar,
  getFilterState,
  passesFilter,
  resetFilterState,
  sectionElementFor,
  syncFilterBar,
} from '@content/filter-controller';
import { detectProfessors } from '@content/detector';
import type { ProfessorData } from '@shared/types';
import { makeProfessor } from '../helpers/chrome-mock';

const CLASSIC = `
  <table id="CLASS_SRCH_WRK2_STRM$scroll$0">
    <tr><th id="CLASS_SRCH_WRK2_STRM_INSTRUCTOR$0">Instructor</th></tr>
    <tr><td>CSC 110</td><td id="MTG_INSTR$0">Mercer, Richard</td></tr>
    <tr><td>CSC 110</td><td id="MTG_INSTR$1">Debray, Saumya</td></tr>
    <tr><td>CSC 110</td><td id="MTG_INSTR$2">O'Brien, Sean</td></tr>
  </table>`;

function results(entries: Record<string, number | null>): Map<string, ProfessorData | null> {
  const map = new Map<string, ProfessorData | null>();
  for (const [name, rating] of Object.entries(entries)) {
    map.set(name, rating === null ? null : makeProfessor({ name, overallRating: rating }));
  }
  return map;
}

const RATINGS = {
  'Richard Mercer': 2.9,
  'Saumya Debray': 3.4,
  "Sean O'Brien": 4.6,
};

function visibleRows(): number {
  return [...document.querySelectorAll('tr')].filter(
    (r) => r.style.display !== 'none' && r.querySelector('td'),
  ).length;
}

beforeEach(() => {
  document.body.innerHTML = '';
  resetFilterState(document);
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

describe('passesFilter', () => {
  const filter = (patch: Partial<FilterState> = {}): FilterState => ({
    ...DEFAULT_FILTER,
    ...patch,
  });

  it('keeps everything when no floor is set', () => {
    expect(passesFilter(makeProfessor({ overallRating: 1.2 }), filter())).toBe(true);
  });

  it('keeps a rating at or above the floor', () => {
    expect(passesFilter(makeProfessor({ overallRating: 3.5 }), filter({ floor: 3.5 }))).toBe(true);
    expect(passesFilter(makeProfessor({ overallRating: 4.9 }), filter({ floor: 3.5 }))).toBe(true);
  });

  it('drops a rating below the floor', () => {
    expect(passesFilter(makeProfessor({ overallRating: 3.4 }), filter({ floor: 3.5 }))).toBe(false);
  });

  it('treats an unmatched professor as unrated', () => {
    expect(passesFilter(null, filter({ includeUnrated: true }))).toBe(true);
    expect(passesFilter(null, filter({ includeUnrated: false }))).toBe(false);
  });

  it('treats a rated-zero professor as unrated', () => {
    const unrated = makeProfessor({ overallRating: null });
    expect(passesFilter(unrated, filter({ floor: 4, includeUnrated: true }))).toBe(true);
    expect(passesFilter(unrated, filter({ floor: 4, includeUnrated: false }))).toBe(false);
  });
});

describe('sectionElementFor', () => {
  it('resolves a classic cell to its row', () => {
    document.body.innerHTML = CLASSIC;
    const cell = document.querySelector<HTMLElement>('#MTG_INSTR\\$0')!;
    expect(sectionElementFor(cell)?.tagName).toBe('TR');
  });

  it('resolves a Student Center instructor to its section block', () => {
    document.body.innerHTML = `
      <div class="resultPanel"><div class="classSection">
        <div class="classInstructors"><div class="instructor">Mercer, Richard</div></div>
      </div></div>`;
    const el = document.querySelector<HTMLElement>('.instructor')!;
    expect(sectionElementFor(el)?.className).toBe('classSection');
  });

  it('returns null rather than guessing at an unknown layout', () => {
    document.body.innerHTML = '<div id="loose">Mercer, Richard</div>';
    expect(sectionElementFor(document.querySelector<HTMLElement>('#loose')!)).toBeNull();
  });
});

describe('applyFilter', () => {
  function setup() {
    document.body.innerHTML = CLASSIC;
    return { professors: detectProfessors(document), results: results(RATINGS) };
  }

  it('shows every section with no floor', () => {
    const input = setup();
    const { visible, total } = applyFilter({ ...input, onChange: () => {} });

    expect(total).toBe(3);
    expect(visible).toBe(3);
    expect(visibleRows()).toBe(3);
  });

  it('hides sections below the chosen floor', () => {
    const input = setup();
    syncFilterBar(document, { ...input, enabled: true, onChange: () => {} });

    // Ratings are 2.9, 3.4 and 4.6, so a 3.5 floor leaves only O'Brien.
    getFilterBar_setFloor(3.5);
    expect(visibleRows()).toBe(1);

    // 2.5 keeps all three; the boundary is inclusive.
    getFilterBar_setFloor(2.5);
    expect(visibleRows()).toBe(3);
  });

  it('restores hidden sections when the floor is lifted', () => {
    const input = setup();
    syncFilterBar(document, { ...input, enabled: true, onChange: () => {} });

    getFilterBar_setFloor(4);
    expect(visibleRows()).toBe(1);

    getFilterBar_setFloor(null);
    expect(visibleRows()).toBe(3);
  });

  it('keeps a co-taught section when any instructor passes', () => {
    document.body.innerHTML = `
      <table id="CLASS_SRCH_WRK2_STRM$scroll$0">
        <tr><th id="CLASS_SRCH_WRK2_STRM_INSTRUCTOR$0">Instructor</th></tr>
        <tr><td>CSC 110</td><td id="MTG_INSTR$0">Mercer, Richard<br>O'Brien, Sean</td></tr>
        <tr><td>CSC 110</td><td id="MTG_INSTR$1">Debray, Saumya</td></tr>
      </table>`;

    syncFilterBar(document, {
      enabled: true,
      professors: detectProfessors(document),
      results: results(RATINGS),
      onChange: () => {},
    });
    getFilterBar_setFloor(4);

    // Row 1 survives on O'Brien's 4.6 despite Mercer's 2.9.
    expect(visibleRows()).toBe(1);
    expect(
      document.querySelector<HTMLElement>('#MTG_INSTR\\$0')?.closest('tr')?.style.display,
    ).not.toBe('none');
  });

  it('can hide unrated sections', () => {
    document.body.innerHTML = CLASSIC;
    const professors = detectProfessors(document);
    syncFilterBar(document, {
      enabled: true,
      professors,
      results: results({ ...RATINGS, 'Saumya Debray': null }),
      onChange: () => {},
    });

    const bar = getFilterBar()!;
    bar.state = { floor: null, includeUnrated: false };
    bar.el.dispatchEvent(
      new CustomEvent(FILTER_CHANGE_EVENT, { detail: bar.state, bubbles: true, composed: true }),
    );

    expect(visibleRows()).toBe(2);
  });

  it('ignores forged event.detail state from the host page', () => {
    const input = setup();
    syncFilterBar(document, { ...input, enabled: true, onChange: () => {} });

    const bar = getFilterBar()!;
    bar.el.dispatchEvent(
      new CustomEvent(FILTER_CHANGE_EVENT, {
        detail: { floor: 5, includeUnrated: false },
        bubbles: true,
        composed: true,
      }),
    );

    expect(getFilterState()).toEqual(DEFAULT_FILTER);
    expect(visibleRows()).toBe(3);
  });

  it('does not clobber a page-set display value on restore', () => {
    document.body.innerHTML = CLASSIC;
    const row = document.querySelectorAll('tr')[1] as HTMLElement;
    row.style.display = 'table-row';

    const professors = detectProfessors(document);
    syncFilterBar(document, {
      enabled: true,
      professors,
      results: results(RATINGS),
      onChange: () => {},
    });
    getFilterBar_setFloor(4);
    getFilterBar_setFloor(null);

    expect(row.style.display).toBe('table-row');
  });
});

/** Drives the mounted bar the way a click would. */
function getFilterBar_setFloor(floor: number | null): void {
  const bar = getFilterBar()!;
  bar.state = { ...bar.state, floor };
  bar.el.dispatchEvent(
    new CustomEvent(FILTER_CHANGE_EVENT, { detail: bar.state, bubbles: true, composed: true }),
  );
}

describe('syncFilterBar', () => {
  function input(overrides: Partial<{ enabled: boolean }> = {}) {
    document.body.innerHTML = CLASSIC;
    return {
      enabled: true,
      professors: detectProfessors(document),
      results: results(RATINGS),
      onChange: () => {},
      ...overrides,
    };
  }

  it('mounts above the results table', () => {
    syncFilterBar(document, input());
    const bar = document.querySelector(FILTER_TAG);

    expect(bar).not.toBeNull();
    expect(bar?.nextElementSibling?.tagName).toBe('TABLE');
  });

  it('does not mount when disabled', () => {
    syncFilterBar(document, input({ enabled: false }));
    expect(document.querySelector(FILTER_TAG)).toBeNull();
  });

  it('does not mount for a single section', () => {
    document.body.innerHTML = `
      <table id="CLASS_SRCH_WRK2_STRM$scroll$0">
        <tr><th id="CLASS_SRCH_WRK2_STRM_INSTRUCTOR$0">Instructor</th></tr>
        <tr><td>CSC 110</td><td id="MTG_INSTR$0">Mercer, Richard</td></tr>
      </table>`;
    syncFilterBar(document, {
      enabled: true,
      professors: detectProfessors(document),
      results: results(RATINGS),
      onChange: () => {},
    });

    expect(document.querySelector(FILTER_TAG)).toBeNull();
  });

  it('reuses the same bar across updates and keeps its state', () => {
    // Use one DOM for both syncs because input() would wipe the page.
    const shared = input();
    const first = syncFilterBar(document, shared);
    getFilterBar_setFloor(3.5);
    const second = syncFilterBar(document, shared);

    expect(second).toBe(first);
    expect(getFilterState().floor).toBe(3.5);
  });

  it('restores all rows when the filter is turned off', () => {
    const shared = input();
    syncFilterBar(document, shared);
    getFilterBar_setFloor(4);
    expect(visibleRows()).toBe(1);

    syncFilterBar(document, { ...shared, enabled: false });
    expect(visibleRows()).toBe(3);
  });

  it('reports counts, and pending lookups while they resolve', () => {
    document.body.innerHTML = CLASSIC;
    const bar = syncFilterBar(document, {
      enabled: true,
      professors: detectProfessors(document),
      results: results({ 'Richard Mercer': 2.9 }), // two still pending
      onChange: () => {},
    });

    expect(bar?.shadowRoot?.textContent).toContain('checking 2 more');
  });
});

describe('clearFilter', () => {
  it('restores every row it hid', () => {
    document.body.innerHTML = CLASSIC;
    syncFilterBar(document, {
      enabled: true,
      professors: detectProfessors(document),
      results: results(RATINGS),
      onChange: () => {},
    });
    getFilterBar_setFloor(4);
    expect(visibleRows()).toBe(1);

    clearFilter(document);
    expect(visibleRows()).toBe(3);
  });

  it('is a no-op when nothing was hidden', () => {
    document.body.innerHTML = CLASSIC;
    expect(() => clearFilter(document)).not.toThrow();
    expect(visibleRows()).toBe(3);
  });
});
