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

/**
 * A rating pill, as a plain element with a shadow root.
 *
 * Deliberately NOT a custom element. `window.customElements` is `null` inside a
 * content script's isolated world, so `customElements.define` throws there.
 * and because these components registered themselves at module scope, that
 * single throw killed the entire content script before it did anything. Every
 * jsdom test and the module-loading harness passed regardless, because both run
 * in a normal page context where the registry exists.
 *
 * `attachShadow` is an ordinary DOM method and works fine in an isolated world,
 * so the encapsulation is unchanged. Unknown tags are valid HTML, so the host
 * keeps the descriptive `upi-badge` name.
 */
export class UPIBadge {
  static readonly styles = STYLES;

  /** The element to insert into the page. */
  readonly el: HTMLElement;

  #shadow: ShadowRoot;
  #badge: HTMLSpanElement;
  #data: BadgeData = 'loading';
  #rank: RankContext | null = null;

  constructor(doc: Document = document) {
    this.el = doc.createElement(BADGE_TAG);
    this.#shadow = this.el.attachShadow({ mode: 'open' });

    const style = doc.createElement('style');
    style.textContent = UPIBadge.styles;

    this.#badge = doc.createElement('span');
    this.#badge.className = 'badge';

    this.#shadow.append(style, this.#badge);

    this.el.setAttribute('role', 'button');
    this.el.setAttribute('tabindex', '0');

    this.el.addEventListener('click', this.#emitClick);
    this.el.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Enter' || (event as KeyboardEvent).key === ' ') {
        event.preventDefault();
        this.#emitClick();
      }
    });

    REGISTRY.set(this.el, this);
    this.#render();
  }

  /** Mirrors `element.dataset` so callers can tag the host. */
  get dataset(): DOMStringMap {
    return this.el.dataset;
  }

  remove(): void {
    this.el.remove();
  }

  get isConnected(): boolean {
    return this.el.isConnected;
  }

  click(): void {
    this.el.click();
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.el.addEventListener(type, listener);
  }

  get shadowRoot(): ShadowRoot {
    return this.#shadow;
  }

  #emitClick = (): void => {
    this.el.dispatchEvent(
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
    const doc = this.el.ownerDocument;
    const data = this.#data;
    this.#badge.classList.toggle('is-loading', data === 'loading');

    if (data === 'loading') {
      this.#badge.textContent = '   ';
      this.#apply('Looking up Rate My Professors…', COLOR_UNKNOWN, 'Loading professor rating');
      return;
    }

    if (data === 'error') {
      this.#badge.textContent = '?';
      this.#apply(
        'Could not reach Rate My Professors. Click to retry',
        COLOR_BAD,
        'Rating unavailable',
      );
      return;
    }

    if (data === null) {
      this.#badge.textContent = 'N/A';
      this.#apply(
        'No Rate My Professors match for this instructor',
        COLOR_UNKNOWN,
        'No rating found',
      );
      return;
    }

    if (data.overallRating === null) {
      this.#badge.textContent = 'N/A';
      this.#apply(
        `${data.name} is on Rate My Professors but has no ratings yet`,
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
    this.el.title = tooltip;
    this.el.style.setProperty('--upi-bg', color);
    this.el.setAttribute('aria-label', ariaLabel);
  }

  /** Convenience for tests and callers holding only the host element. */
  get title(): string {
    return this.el.title;
  }

  get style(): CSSStyleDeclaration {
    return this.el.style;
  }

  getAttribute(name: string): string | null {
    return this.el.getAttribute(name);
  }
}

/**
 * Host element -> badge, so code holding only a DOM node can reach its state.
 *
 * A custom element would have carried its own properties; a plain element
 * cannot, so the association lives here. Weak, so a badge removed from the
 * page is collectable.
 */
const REGISTRY = new WeakMap<HTMLElement, UPIBadge>();

/** The badge that owns `element`, if it is one of ours. */
export function badgeFromElement(element: Element | null | undefined): UPIBadge | null {
  if (!element) return null;
  return REGISTRY.get(element as HTMLElement) ?? null;
}

/** Every badge currently in `root`, in document order. */
export function badgesIn(root: ParentNode): UPIBadge[] {
  return [...root.querySelectorAll<HTMLElement>(BADGE_TAG)]
    .map((el) => REGISTRY.get(el))
    .filter((b): b is UPIBadge => b !== undefined);
}
