import { COLOR_GOOD, COLOR_OK, COLOR_UNKNOWN } from '@shared/constants';

export const FILTER_TAG = 'upi-filter';
export const FILTER_CHANGE_EVENT = 'upi-filter-change';

/**
 * Minimum rating a section's instructor must have to stay visible.
 * `null` shows everything.
 */
export type RatingFloor = number | null;

export interface FilterState {
  floor: RatingFloor;
  /** Keep sections whose instructor has no RMP rating at all. */
  includeUnrated: boolean;
}

export const DEFAULT_FILTER: FilterState = { floor: null, includeUnrated: true };

/** Offered thresholds, chosen to line up with the badge colours. */
const FLOORS: { label: string; value: RatingFloor; color: string }[] = [
  { label: 'All', value: null, color: COLOR_UNKNOWN },
  { label: '2.5+', value: 2.5, color: COLOR_OK },
  { label: '3.5+', value: 3.5, color: COLOR_GOOD },
  { label: '4+', value: 4, color: COLOR_GOOD },
];

const STYLES = `
  :host {
    display: block;
    margin: 8px 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: 12px;
    color: #1a1a1a;
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid #dfe3e8;
    border-left: 3px solid #ab0532;
    border-radius: 4px;
    background: #f8f9fb;
  }

  .label { font-weight: 700; }

  .group { display: inline-flex; border: 1px solid #cfd6de; border-radius: 4px; overflow: hidden; }

  .group button {
    border: 0;
    border-right: 1px solid #cfd6de;
    background: #fff;
    font: inherit;
    padding: 3px 9px;
    cursor: pointer;
    color: #333;
  }
  .group button:last-child { border-right: 0; }
  .group button:hover { background: #eef2f7; }
  .group button[aria-pressed='true'] {
    background: var(--accent, #0c234b);
    color: #fff;
    font-weight: 700;
  }

  label.toggle { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; }

  .count { color: #5a6472; margin-left: auto; }
  .count strong { color: #1a1a1a; }
`;

/**
 * Controls for hiding sections by instructor rating.
 *
 * This is the feature with no equivalent outside UAccess: choosing a section is
 * a filtering problem over the whole results page, and nothing in a separate
 * RateMyProfessors tab can act on the list in front of you.
 */
export class UPIFilterBar extends HTMLElement {
  static readonly styles = STYLES;

  #shadow: ShadowRoot;
  #bar: HTMLElement;
  #state: FilterState = { ...DEFAULT_FILTER };
  #visible = 0;
  #total = 0;
  #pending = 0;

  constructor() {
    super();
    const doc = this.ownerDocument;
    this.#shadow = this.attachShadow({ mode: 'open' });

    const style = doc.createElement('style');
    style.textContent = UPIFilterBar.styles;

    this.#bar = doc.createElement('div');
    this.#bar.className = 'bar';

    this.#shadow.append(style, this.#bar);
  }

  connectedCallback(): void {
    if (!this.hasAttribute('role')) this.setAttribute('role', 'group');
    if (!this.hasAttribute('aria-label')) {
      this.setAttribute('aria-label', 'Filter sections by instructor rating');
    }
    this.#render();
  }

  get state(): FilterState {
    return this.#state;
  }

  set state(value: FilterState) {
    this.#state = value;
    this.#render();
  }

  /** Section counts, shown so the filter's effect is legible. */
  setCounts(visible: number, total: number, pending: number): void {
    this.#visible = visible;
    this.#total = total;
    this.#pending = pending;
    this.#render();
  }

  #emit(): void {
    this.dispatchEvent(
      new CustomEvent<FilterState>(FILTER_CHANGE_EVENT, {
        detail: this.#state,
        bubbles: true,
        composed: true,
      }),
    );
  }

  #render(): void {
    const doc = this.ownerDocument;
    this.#bar.replaceChildren();

    const label = doc.createElement('span');
    label.className = 'label';
    label.textContent = 'Instructor rating';

    const group = doc.createElement('div');
    group.className = 'group';
    for (const floor of FLOORS) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.textContent = floor.label;
      const active = this.#state.floor === floor.value;
      button.setAttribute('aria-pressed', String(active));
      if (active && floor.value !== null) button.style.setProperty('--accent', floor.color);

      button.addEventListener('click', () => {
        this.#state = { ...this.#state, floor: floor.value };
        this.#render();
        this.#emit();
      });
      group.appendChild(button);
    }

    const toggle = doc.createElement('label');
    toggle.className = 'toggle';
    const checkbox = doc.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = this.#state.includeUnrated;
    checkbox.addEventListener('change', () => {
      this.#state = { ...this.#state, includeUnrated: checkbox.checked };
      this.#render();
      this.#emit();
    });
    toggle.append(checkbox, doc.createTextNode('Keep unrated'));

    const count = doc.createElement('span');
    count.className = 'count';
    count.setAttribute('role', 'status');
    if (this.#pending > 0) {
      count.textContent = `checking ${this.#pending} more…`;
    } else {
      const strong = doc.createElement('strong');
      strong.textContent = `${this.#visible}`;
      count.append(strong, doc.createTextNode(` of ${this.#total} sections shown`));
    }

    this.#bar.append(label, group, toggle, count);
  }
}

export function defineFilterBar(win: Window & typeof globalThis = window): void {
  if (!win.customElements.get(FILTER_TAG)) {
    win.customElements.define(FILTER_TAG, UPIFilterBar);
  }
}

defineFilterBar();
