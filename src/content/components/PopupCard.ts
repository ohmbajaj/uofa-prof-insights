import { getRatingColor, normalizeCourseCode } from '@shared/utils';
import {
  COLOR_UNKNOWN,
  MAX_ALTERNATES_SHOWN,
  MAX_COURSES_SHOWN,
  MIN_PHRASE_MENTIONS,
} from '@shared/constants';
import type { ProfessorData } from '@shared/types';

export const CARD_TAG = 'upi-card';
export const CARD_REFRESH_EVENT = 'upi-card-refresh';

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

  .section {
    margin-bottom: 10px;
    padding-top: 8px;
    border-top: 1px solid #eee;
  }
  .section h3 {
    margin: 0 0 5px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #666;
  }

  .course {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    padding: 2px 0;
  }
  .course .code { font-weight: 600; }
  .course .n { color: #888; font-size: 11px; }
  .course .score { font-weight: 700; color: var(--course-color, #1a1a1a); }
  .course.is-current .code::after {
    content: ' · this course';
    font-weight: 400;
    color: #0c234b;
    font-size: 11px;
  }

  .facts { margin: 0; padding-left: 15px; }
  .facts li { padding: 1px 0; }

  .phrases { display: flex; flex-wrap: wrap; gap: 4px; }
  .phrase {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    background: #f2f4f7;
    border-radius: 3px;
    padding: 2px 6px;
    font-size: 11px;
  }
  .phrase-n { color: #8a8a8a; font-size: 10px; }

  .alt {
    display: block;
    color: #555;
    font-size: 11px;
    text-decoration: none;
    padding: 1px 0;
  }
  .alt:hover { text-decoration: underline; }
  .alt .why { color: #888; }

  a.rmp {
    display: inline-block;
    color: #0c234b;
    font-weight: 600;
    font-size: 12px;
    text-decoration: none;
  }
  a.rmp:hover { text-decoration: underline; }

  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: #999;
    font-size: 10px;
    margin-top: 8px;
  }

  .refresh {
    border: 0;
    background: transparent;
    color: #0c234b;
    font: inherit;
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 3px;
  }
  .refresh:hover:not(:disabled) { background: #eef2f8; }
  .refresh:disabled { color: #999; cursor: default; }
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
  #busy = false;
  /** Course being browsed in UAccess, so its rating can be pinned to the top. */
  #courseCode: string | null = null;

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
    // A completed refresh clears the pending state.
    this.#busy = false;
    this.#render();
  }

  /** Course the user is browsing; its rating is pinned and labelled. */
  get courseCode(): string | null {
    return this.#courseCode;
  }

  set courseCode(value: string | null) {
    this.#courseCode = value;
    this.#render();
  }

  get busy(): boolean {
    return this.#busy;
  }

  set busy(value: boolean) {
    this.#busy = value;
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

    this.#renderCourses(data);
    this.#renderPractical(data);
    this.#renderPhrases(data);
    this.#renderAlternates(data);

    const link = doc.createElement('a');
    link.className = 'rmp';
    link.href = data.rmpUrl;
    link.target = '_blank';
    // Prevents the new tab from getting a handle back to the UAccess page.
    link.rel = 'noopener noreferrer';
    const plural = data.numRatings === 1 ? 'rating' : 'ratings';
    link.textContent = `View ${data.numRatings} ${plural} on RMP →`;

    const age = doc.createElement('span');
    age.textContent = this.#busy ? 'Refreshing…' : `Cached ${formatAge(data.cachedAt)}`;

    const refresh = doc.createElement('button');
    refresh.className = 'refresh';
    refresh.type = 'button';
    refresh.textContent = 'Refresh';
    refresh.disabled = this.#busy;
    refresh.addEventListener('click', (event) => {
      event.stopPropagation();
      this.busy = true;
      this.dispatchEvent(
        new CustomEvent<ProfessorData>(CARD_REFRESH_EVENT, {
          detail: data,
          bubbles: true,
          composed: true,
        }),
      );
    });

    const footer = doc.createElement('footer');
    footer.append(age, refresh);

    this.#body.append(link, footer);
  }

  /**
   * Per-course breakdown, with the course being browsed pinned to the top.
   *
   * This is the number that answers the actual question — a professor can be
   * strong in a survey course and punishing in a seminar, and the headline
   * average hides that.
   */
  #renderCourses(data: ProfessorData): void {
    // Tolerate a record that predates these fields rather than throwing and
    // taking the whole card down with it.
    const courseRatings = data.courseRatings ?? [];
    if (courseRatings.length === 0) return;
    const doc = this.ownerDocument;

    const current = this.#courseCode ? normalizeCourseCode(this.#courseCode) : null;
    const ordered = [...courseRatings].sort((a, b) => {
      if (a.course === current) return -1;
      if (b.course === current) return 1;
      return b.numRatings - a.numRatings;
    });

    const section = doc.createElement('div');
    section.className = 'section';
    const heading = doc.createElement('h3');
    heading.textContent = 'Recent ratings by course';
    section.appendChild(heading);

    for (const course of ordered.slice(0, MAX_COURSES_SHOWN)) {
      const row = doc.createElement('div');
      row.className = course.course === current ? 'course is-current' : 'course';

      const code = doc.createElement('span');
      code.className = 'code';
      code.textContent = course.course;

      const right = doc.createElement('span');
      const score = doc.createElement('span');
      score.className = 'score';
      score.textContent = course.rating === null ? '—' : course.rating.toFixed(1);
      score.style.setProperty('--course-color', getRatingColor(course.rating));

      const count = doc.createElement('span');
      count.className = 'n';
      count.textContent = ` (${course.numRatings})`;

      right.append(score, count);
      row.append(code, right);
      section.appendChild(row);
    }

    this.#body.appendChild(section);
  }

  /**
   * Other RMP profiles that look like the same person.
   *
   * Shown rather than hidden: RMP has no deduplication, and when we pick the
   * better-evidenced of two profiles the user deserves to see that a choice was
   * made and where the other numbers live.
   */
  /**
   * Course logistics: attendance, textbook, online delivery.
   *
   * These answer questions a rating cannot — whether you can miss a lecture,
   * whether you have to buy the book — and they come from the same rows the
   * tag tally already reads.
   */
  #renderPractical(data: ProfessorData): void {
    const insights = data.reviewInsights;
    if (!insights) return;

    const facts: string[] = [];
    if (insights.attendanceMandatoryPct !== null) {
      facts.push(
        insights.attendanceMandatoryPct >= 50
          ? `Attendance mandatory (${insights.attendanceMandatoryPct}% say so)`
          : `Attendance flexible (${100 - insights.attendanceMandatoryPct}% say so)`,
      );
    }
    if (insights.textbookUsedPct !== null) {
      facts.push(
        insights.textbookUsedPct >= 50
          ? `Textbook used (${insights.textbookUsedPct}%)`
          : `Textbook rarely used (${100 - insights.textbookUsedPct}%)`,
      );
    }
    if (insights.onlinePct !== null && insights.onlinePct >= 25) {
      facts.push(`${insights.onlinePct}% taken online`);
    }
    if (insights.topGrade && insights.gradesReported >= MIN_PHRASE_MENTIONS) {
      facts.push(`Most reported grade: ${insights.topGrade}`);
    }
    if (facts.length === 0) return;

    const doc = this.ownerDocument;
    const section = doc.createElement('div');
    section.className = 'section';

    const heading = doc.createElement('h3');
    heading.textContent = 'What to expect';
    section.appendChild(heading);

    const list = doc.createElement('ul');
    list.className = 'facts';
    for (const fact of facts) {
      const item = doc.createElement('li');
      item.textContent = fact;
      list.appendChild(item);
    }

    section.appendChild(list);
    this.#body.appendChild(section);
  }

  /**
   * Phrases students repeat, with how many said them.
   *
   * The count is shown deliberately: "3 mentions" reads very differently from
   * a bare quote, and this is frequency, not sentiment — nothing here claims
   * to know whether a phrase was meant kindly.
   */
  #renderPhrases(data: ProfessorData): void {
    const phrases = data.reviewInsights?.phrases ?? [];
    if (phrases.length === 0) return;

    const doc = this.ownerDocument;
    const section = doc.createElement('div');
    section.className = 'section';

    const heading = doc.createElement('h3');
    heading.textContent = `Repeated in ${data.reviewInsights?.reviewsRead ?? 0} recent reviews`;
    section.appendChild(heading);

    const wrap = doc.createElement('div');
    wrap.className = 'phrases';
    for (const { phrase, mentions } of phrases) {
      const chip = doc.createElement('span');
      chip.className = 'phrase';
      chip.textContent = phrase;

      const count = doc.createElement('span');
      count.className = 'phrase-n';
      count.textContent = `×${mentions}`;

      chip.appendChild(count);
      wrap.appendChild(chip);
    }

    section.appendChild(wrap);
    this.#body.appendChild(section);
  }

  #renderAlternates(data: ProfessorData): void {
    const alternates = data.alternateProfiles ?? [];
    if (alternates.length === 0) return;
    const doc = this.ownerDocument;

    const section = doc.createElement('div');
    section.className = 'section';
    const heading = doc.createElement('h3');
    heading.textContent =
      data.matchConfidence === 'nickname' ? 'Also listed on RMP as' : 'Duplicate profiles';
    section.appendChild(heading);

    for (const alt of alternates.slice(0, MAX_ALTERNATES_SHOWN)) {
      const link = doc.createElement('a');
      link.className = 'alt';
      link.href = alt.rmpUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';

      const rating = alt.overallRating === null ? 'unrated' : alt.overallRating.toFixed(1);
      const plural = alt.numRatings === 1 ? 'rating' : 'ratings';
      link.append(
        doc.createTextNode(`${alt.name} — ${rating} `),
        Object.assign(doc.createElement('span'), {
          className: 'why',
          textContent: `(${alt.numRatings} ${plural})`,
        }),
      );
      section.appendChild(link);
    }

    this.#body.appendChild(section);
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
