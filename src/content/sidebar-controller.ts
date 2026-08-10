import { MIN_COMPARISON_ROWS } from '@shared/constants';
import { BADGE_TAG } from './components/Badge';
import {
  SIDEBAR_DISMISS_EVENT,
  SIDEBAR_SELECT_EVENT,
  SIDEBAR_WIDTH,
  UPISidebar,
} from './components/ComparisonSidebar';
import type { ComparisonRow } from './components/ComparisonSidebar';

let sidebar: UPISidebar | null = null;

/**
 * Set when the user closes the panel.
 *
 * Without this, every subsequent detection pass would helpfully put the sidebar
 * they just dismissed straight back on screen. Deliberately page-scoped rather
 * than persisted: it is a "not right now", not a settings change, and the
 * permanent switch already exists in the popup.
 */
let dismissed = false;

export interface SyncOptions {
  enabled: boolean;
  rows: ComparisonRow[];
  /** True while some lookups are still outstanding. */
  loading: boolean;
  /** Resolves a row back to the badge it belongs to, for scroll-into-view. */
  anchorFor?: (row: ComparisonRow) => HTMLElement | undefined;
}

/**
 * Whether the sidebar is worth showing at all.
 *
 * A single-instructor result has nothing to compare, so the panel would just be
 * chrome taking up 300px of a registration page.
 */
export function shouldShow(enabled: boolean, rowCount: number): boolean {
  return enabled && rowCount >= MIN_COMPARISON_ROWS;
}

export function getSidebar(): UPISidebar | null {
  return sidebar;
}

export function isDismissed(): boolean {
  return dismissed;
}

/** Where the original body padding is stashed while the sidebar is open. */
const PADDING_BACKUP = 'upiPaddingRight';

/** Slack for sub-pixel rounding when comparing scroll width to client width. */
const OVERFLOW_SLACK = 2;

function overflowsHorizontally(doc: Document): boolean {
  const root = doc.documentElement;
  if (!root) return false;
  return root.scrollWidth - root.clientWidth > OVERFLOW_SLACK;
}

/**
 * Whether the panel would actually cover anything the extension put on screen.
 *
 * `strip` is the region the panel occupies: everything right of
 * `viewportWidth - panelWidth`. Nothing to the left of that is at risk, so
 * there is no reason to disturb the page's layout.
 */
export function overlapsStrip(badges: readonly DOMRect[], viewportWidth: number, panel: number) {
  const strip = viewportWidth - panel;
  return badges.some((rect) => rect.right > strip);
}

/**
 * Reserves room for the panel by narrowing the page — but only when the panel
 * is genuinely in the way, and only when the page can absorb it.
 *
 * The panel is `position: fixed`, so with no reservation it covers whatever
 * sits under the right-hand 300px. In classic UAccess that is the Instructor
 * column, the one the badges are attached to; padding the body fixes it there
 * because the results table simply reflows into the narrower space.
 *
 * The Student Center puts instructor names in the middle of a card, nowhere
 * near the right edge, so the panel covers nothing at all — and narrowing the
 * body reflows the entire page for no benefit, which is what "the orientation
 * of the page gets messed up" was. Checking for real overlap first is a
 * stronger rule than checking for damage afterwards, because a reflow that
 * happens to fit is still a reflow the user did not ask for.
 *
 * The overflow check stays as a second gate for the pages that do need the
 * reservation: some layouts cannot absorb it and start scrolling sideways
 * instead, which is worse than the overlap being fixed. Both are measured
 * rather than decided by hostname — this is a property of the page's
 * stylesheet, not of the URL it was served from.
 */
function reserveSpace(doc: Document, sidebar: UPISidebar): void {
  const body = doc.body;
  if (!body || body.dataset[PADDING_BACKUP] !== undefined) return;

  const width = sidebar.getBoundingClientRect().width || SIDEBAR_WIDTH;
  const viewportWidth = doc.documentElement?.clientWidth ?? 0;
  const badges = [...doc.querySelectorAll(BADGE_TAG)].map((el) => el.getBoundingClientRect());

  // `viewportWidth === 0` means nothing has been laid out (jsdom, or a hidden
  // document); no measurement is trustworthy, so fall through to the old
  // behaviour rather than silently skipping the reservation where it is needed.
  if (viewportWidth > 0 && !overlapsStrip(badges, viewportWidth, width)) return;

  // A page already scrolling sideways tells us nothing, so leave it untouched.
  if (overflowsHorizontally(doc)) return;

  const previous = body.style.paddingRight;
  body.style.paddingRight = `${Math.round(width)}px`;

  if (overflowsHorizontally(doc)) {
    // The page cannot absorb it. Let the panel overlay instead — the card
    // positioner already keeps clear of it via `rightInset`.
    body.style.paddingRight = previous;
    return;
  }

  body.dataset[PADDING_BACKUP] = previous;
}

function releaseSpace(doc: Document): void {
  const body = doc.body;
  const original = body?.dataset[PADDING_BACKUP];
  if (!body || original === undefined) return;

  body.style.paddingRight = original;
  delete body.dataset[PADDING_BACKUP];
}

export function removeSidebar(): void {
  const doc = sidebar?.el.ownerDocument ?? document;
  sidebar?.remove();
  sidebar = null;
  releaseSpace(doc);
}

/** Mounts, updates, or tears down the sidebar to match `options`. */
export function syncSidebar(doc: Document, options: SyncOptions): UPISidebar | null {
  const { enabled, rows, loading, anchorFor } = options;

  if (dismissed || !shouldShow(enabled, rows.length)) {
    removeSidebar();
    return null;
  }

  if (!sidebar || !sidebar.isConnected) {
    sidebar = new UPISidebar(doc);
    sidebar.addEventListener(SIDEBAR_SELECT_EVENT, (event) => {
      const row = (event as CustomEvent<ComparisonRow>).detail;
      const anchor = anchorFor?.(row);
      anchor?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    sidebar.addEventListener(SIDEBAR_DISMISS_EVENT, () => {
      dismissed = true;
      sidebar = null;
      releaseSpace(doc);
    });
    doc.body.appendChild(sidebar.el);
    reserveSpace(doc, sidebar);
  }

  sidebar.loading = loading;
  if (!loading) sidebar.rows = rows;
  return sidebar;
}

/** Test seam. */
export function resetSidebarState(): void {
  removeSidebar();
  dismissed = false;
}
