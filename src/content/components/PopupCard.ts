import { getRatingColor } from '@shared/utils';
import { COLOR_UNKNOWN } from '@shared/constants';
import type { ProfessorData } from '@shared/types';

export const CARD_TAG = 'upi-card';

const STYLES = `
  :host {
    position: absolute;
    z-index: 2147483647;
    display: block;
    width: 268px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: 13px;
    line-height: 1.4;
    color: #1a1a1a;
  }

  .card {
    background: #fff;
    border: 1px solid #d6d6d6;
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16);
    padding: 12px 14px;
  }

  header { margin-bottom: 10px; padding-right: 20px; }

  .name { font-weight: 600; font-size: 14px; }
  .dept { color: #666; font-size: 12px; margin-top: 1px; }

  .close {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 22px;
    height: 22px;
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: #666;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
  }
  .close:hover { background: #eee; color: #111; }

  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    margin-bottom: 10px;
  }

  .stat {
    background: #f6f6f6;
    border-radius: 4px;
    padding: 6px 4px;
    text-align: center;
  }
  .stat .value { font-weight: 700; font-size: 15px; }
  .stat .label { color: #666; font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em; }
  .stat.primary .value { color: var(--upi-rating-color, ${COLOR_UNKNOWN}); }

  .tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px; }
  .tag {
    background: #eef2f8;
    color: #26436e;
    border-radius: 10px;
    padding: 2px 8px;
    font-size: 11px;
    white-space: nowrap;
  }

  .empty { color: #666; font-size: 12px; margin-bottom: 10px; }

  a.rmp {
    display: inline-block;
    color: #0c234b;
    font-weight: 600;
    font-size: 12px;
    text-decoration: none;
  }
  a.rmp:hover { text-decoration: underline; }

  footer { color: #999; font-size: 10px; margin-top: 8px; }
`;

function fmtRating(value: number | null): string {
  return value === null ? '—' : value.toFixed(1);
}

function fmtPercent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)}%`;
}

/** "3 days ago" style age for the cache timestamp. */
export function formatAge(cachedAt: number, now = Date.now()): string {
  const minutes = Math.floor((now - cachedAt) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

/**
 * Detail card shown when a badge is clicked.
 *
 * Positioned absolutely in the page's own coordinate space rather than
 * `position: fixed`, so it stays anchored to its badge while UAccess scrolls.
 */
export class UPICard extends HTMLElement {
  static readonly styles = STYLES;

  #shadow: ShadowRoot;
  #body: HTMLElement;
  #data: ProfessorData | null = null;

  constructor() {
    super();
    const doc = this.ownerDocument;
    this.#shadow = this.attachShadow({ mode: 'open' });

    const style = doc.createElement('style');
    style.textContent = UPICard.styles;

    this.#body = doc.createElement('div');
    this.#body.className = 'card';

    this.#shadow.append(style, this.#body);
  }

  connectedCallback(): void {
    if (!this.hasAttribute('role')) this.setAttribute('role', 'dialog');
    this.#render();
  }

  get data(): ProfessorData | null {
    return this.#data;
  }

  set data(value: ProfessorData | null) {
    this.#data = value;
    this.#render();
  }

  close(): void {
    this.remove();
  }

  #render(): void {
    const doc = this.ownerDocument;
    const data = this.#data;
    this.#body.replaceChildren();
    if (!data) return;

    this.setAttribute('aria-label', `RateMyProfessor details for ${data.name}`);
    this.style.setProperty('--upi-rating-color', getRatingColor(data.overallRating));

    const close = doc.createElement('button');
    close.className = 'close';
    close.type = 'button';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      this.close();
    });

    const header = doc.createElement('header');
    const name = doc.createElement('div');
    name.className = 'name';
    name.textContent = data.name;
    const dept = doc.createElement('div');
    dept.className = 'dept';
    dept.textContent = `${data.department} · ${data.university}`;
    header.append(name, dept);

    const stats = doc.createElement('div');
    stats.className = 'stats';
    stats.append(
      this.#stat(fmtRating(data.overallRating), 'Rating', true),
      this.#stat(fmtRating(data.difficulty), 'Difficulty'),
      this.#stat(fmtPercent(data.wouldTakeAgain), 'Would retake'),
    );

    this.#body.append(close, header, stats);

    if (data.topTags.length > 0) {
      const tags = doc.createElement('div');
      tags.className = 'tags';
      for (const tag of data.topTags) {
        const chip = doc.createElement('span');
        chip.className = 'tag';
        chip.textContent = tag;
        tags.appendChild(chip);
      }
      this.#body.appendChild(tags);
    } else {
      const empty = doc.createElement('div');
      empty.className = 'empty';
      empty.textContent =
        data.numRatings === 0
          ? 'No ratings on RateMyProfessor yet.'
          : 'No tags for this professor.';
      this.#body.appendChild(empty);
    }

    const link = doc.createElement('a');
    link.className = 'rmp';
    link.href = data.rmpUrl;
    link.target = '_blank';
    // Prevents the new tab from getting a handle back to the UAccess page.
    link.rel = 'noopener noreferrer';
    const plural = data.numRatings === 1 ? 'rating' : 'ratings';
    link.textContent = `View ${data.numRatings} ${plural} on RMP →`;

    const footer = doc.createElement('footer');
    footer.textContent = `Cached ${formatAge(data.cachedAt)}`;

    this.#body.append(link, footer);
  }

  #stat(value: string, label: string, primary = false): HTMLElement {
    const doc = this.ownerDocument;
    const wrapper = doc.createElement('div');
    wrapper.className = primary ? 'stat primary' : 'stat';

    const v = doc.createElement('div');
    v.className = 'value';
    v.textContent = value;

    const l = doc.createElement('div');
    l.className = 'label';
    l.textContent = label;

    wrapper.append(v, l);
    return wrapper;
  }
}

export function defineCard(win: Window & typeof globalThis = window): void {
  if (!win.customElements.get(CARD_TAG)) {
    win.customElements.define(CARD_TAG, UPICard);
  }
}

defineCard();
