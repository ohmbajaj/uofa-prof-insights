import { MIN_COMPARISON_ROWS } from '@shared/constants';
import {
  SIDEBAR_DISMISS_EVENT,
  SIDEBAR_SELECT_EVENT,
  SIDEBAR_TAG,
  UPISidebar,
  defineSidebar,
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

export function removeSidebar(): void {
  sidebar?.remove();
  sidebar = null;
}

/** Mounts, updates, or tears down the sidebar to match `options`. */
export function syncSidebar(doc: Document, options: SyncOptions): UPISidebar | null {
  const { enabled, rows, loading, anchorFor } = options;

  if (dismissed || !shouldShow(enabled, rows.length)) {
    removeSidebar();
    return null;
  }

  if (!sidebar || !sidebar.isConnected) {
    const win = doc.defaultView;
    if (!win) return null;
    defineSidebar(win as Window & typeof globalThis);

    sidebar = doc.createElement(SIDEBAR_TAG) as UPISidebar;
    sidebar.addEventListener(SIDEBAR_SELECT_EVENT, (event) => {
      const row = (event as CustomEvent<ComparisonRow>).detail;
      const anchor = anchorFor?.(row);
      anchor?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    sidebar.addEventListener(SIDEBAR_DISMISS_EVENT, () => {
      dismissed = true;
      sidebar = null;
    });
    doc.body.appendChild(sidebar);
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
