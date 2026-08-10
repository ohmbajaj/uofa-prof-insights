import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SIDEBAR_SELECT_EVENT,
  SIDEBAR_TAG,
  UPISidebar,
  sortRows,
} from '@content/components/ComparisonSidebar';
import type { ComparisonRow } from '@content/components/ComparisonSidebar';
import {
  isDismissed,
  overlapsStrip,
  resetSidebarState,
  shouldShow,
  syncSidebar,
} from '@content/sidebar-controller';
import { COLOR_BAD, COLOR_GOOD, COLOR_UNKNOWN } from '@shared/constants';
import { makeProfessor } from '../helpers/chrome-mock';

function row(name: string, rating: number | null, patch = {}): ComparisonRow {
  return { name, data: makeProfessor({ name, overallRating: rating, ...patch }) };
}

function mount(): UPISidebar {
  const sidebar = new UPISidebar(document);
  document.body.appendChild(sidebar.el);
  return sidebar;
}

function rowTexts(sidebar: UPISidebar): string[] {
  return [...(sidebar.shadowRoot?.querySelectorAll('.meta .name') ?? [])].map(
    (n) => n.textContent ?? '',
  );
}

beforeEach(() => {
  document.body.innerHTML = '';
  // The controller writes to body.style, which innerHTML does not reset.
  document.body.removeAttribute('style');
  delete document.body.dataset.upiPaddingRight;
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

  it('remounts if it was detached without being dismissed', () => {
    const sidebar = syncSidebar(document, { enabled: true, rows: two, loading: false });
    sidebar?.remove();

    syncSidebar(document, { enabled: true, rows: two, loading: false });
    expect(document.querySelectorAll(SIDEBAR_TAG)).toHaveLength(1);
  });
});

describe('syncSidebar — reserving page space', () => {
  const two = [row('A Prof', 2.0), row('B Prof', 4.8)];

  it('pads the body so the panel does not cover the page', () => {
    syncSidebar(document, { enabled: true, rows: two, loading: false });
    // jsdom reports 0 for getBoundingClientRect, so the constant is the floor.
    expect(document.body.style.paddingRight).toBe('300px');
  });

  it('restores the original padding when torn down', () => {
    document.body.style.paddingRight = '12px';

    syncSidebar(document, { enabled: true, rows: two, loading: false });
    syncSidebar(document, { enabled: false, rows: two, loading: false });

    expect(document.body.style.paddingRight).toBe('12px');
  });

  it('restores empty padding when there was none', () => {
    syncSidebar(document, { enabled: true, rows: two, loading: false });
    syncSidebar(document, { enabled: false, rows: two, loading: false });

    expect(document.body.style.paddingRight).toBe('');
  });

  it('does not stack padding across repeated syncs', () => {
    syncSidebar(document, { enabled: true, rows: two, loading: false });
    syncSidebar(document, { enabled: true, rows: two, loading: false });
    syncSidebar(document, { enabled: true, rows: two, loading: false });

    expect(document.body.style.paddingRight).toBe('300px');
  });

  it('releases the padding when the user dismisses it', () => {
    const sidebar = syncSidebar(document, { enabled: true, rows: two, loading: false });
    (sidebar?.shadowRoot?.querySelector('.close') as HTMLButtonElement).click();

    expect(document.body.style.paddingRight).toBe('');
  });
});

/**
 * The reservation is only worth its cost when the panel is actually covering
 * something. In classic UAccess the Instructor column is the rightmost one, so
 * its badges sit under the panel; in the Student Center the instructor sits in
 * the middle of a card and the panel covers nothing, which makes reflowing the
 * whole page pure damage.
 */
describe('overlapsStrip', () => {
  const rect = (right: number) => ({ right }) as DOMRect;

  it('is true for a badge in the right-hand strip', () => {
    // 1900 wide, panel takes 1600..1900; a badge ending at 1700 is under it.
    expect(overlapsStrip([rect(1700)], 1900, 300)).toBe(true);
  });

  it('is false when every badge sits clear of the strip', () => {
    // The Class Schedule case: instructor names end well short of the edge.
    expect(overlapsStrip([rect(1185), rect(900)], 1900, 300)).toBe(false);
  });

  it('is true when any single badge reaches the strip', () => {
    expect(overlapsStrip([rect(200), rect(1650)], 1900, 300)).toBe(true);
  });

  it('is false with no badges at all', () => {
    expect(overlapsStrip([], 1900, 300)).toBe(false);
  });

  it('treats a badge ending exactly at the boundary as clear', () => {
    expect(overlapsStrip([rect(1600)], 1900, 300)).toBe(false);
  });

  it('overlaps everything on a viewport narrower than the panel', () => {
    expect(overlapsStrip([rect(10)], 250, 300)).toBe(true);
  });
});

/**
 * The Student Center sizes its chrome against the viewport, so narrowing the
 * body does not narrow those bars — the document simply grows wider than the
 * window and the whole page starts scrolling sideways, with the panel covering
 * nothing to begin with. jsdom performs no layout, so the widths are stubbed;
 * what is under test is the decision, not the measurement.
 */
