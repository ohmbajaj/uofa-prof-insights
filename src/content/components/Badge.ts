import { getRatingColor } from '@shared/utils';
import { COLOR_BAD, COLOR_UNKNOWN } from '@shared/constants';
import type { ProfessorData } from '@shared/types';

export const BADGE_TAG = 'upi-badge';
export const BADGE_CLICK_EVENT = 'upi-badge-click';

/** `'loading'` before the lookup resolves, `'error'` when it fails, `null` when RMP has no match. */
export type BadgeData = ProfessorData | null | 'loading' | 'error';

/**
 * Where this professor sits among the rated instructors on the same page.
 *
 * A bare 2.9 is close to meaningless; "2.9, and the best of the eight sections
 * offered" is a decision. Only something that can see the whole results page
 * can work this out, which is precisely what a tab open on RateMyProfessors
 * cannot do.
 */
export interface RankContext {
  /** 1-based position among rated instructors, best first. */
  rank: number;
  /** How many instructors on the page have a rating at all. */
  total: number;
}

/**
 * Styles live inside the shadow root so UAccess's PeopleSoft stylesheets cannot
 * reach in and our rules cannot leak out. Sizing is in `em` and the host is
 * `inline-flex` with `vertical-align: middle`, so a badge flows inside a table
 * cell without changing the row height.
 */
const STYLES = `
  :host {
    --upi-fg: #fff;
    --upi-bg: ${COLOR_UNKNOWN};
    --upi-radius: 3px;

    display: inline-flex;
    align-items: center;
    vertical-align: middle;
    margin-left: 6px;
    /* Inherit UAccess's font so the badge reads as part of the page. */
    font-family: inherit;
    font-size: 0.85em;
    line-height: 1;
    cursor: pointer;
    user-select: none;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 6px;
    border-radius: var(--upi-radius);
    background: var(--upi-bg);
    color: var(--upi-fg);
    font-weight: 600;
    white-space: nowrap;
    transition: filter 120ms ease-in-out;
  }

  :host(:hover) .badge {
    filter: brightness(1.08);
  }

  :host(:focus-visible) {
    outline: 2px solid #0c234b; /* UofA blue */
    outline-offset: 2px;
    border-radius: var(--upi-radius);
  }

  .count {
    font-weight: 400;
    opacity: 0.85;
    font-size: 0.9em;
  }

  /* Rank pill, shown only when this professor is the pick of the page. */
  .rank {
    display: inline-flex;
    align-items: center;
    margin-left: 4px;
    padding: 1px 5px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.28);
    font-size: 0.85em;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  /* Loading skeleton */
  .badge.is-loading {
    background: #e3e3e3;
    color: transparent;
    min-width: 34px;
    min-height: 1.15em;
    animation: upi-pulse 1.2s ease-in-out infinite;
  }

  @keyframes upi-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.55; }
  }

  @media (prefers-reduced-motion: reduce) {
    .badge.is-loading { animation: none; }
  }
`;

export class UPIBadge extends HTMLElement {
  static readonly styles = STYLES;

  #shadow: ShadowRoot;
  #badge: HTMLSpanElement;
  #data: BadgeData = 'loading';
  #rank: RankContext | null = null;

  constructor() {
    super();

    // Custom element constructors may populate a shadow root, but must not set
    // attributes or light-DOM children on the host — that throws when the
    // element is upgraded from parsed markup. Attributes are set in
    // connectedCallback instead.
    const doc = this.ownerDocument;
    this.#shadow = this.attachShadow({ mode: 'open' });

    const style = doc.createElement('style');
    style.textContent = UPIBadge.styles;

    this.#badge = doc.createElement('span');
    this.#badge.className = 'badge';

    this.#shadow.append(style, this.#badge);

    this.addEventListener('click', this.#emitClick);
    this.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.#emitClick();
      }
    });
  }

  connectedCallback(): void {
    if (!this.hasAttribute('role')) this.setAttribute('role', 'button');
    if (!this.hasAttribute('tabindex')) this.setAttribute('tabindex', '0');
    this.#render();
  }

  #emitClick = (): void => {
    this.dispatchEvent(
      new CustomEvent<BadgeData>(BADGE_CLICK_EVENT, {
        detail: this.#data,
        bubbles: true,
        // Required for the event to cross the shadow boundary.
        composed: true,
      }),
    );
  };

  get data(): BadgeData {
    return this.#data;
  }

  set data(value: BadgeData) {
    this.#data = value;
    this.#render();
  }

  /** Position among rated instructors on the same page, or null if unknown. */
  get rank(): RankContext | null {
    return this.#rank;
  }

  set rank(value: RankContext | null) {
    this.#rank = value;
    this.#render();
  }

  #render(): void {
    const doc = this.ownerDocument;
    const data = this.#data;
    this.#badge.classList.toggle('is-loading', data === 'loading');

    if (data === 'loading') {
      this.#badge.textContent = '   ';
      this.#apply('Looking up RateMyProfessor…', COLOR_UNKNOWN, 'Loading professor rating');
      return;
    }

    if (data === 'error') {
      this.#badge.textContent = '?';
      this.#apply(
        'Could not reach RateMyProfessors — click to retry',
        COLOR_BAD,
        'Rating unavailable',
      );
      return;
    }

    if (data === null) {
      this.#badge.textContent = 'N/A';
      this.#apply('No RateMyProfessor match for this instructor', COLOR_UNKNOWN, 'No rating found');
      return;
    }

    if (data.overallRating === null) {
      this.#badge.textContent = 'N/A';
      this.#apply(
        `${data.name} is on RateMyProfessor but has no ratings yet`,
        COLOR_UNKNOWN,
        `${data.name}: no ratings yet`,
      );
      return;
    }

    const rating = data.overallRating.toFixed(1);
    const count = doc.createElement('span');
    count.className = 'count';
    count.textContent = `(${data.numRatings})`;
    this.#badge.replaceChildren(doc.createTextNode(`★ ${rating}`), count);

    // Only the top pick earns a pill. Labelling every row "3 of 8" is noise;
    // the one worth acting on is "this is the best section available".
    const isBestOfSeveral = this.#rank !== null && this.#rank.rank === 1 && this.#rank.total > 1;
    if (isBestOfSeveral) {
      const pill = doc.createElement('span');
      pill.className = 'rank';
      pill.textContent = 'BEST';
      this.#badge.appendChild(pill);
    }

    const plural = data.numRatings === 1 ? 'rating' : 'ratings';
    const context =
      this.#rank !== null && this.#rank.total > 1
        ? ` · ranked ${this.#rank.rank} of ${this.#rank.total} rated instructors here`
        : '';

    this.#apply(
      `Based on ${data.numRatings} ${plural} on RMP${context}`,
      getRatingColor(data.overallRating),
      `${data.name}: ${rating} out of 5, based on ${data.numRatings} ${plural}${context}`,
    );
  }

  /** Applies the hover tooltip, background color and screen-reader label. */
  #apply(tooltip: string, color: string, ariaLabel: string): void {
    this.title = tooltip;
    this.style.setProperty('--upi-bg', color);
    this.setAttribute('aria-label', ariaLabel);
  }
}

/**
 * Registers the element on `win`, tolerating a repeat call.
 *
 * Chrome can inject a content script more than once (bfcache restores, some
 * SPA navigations), and a second bare `define()` throws. Registration is also
 * per-window, so an iframe needs its own call — hence the parameter.
 */
export function defineBadge(win: Window & typeof globalThis = window): void {
  if (!win.customElements.get(BADGE_TAG)) {
    win.customElements.define(BADGE_TAG, UPIBadge);
  }
}

defineBadge();
