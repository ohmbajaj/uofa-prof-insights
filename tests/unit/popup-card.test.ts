import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CARD_REFRESH_EVENT, CARD_TAG, UPICard, formatAge } from '@content/components/PopupCard';
import {
  closeCard,
  computePosition,
  getOpenCard,
  openCardFor,
  resetCardState,
  updateOpenCard,
} from '@content/card-controller';
import { COLOR_GOOD } from '@shared/constants';
import { makeProfessor } from '../helpers/chrome-mock';

function mount(): UPICard {
  const card = document.createElement(CARD_TAG) as UPICard;
  document.body.appendChild(card);
  return card;
}

/** Scoped to `.card` — the shadow root's own textContent includes the <style>. */
function shadowText(card: UPICard): string {
  return card.shadowRoot?.querySelector('.card')?.textContent ?? '';
}

beforeEach(() => {
  document.body.innerHTML = '';
  resetCardState();
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

describe('UPICard', () => {
  it('is registered as a custom element with a shadow root', () => {
    expect(customElements.get(CARD_TAG)).toBe(UPICard);
    expect(mount().shadowRoot).not.toBeNull();
  });

  it('renders nothing until data is set', () => {
    expect(shadowText(mount()).trim()).toBe('');
  });

  it('renders name, department and university', () => {
    const card = mount();
    card.data = makeProfessor({
      name: 'Richard Mercer',
      department: 'Computer Science',
      university: 'University of Arizona',
    });

    expect(shadowText(card)).toContain('Richard Mercer');
    expect(shadowText(card)).toContain('Computer Science');
    expect(shadowText(card)).toContain('University of Arizona');
  });

  it('renders all three stats', () => {
    const card = mount();
    card.data = makeProfessor({ overallRating: 2.9, difficulty: 3.4, wouldTakeAgain: 48.6 });

    const values = [...(card.shadowRoot?.querySelectorAll('.stat .value') ?? [])].map(
      (n) => n.textContent,
    );
    expect(values).toEqual(['2.9', '3.4', '49%']);
  });

  it('shows em-dashes for missing stats', () => {
    const card = mount();
    card.data = makeProfessor({ overallRating: null, difficulty: null, wouldTakeAgain: null });

    const values = [...(card.shadowRoot?.querySelectorAll('.stat .value') ?? [])].map(
      (n) => n.textContent,
    );
    expect(values).toEqual(['—', '—', '—']);
  });

  it('colors the primary stat by rating', () => {
    const card = mount();
    card.data = makeProfessor({ overallRating: 4.5 });
    expect(card.style.getPropertyValue('--upi-rating-color')).toBe(COLOR_GOOD);
  });

  it('renders each top tag as a chip', () => {
    const card = mount();
    card.data = makeProfessor({ topTags: ['Lecture heavy', 'Tough grader'] });

    const tags = [...(card.shadowRoot?.querySelectorAll('.tag') ?? [])].map((n) => n.textContent);
    expect(tags).toEqual(['Lecture heavy', 'Tough grader']);
  });

  it('explains an unrated professor instead of showing empty tags', () => {
    const card = mount();
    card.data = makeProfessor({ topTags: [], numRatings: 0 });
    expect(shadowText(card)).toContain('No ratings on RateMyProfessor yet');
  });

  it('distinguishes "no tags" from "no ratings"', () => {
    const card = mount();
    card.data = makeProfessor({ topTags: [], numRatings: 12 });
    expect(shadowText(card)).toContain('No tags for this professor');
  });

  it('links to RMP safely in a new tab', () => {
    const card = mount();
    card.data = makeProfessor({ rmpUrl: 'https://www.ratemyprofessors.com/professor/12302' });

    const link = card.shadowRoot?.querySelector('a.rmp') as HTMLAnchorElement;
    expect(link.href).toBe('https://www.ratemyprofessors.com/professor/12302');
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');
  });

  it('closes when the close button is pressed', () => {
    const card = mount();
    card.data = makeProfessor();

    (card.shadowRoot?.querySelector('.close') as HTMLButtonElement).click();
    expect(card.isConnected).toBe(false);
  });

  it('re-renders when data is replaced', () => {
    const card = mount();
    card.data = makeProfessor({ name: 'First Prof' });
    card.data = makeProfessor({ name: 'Second Prof' });

    expect(shadowText(card)).toContain('Second Prof');
    expect(shadowText(card)).not.toContain('First Prof');
  });
});

describe('UPICard refresh', () => {
  it('emits upi-card-refresh with the professor', () => {
    const card = mount();
    const prof = makeProfessor({ name: 'Richard Mercer' });
    card.data = prof;

    let detail: unknown;
    card.addEventListener(CARD_REFRESH_EVENT, (e) => {
      detail = (e as CustomEvent).detail;
    });
    (card.shadowRoot?.querySelector('.refresh') as HTMLButtonElement).click();

    expect(detail).toBe(prof);
  });

  it('shows a pending state and disables the button while refreshing', () => {
    const card = mount();
    card.data = makeProfessor();
    (card.shadowRoot?.querySelector('.refresh') as HTMLButtonElement).click();

    expect(card.busy).toBe(true);
    expect(shadowText(card)).toContain('Refreshing…');
    expect(card.shadowRoot?.querySelector('.refresh')).toHaveProperty('disabled', true);
  });

  it('clears the pending state when new data arrives', () => {
    const card = mount();
    card.data = makeProfessor();
    card.busy = true;

    card.data = makeProfessor({ overallRating: 4.9 });

    expect(card.busy).toBe(false);
    expect(shadowText(card)).toContain('Cached');
    expect(card.shadowRoot?.querySelector('.refresh')).toHaveProperty('disabled', false);
  });

  it('bubbles out of the shadow root', () => {
    const card = mount();
    card.data = makeProfessor();

    let seen = false;
    document.body.addEventListener(CARD_REFRESH_EVENT, () => {
      seen = true;
    });
    (card.shadowRoot?.querySelector('.refresh') as HTMLButtonElement).click();

    expect(seen).toBe(true);
  });
});

describe('updateOpenCard', () => {
  function badge(): HTMLElement {
    const el = document.createElement('span');
    document.body.appendChild(el);
    return el;
  }

  it('replaces the data when the card shows that professor', () => {
    openCardFor(badge(), makeProfessor({ name: 'Richard Mercer', overallRating: 2.9 }));
    updateOpenCard('Richard Mercer', makeProfessor({ name: 'Richard Mercer', overallRating: 4.4 }));

    expect(shadowText(getOpenCard()!)).toContain('4.4');
  });

  it('ignores an update for a different professor', () => {
    openCardFor(badge(), makeProfessor({ name: 'Richard Mercer', overallRating: 2.9 }));
    updateOpenCard('Someone Else', makeProfessor({ name: 'Someone Else', overallRating: 4.4 }));

    expect(shadowText(getOpenCard()!)).toContain('2.9');
  });

  it('closes the card when the refresh yields no match', () => {
    openCardFor(badge(), makeProfessor({ name: 'Richard Mercer' }));
    updateOpenCard('Richard Mercer', null);

    expect(getOpenCard()).toBeNull();
    expect(document.querySelectorAll(CARD_TAG)).toHaveLength(0);
  });

  it('is a no-op when no card is open', () => {
    expect(() => updateOpenCard('Anyone', makeProfessor())).not.toThrow();
  });
});

describe('formatAge', () => {
  const now = Date.parse('2026-08-04T12:00:00Z');

  it.each([
    [0, 'just now'],
    [30_000, 'just now'],
    [5 * 60_000, '5m ago'],
    [3 * 3_600_000, '3h ago'],
    [26 * 3_600_000, '1 day ago'],
    [5 * 86_400_000, '5 days ago'],
  ])('formats %s ms as %s', (elapsed, expected) => {
    expect(formatAge(now - elapsed, now)).toBe(expected);
  });
});

describe('computePosition', () => {
  const rect = (left: number, bottom: number) => ({ left, bottom }) as DOMRect;

  it('anchors below and left-aligned with the badge', () => {
    expect(computePosition(rect(100, 40), 1200, 0, 0)).toEqual({ left: 100, top: 46 });
  });

  it('accounts for page scroll so the card tracks the badge', () => {
    expect(computePosition(rect(100, 40), 1200, 20, 300)).toEqual({ left: 120, top: 346 });
  });

  it('clamps a right-edge badge back into the viewport', () => {
    // 268px card + 8px margin cannot start at 1150 in a 1200px viewport.
    expect(computePosition(rect(1150, 40), 1200, 0, 0).left).toBe(924);
  });

  it('clamps to the left margin on a narrow viewport', () => {
    expect(computePosition(rect(5, 40), 200, 0, 0).left).toBe(8);
  });

  it('keeps clear of a right-edge inset such as the sidebar', () => {
    // 1200 viewport - 300 sidebar - 268 card - 8 margin = 624.
    expect(computePosition(rect(900, 40), 1200, 0, 0, 300).left).toBe(624);
  });

  it('leaves a left-hand badge alone even with an inset', () => {
    expect(computePosition(rect(100, 40), 1200, 0, 0, 300).left).toBe(100);
  });
});

describe('card controller', () => {
  function badge(): HTMLElement {
    const el = document.createElement('span');
    document.body.appendChild(el);
    return el;
  }

  it('opens a card anchored to a badge', () => {
    const anchor = badge();
    const card = openCardFor(anchor, makeProfessor({ name: 'Richard Mercer' }));

    expect(card).not.toBeNull();
    expect(document.querySelectorAll(CARD_TAG)).toHaveLength(1);
    expect(shadowText(card!)).toContain('Richard Mercer');
  });

  it('toggles closed when the same badge is clicked again', () => {
    const anchor = badge();
    openCardFor(anchor, makeProfessor());

    expect(openCardFor(anchor, makeProfessor())).toBeNull();
    expect(document.querySelectorAll(CARD_TAG)).toHaveLength(0);
  });

  it('moves rather than stacks when another badge is clicked', () => {
    const first = badge();
    const second = badge();

    openCardFor(first, makeProfessor({ name: 'First Prof' }));
    const card = openCardFor(second, makeProfessor({ name: 'Second Prof' }));

    expect(document.querySelectorAll(CARD_TAG)).toHaveLength(1);
    expect(shadowText(card!)).toContain('Second Prof');
  });

  it('closes on Escape', () => {
    openCardFor(badge(), makeProfessor());
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(document.querySelectorAll(CARD_TAG)).toHaveLength(0);
  });

  it('closes on a click elsewhere in the page', () => {
    openCardFor(badge(), makeProfessor());

    const elsewhere = document.createElement('div');
    document.body.appendChild(elsewhere);
    elsewhere.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(document.querySelectorAll(CARD_TAG)).toHaveLength(0);
  });

  it('stays open when the card itself is clicked', () => {
    const card = openCardFor(badge(), makeProfessor());
    card!.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(document.querySelectorAll(CARD_TAG)).toHaveLength(1);
  });

  it('stops listening once closed', () => {
    openCardFor(badge(), makeProfessor());
    closeCard();

    // Would throw or reopen if the listeners were still attached.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelectorAll(CARD_TAG)).toHaveLength(0);
  });
});
