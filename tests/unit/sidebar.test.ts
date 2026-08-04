import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SIDEBAR_SELECT_EVENT,
  SIDEBAR_TAG,
  UPISidebar,
  sortRows,
} from '@content/components/ComparisonSidebar';
import type { ComparisonRow } from '@content/components/ComparisonSidebar';
import { resetSidebarState, shouldShow, syncSidebar } from '@content/sidebar-controller';
import { COLOR_BAD, COLOR_GOOD, COLOR_UNKNOWN } from '@shared/constants';
import { makeProfessor } from '../helpers/chrome-mock';

function row(name: string, rating: number | null, patch = {}): ComparisonRow {
  return { name, data: makeProfessor({ name, overallRating: rating, ...patch }) };
}

function mount(): UPISidebar {
  const el = document.createElement(SIDEBAR_TAG) as UPISidebar;
  document.body.appendChild(el);
  return el;
}

function rowTexts(sidebar: UPISidebar): string[] {
  return [...(sidebar.shadowRoot?.querySelectorAll('.meta .name') ?? [])].map(
    (n) => n.textContent ?? '',
  );
}

beforeEach(() => {
  document.body.innerHTML = '';
  resetSidebarState();
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

describe('sortRows', () => {
  it('ranks higher ratings first', () => {
    const sorted = sortRows([row('A Prof', 2.1), row('B Prof', 4.6), row('C Prof', 3.3)]);
    expect(sorted.map((r) => r.data?.overallRating)).toEqual([4.6, 3.3, 2.1]);
  });

  it('puts unrated professors after rated ones', () => {
    const sorted = sortRows([row('A Prof', null), row('B Prof', 1.2)]);
    expect(sorted[0]?.data?.overallRating).toBe(1.2);
  });

  it('puts unmatched names last', () => {
    const sorted = sortRows([
      { name: 'Unknown Prof', data: null },
      row('Rated Prof', 3.0),
      row('Unrated Prof', null),
    ]);
    expect(sorted[0]?.name).toBe('Rated Prof');
    expect(sorted.map((r) => r.name)).toContain('Unknown Prof');
  });

  it('breaks ties alphabetically for a stable order', () => {
    const sorted = sortRows([row('Zed Prof', 3.0), row('Amy Prof', 3.0)]);
    expect(sorted.map((r) => r.name)).toEqual(['Amy Prof', 'Zed Prof']);
  });

  it('does not mutate its input', () => {
    const input = [row('B Prof', 1), row('A Prof', 5)];
    const copy = [...input];
    sortRows(input);
    expect(input).toEqual(copy);
  });
});

describe('UPISidebar', () => {
  it('shows skeletons while loading', () => {
    const sidebar = mount();
    expect(sidebar.loading).toBe(true);
    expect(sidebar.shadowRoot?.querySelectorAll('.upi-skeleton').length).toBeGreaterThan(0);
  });

  it('renders rows best-first once data arrives', () => {
    const sidebar = mount();
    sidebar.rows = [row('A Prof', 2.0), row('B Prof', 4.8)];

    expect(rowTexts(sidebar)).toEqual(['B Prof', 'A Prof']);
    expect(sidebar.shadowRoot?.querySelectorAll('.upi-skeleton')).toHaveLength(0);
  });

  it('shows the instructor count', () => {
    const sidebar = mount();
    sidebar.rows = [row('A Prof', 2.0), row('B Prof', 4.8)];
    expect(sidebar.shadowRoot?.querySelector('.count')?.textContent).toBe('2 instructors');
  });

  it('singularizes the count', () => {
    const sidebar = mount();
    sidebar.rows = [row('A Prof', 2.0)];
    expect(sidebar.shadowRoot?.querySelector('.count')?.textContent).toBe('1 instructor');
  });

  it('colors each score by rating', () => {
    const sidebar = mount();
    sidebar.rows = [row('Good Prof', 4.5), row('Bad Prof', 1.5)];

    const scores = [...(sidebar.shadowRoot?.querySelectorAll('.score') ?? [])] as HTMLElement[];
    expect(scores[0]?.style.getPropertyValue('--row-color')).toBe(COLOR_GOOD);
    expect(scores[1]?.style.getPropertyValue('--row-color')).toBe(COLOR_BAD);
  });

  it('shows N/A in gray for an unmatched instructor', () => {
    const sidebar = mount();
    sidebar.rows = [{ name: 'Ghost Prof', data: null }];

    const score = sidebar.shadowRoot?.querySelector('.score') as HTMLElement;
    expect(score.textContent).toBe('N/A');
    expect(score.style.getPropertyValue('--row-color')).toBe(COLOR_UNKNOWN);
    expect(sidebar.shadowRoot?.textContent).toContain('No RMP match');
  });

  it('summarizes department and rating count', () => {
    const sidebar = mount();
    sidebar.rows = [row('A Prof', 3.0, { department: 'Mathematics', numRatings: 42 })];
    expect(sidebar.shadowRoot?.textContent).toContain('Mathematics · 42 ratings');
  });

  it('shows an empty state', () => {
    const sidebar = mount();
    sidebar.rows = [];
    expect(sidebar.shadowRoot?.textContent).toContain('No instructors detected');
  });

  it('emits upi-sidebar-select with the row', () => {
    const sidebar = mount();
    const rows = [row('A Prof', 3.0)];
    sidebar.rows = rows;

    let detail: ComparisonRow | undefined;
    sidebar.addEventListener(SIDEBAR_SELECT_EVENT, (e) => {
      detail = (e as CustomEvent<ComparisonRow>).detail;
    });
    (sidebar.shadowRoot?.querySelector('.row') as HTMLButtonElement).click();

    expect(detail?.name).toBe('A Prof');
  });

  it('closes when the close button is pressed', () => {
    const sidebar = mount();
    (sidebar.shadowRoot?.querySelector('.close') as HTMLButtonElement).click();
    expect(sidebar.isConnected).toBe(false);
  });
});

describe('shouldShow', () => {
  it('needs at least two instructors', () => {
    expect(shouldShow(true, 2)).toBe(true);
    expect(shouldShow(true, 1)).toBe(false);
    expect(shouldShow(true, 0)).toBe(false);
  });

  it('respects the setting', () => {
    expect(shouldShow(false, 5)).toBe(false);
  });
});

describe('syncSidebar', () => {
  const two = [row('A Prof', 2.0), row('B Prof', 4.8)];

  it('mounts when enabled with enough rows', () => {
    syncSidebar(document, { enabled: true, rows: two, loading: false });
    expect(document.querySelectorAll(SIDEBAR_TAG)).toHaveLength(1);
  });

  it('does not mount when disabled', () => {
    syncSidebar(document, { enabled: false, rows: two, loading: false });
    expect(document.querySelectorAll(SIDEBAR_TAG)).toHaveLength(0);
  });

  it('does not mount for a single instructor', () => {
    syncSidebar(document, { enabled: true, rows: [row('Solo Prof', 3)], loading: false });
    expect(document.querySelectorAll(SIDEBAR_TAG)).toHaveLength(0);
  });

  it('reuses the same element across updates', () => {
    const first = syncSidebar(document, { enabled: true, rows: two, loading: true });
    const second = syncSidebar(document, { enabled: true, rows: two, loading: false });

    expect(second).toBe(first);
    expect(document.querySelectorAll(SIDEBAR_TAG)).toHaveLength(1);
  });

  it('tears down when the setting is turned off', () => {
    syncSidebar(document, { enabled: true, rows: two, loading: false });
    syncSidebar(document, { enabled: false, rows: two, loading: false });

    expect(document.querySelectorAll(SIDEBAR_TAG)).toHaveLength(0);
  });

  it('tears down when results drop below two instructors', () => {
    syncSidebar(document, { enabled: true, rows: two, loading: false });
    syncSidebar(document, { enabled: true, rows: [row('Solo Prof', 3)], loading: false });

    expect(document.querySelectorAll(SIDEBAR_TAG)).toHaveLength(0);
  });

  it('scrolls to the badge when a row is selected', () => {
    const anchor = document.createElement('span');
    document.body.appendChild(anchor);
    const scrollIntoView = vi.fn();
    anchor.scrollIntoView = scrollIntoView;

    const sidebar = syncSidebar(document, {
      enabled: true,
      rows: two,
      loading: false,
      anchorFor: () => anchor,
    });
    (sidebar?.shadowRoot?.querySelector('.row') as HTMLButtonElement).click();

    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('remounts after the user closes it and results change', () => {
    const sidebar = syncSidebar(document, { enabled: true, rows: two, loading: false });
    sidebar?.remove();

    syncSidebar(document, { enabled: true, rows: two, loading: false });
    expect(document.querySelectorAll(SIDEBAR_TAG)).toHaveLength(1);
  });
});
