import { getRatingColor } from '@shared/utils';
import { COLOR_UNKNOWN } from '@shared/constants';
import type { ProfessorData } from '@shared/types';
import { SKELETON_STYLES, createSkeletonList } from './Skeleton';

export const SIDEBAR_TAG = 'upi-sidebar';
export const SIDEBAR_SELECT_EVENT = 'upi-sidebar-select';

/** One row: a professor we resolved, or a name we could not match. */
export interface ComparisonRow {
  name: string;
  data: ProfessorData | null;
}

const STYLES = `
  :host {
    position: fixed;
    top: 0;
    right: 0;
    z-index: 2147483646;
    display: flex;
    flex-direction: column;
    width: 300px;
    max-width: 92vw;
    height: 100%;
    background: #fff;
    border-left: 1px solid #d6d6d6;
    box-shadow: -4px 0 16px rgba(0, 0, 0, 0.12);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: 13px;
    color: #1a1a1a;
  }

  :host([hidden]) { display: none; }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 12px 14px;
    border-bottom: 1px solid #e6e6e6;
    background: #0c234b; /* UofA blue */
    color: #fff;
  }
  header h2 { margin: 0; font-size: 13px; font-weight: 600; }
  header .count { font-size: 11px; opacity: 0.8; }

  .close {
    border: 0;
    background: transparent;
    color: #fff;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 3px;
  }
  .close:hover { background: rgba(255, 255, 255, 0.15); }

  .list { flex: 1; overflow-y: auto; padding: 8px; margin: 0; list-style: none; }

  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    text-align: left;
    cursor: pointer;
    font: inherit;
    color: inherit;
  }
  .row:hover { background: #f2f5fa; }

  .score {
    flex: 0 0 auto;
    min-width: 38px;
    padding: 4px 0;
    border-radius: 4px;
    background: var(--row-color, ${COLOR_UNKNOWN});
    color: #fff;
    font-weight: 700;
    text-align: center;
  }

  .meta { min-width: 0; }
  .meta .name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta .sub { color: #666; font-size: 11px; }

  .empty { padding: 20px 14px; color: #666; text-align: center; }

  ${SKELETON_STYLES}
`;

function scoreText(data: ProfessorData | null): string {
  if (!data || data.overallRating === null) return 'N/A';
  return data.overallRating.toFixed(1);
}

function subText(data: ProfessorData | null): string {
  if (!data) return 'No RMP match';
  if (data.numRatings === 0) return `${data.department} · no ratings`;
  const plural = data.numRatings === 1 ? 'rating' : 'ratings';
  return `${data.department} · ${data.numRatings} ${plural}`;
}

/**
 * Sorts best-first: rated professors by descending rating, then unrated, then
 * unmatched names. Ties break alphabetically so the order is stable between
 * detection passes.
 */
export function sortRows(rows: ComparisonRow[]): ComparisonRow[] {
  return [...rows].sort((a, b) => {
    const ra = a.data?.overallRating ?? null;
    const rb = b.data?.overallRating ?? null;
    if (ra !== null && rb !== null && ra !== rb) return rb - ra;
    if (ra !== null && rb === null) return -1;
    if (ra === null && rb !== null) return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Side panel ranking every instructor on the current results page.
 *
 * Shown only when the `showComparison` setting is on and at least two
 * professors were detected — a single-section search has nothing to compare.
 */
export class UPISidebar extends HTMLElement {
  static readonly styles = STYLES;

  #shadow: ShadowRoot;
  #list: HTMLElement;
  #countLabel: HTMLElement;
  #rows: ComparisonRow[] = [];
  #loading = true;

  constructor() {
    super();
    const doc = this.ownerDocument;
    this.#shadow = this.attachShadow({ mode: 'open' });

    const style = doc.createElement('style');
    style.textContent = UPISidebar.styles;

    const header = doc.createElement('header');
    const title = doc.createElement('h2');
    title.textContent = 'Instructor comparison';
    this.#countLabel = doc.createElement('span');
    this.#countLabel.className = 'count';

    const heading = doc.createElement('div');
    heading.append(title, this.#countLabel);

    const close = doc.createElement('button');
    close.className = 'close';
    close.type = 'button';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Close comparison');
    close.addEventListener('click', () => this.remove());

    header.append(heading, close);

    this.#list = doc.createElement('ul');
    this.#list.className = 'list';

    this.#shadow.append(style, header, this.#list);
  }

  connectedCallback(): void {
    if (!this.hasAttribute('role')) this.setAttribute('role', 'complementary');
    if (!this.hasAttribute('aria-label')) {
      this.setAttribute('aria-label', 'Instructor rating comparison');
    }
    this.#render();
  }

  get rows(): ComparisonRow[] {
    return this.#rows;
  }

  set rows(value: ComparisonRow[]) {
    this.#rows = value;
    this.#loading = false;
    this.#render();
  }

  get loading(): boolean {
    return this.#loading;
  }

  set loading(value: boolean) {
    this.#loading = value;
    this.#render();
  }

  #render(): void {
    const doc = this.ownerDocument;
    this.#list.replaceChildren();

    if (this.#loading) {
      this.#countLabel.textContent = 'loading…';
      this.#list.appendChild(createSkeletonList(doc, 4));
      return;
    }

    const rows = sortRows(this.#rows);
    this.#countLabel.textContent = `${rows.length} instructor${rows.length === 1 ? '' : 's'}`;

    if (rows.length === 0) {
      const empty = doc.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'No instructors detected on this page.';
      this.#list.appendChild(empty);
      return;
    }

    for (const row of rows) {
      this.#list.appendChild(this.#renderRow(row));
    }
  }

  #renderRow(row: ComparisonRow): HTMLElement {
    const doc = this.ownerDocument;
    const item = doc.createElement('li');

    const button = doc.createElement('button');
    button.className = 'row';
    button.type = 'button';

    const score = doc.createElement('span');
    score.className = 'score';
    score.textContent = scoreText(row.data);
    score.style.setProperty('--row-color', getRatingColor(row.data?.overallRating ?? null));

    const meta = doc.createElement('span');
    meta.className = 'meta';
    const name = doc.createElement('span');
    name.className = 'name';
    name.textContent = row.data?.name ?? row.name;
    const sub = doc.createElement('span');
    sub.className = 'sub';
    sub.textContent = subText(row.data);
    meta.append(name, sub);

    button.append(score, meta);
    button.addEventListener('click', () => {
      this.dispatchEvent(
        new CustomEvent<ComparisonRow>(SIDEBAR_SELECT_EVENT, {
          detail: row,
          bubbles: true,
          composed: true,
        }),
      );
    });

    item.appendChild(button);
    return item;
  }
}

export function defineSidebar(win: Window & typeof globalThis = window): void {
  if (!win.customElements.get(SIDEBAR_TAG)) {
    win.customElements.define(SIDEBAR_TAG, UPISidebar);
  }
}

defineSidebar();
