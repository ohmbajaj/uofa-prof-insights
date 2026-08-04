import { getRatingColor } from '@shared/utils';
import { COLOR_BAD, COLOR_UNKNOWN } from '@shared/constants';
import type { ProfessorData } from '@shared/types';

export const BADGE_TAG = 'upi-badge';
export const BADGE_CLICK_EVENT = 'upi-badge-click';

/** `'loading'` before the lookup resolves, `'error'` when it fails, `null` when RMP has no match. */
export type BadgeData = ProfessorData | null | 'loading' | 'error';

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

    const plural = data.numRatings === 1 ? 'rating' : 'ratings';
    this.#apply(
      `Based on ${data.numRatings} ${plural} on RMP`,
      getRatingColor(data.overallRating),
      `${data.name}: ${rating} out of 5, based on ${data.numRatings} ${plural}`,
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