describe('syncSidebar — pages that cannot absorb the reservation', () => {
  const two = [row('A Prof', 2.0), row('B Prof', 4.8)];

  /**
   * Stubs the page as `clientWidth` wide with content of `scrollWidth`, and
   * puts a badge under the panel so the reservation is warranted at all.
   */
  function stubWidths(scrollWidth: () => number, clientWidth = 1000): () => void {
    const root = document.documentElement;
    Object.defineProperty(root, 'scrollWidth', { get: scrollWidth, configurable: true });
    Object.defineProperty(root, 'clientWidth', { get: () => clientWidth, configurable: true });

    const badge = document.createElement('upi-badge');
    badge.getBoundingClientRect = () => ({ right: clientWidth - 20 }) as DOMRect;
    document.body.appendChild(badge);

    return () => {
      delete (root as unknown as Record<string, unknown>).scrollWidth;
      delete (root as unknown as Record<string, unknown>).clientWidth;
      badge.remove();
    };
  }

  it('backs the padding out when it introduces horizontal scrolling', () => {
    // Fits until the body is padded, then overflows by the panel's width.
    const restore = stubWidths(() => (document.body.style.paddingRight ? 1300 : 1000));
    try {
      syncSidebar(document, { enabled: true, rows: two, loading: false });
      expect(document.body.style.paddingRight).toBe('');
    } finally {
      restore();
    }
  });

  it('keeps the padding on a page that reflows into it', () => {
    const restore = stubWidths(() => 1000);
    try {
      syncSidebar(document, { enabled: true, rows: two, loading: false });
      expect(document.body.style.paddingRight).toBe('300px');
    } finally {
      restore();
    }
  });

  it('leaves a page that already scrolls sideways alone', () => {
    const restore = stubWidths(() => 1600);
    try {
      syncSidebar(document, { enabled: true, rows: two, loading: false });
      expect(document.body.style.paddingRight).toBe('');
    } finally {
      restore();
    }
  });

  it('still shows the panel when the reservation is refused', () => {
    const restore = stubWidths(() => (document.body.style.paddingRight ? 1300 : 1000));
    try {
      syncSidebar(document, { enabled: true, rows: two, loading: false });
      expect(document.querySelectorAll(SIDEBAR_TAG)).toHaveLength(1);
    } finally {
      restore();
    }
  });

  it('does not restore a padding it never applied', () => {
    const restore = stubWidths(() => (document.body.style.paddingRight === '300px' ? 1300 : 1000));
    try {
      document.body.style.paddingRight = '12px';
      syncSidebar(document, { enabled: true, rows: two, loading: false });
      syncSidebar(document, { enabled: false, rows: two, loading: false });

      expect(document.body.style.paddingRight).toBe('12px');
    } finally {
      restore();
    }
  });

  /**
   * The reported bug, end to end: a Class Schedule page whose instructor names
   * sit mid-card. The panel covers nothing, so the page must be left exactly as
   * it was found.
   */
  it('leaves the page untouched when no badge is under the panel', () => {
    const root = document.documentElement;
    Object.defineProperty(root, 'clientWidth', { get: () => 1900, configurable: true });

    const badge = document.createElement('upi-badge');
    badge.getBoundingClientRect = () => ({ right: 1185 }) as DOMRect;
    document.body.appendChild(badge);

    try {
      syncSidebar(document, { enabled: true, rows: two, loading: false });

      expect(document.body.style.paddingRight).toBe('');
      expect(document.body.dataset.upiPaddingRight).toBeUndefined();
      // The panel is still there — it just is not shoving the page around.
      expect(document.querySelectorAll(SIDEBAR_TAG)).toHaveLength(1);
    } finally {
      delete (root as unknown as Record<string, unknown>).clientWidth;
      badge.remove();
    }
  });
});

describe('syncSidebar — dismissal', () => {
  const two = [row('A Prof', 2.0), row('B Prof', 4.8)];

  function dismiss(sidebar: UPISidebar | null): void {
    (sidebar?.shadowRoot?.querySelector('.close') as HTMLButtonElement).click();
  }

  it('stays closed after the user dismisses it', () => {
    const sidebar = syncSidebar(document, { enabled: true, rows: two, loading: false });
    dismiss(sidebar);
    expect(document.querySelectorAll(SIDEBAR_TAG)).toHaveLength(0);

    // A later detection pass must not put it straight back.
    syncSidebar(document, { enabled: true, rows: two, loading: false });
    expect(document.querySelectorAll(SIDEBAR_TAG)).toHaveLength(0);
  });

  it('records the dismissal', () => {
    expect(isDismissed()).toBe(false);
    dismiss(syncSidebar(document, { enabled: true, rows: two, loading: false }));
    expect(isDismissed()).toBe(true);
  });

  it('stays closed across many subsequent passes', () => {
    dismiss(syncSidebar(document, { enabled: true, rows: two, loading: false }));

    for (let i = 0; i < 5; i++) {
      syncSidebar(document, { enabled: true, rows: two, loading: false });
    }
    expect(document.querySelectorAll(SIDEBAR_TAG)).toHaveLength(0);
  });

  it('is forgotten on a fresh page load', () => {
    dismiss(syncSidebar(document, { enabled: true, rows: two, loading: false }));
    resetSidebarState(); // stands in for a new page

    syncSidebar(document, { enabled: true, rows: two, loading: false });
    expect(document.querySelectorAll(SIDEBAR_TAG)).toHaveLength(1);
  });
});
