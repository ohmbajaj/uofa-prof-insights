import { beforeEach, describe, expect, it } from 'vitest';
import { BADGE_CLICK_EVENT, BADGE_TAG, UPIBadge } from '@content/components/Badge';
import { COLOR_BAD, COLOR_GOOD, COLOR_OK, COLOR_UNKNOWN } from '@shared/constants';
import { makeProfessor } from '../helpers/chrome-mock';

function mount(): UPIBadge {
  const badge = new UPIBadge(document);
  document.body.appendChild(badge.el);
  return badge;
}

/** Visible text inside the shadow root. */
function text(badge: UPIBadge): string {
  return badge.shadowRoot?.querySelector('.badge')?.textContent?.trim() ?? '';
}

function background(badge: UPIBadge): string {
  return badge.style.getPropertyValue('--upi-bg');
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('UPIBadge construction', () => {
  /**
   * Deliberately not a custom element: `customElements` is null in a content
   * script's isolated world, so registering there throws and kills the whole
   * script. The host is a plain element with a shadow root.
   */
  it('is not registered as a custom element', () => {
    expect(customElements.get(BADGE_TAG)).toBeUndefined();
  });

  it('creates a host element with the expected tag', () => {
    expect(mount().el.tagName.toLowerCase()).toBe(BADGE_TAG);
  });

  it('does not depend on the custom element registry', () => {
    const registry = window.customElements;
    // Stand in for an isolated world, where the registry is absent entirely.
    Object.defineProperty(window, 'customElements', { value: null, configurable: true });
    try {
      expect(() => new UPIBadge(document)).not.toThrow();
    } finally {
      Object.defineProperty(window, 'customElements', { value: registry, configurable: true });
    }
  });

  it('attaches an open shadow root', () => {
    expect(mount().shadowRoot).not.toBeNull();
  });

  it('carries its styles in the shadow root', () => {
    const style = mount().shadowRoot?.querySelector('style');
    expect(style?.textContent).toContain(':host');
  });

  it('is keyboard reachable', () => {
    const badge = mount();
    expect(badge.getAttribute('role')).toBe('button');
    expect(badge.getAttribute('tabindex')).toBe('0');
  });
});

describe('UPIBadge rendering', () => {
  it('defaults to the loading state', () => {
    const badge = mount();
    expect(badge.data).toBe('loading');
    expect(badge.shadowRoot?.querySelector('.badge')?.classList.contains('is-loading')).toBe(true);
  });

  it('shows N/A on a gray background when there is no RMP match', () => {
    const badge = mount();
    badge.data = null;

    expect(text(badge)).toBe('N/A');
    expect(background(badge)).toBe(COLOR_UNKNOWN);
    expect(badge.title).toContain('No RateMyProfessor match');
  });

  it('shows ? on a red background in the error state', () => {
    const badge = mount();
    badge.data = 'error';

    expect(text(badge)).toBe('?');
    expect(background(badge)).toBe(COLOR_BAD);
    expect(badge.title).toContain('Could not reach');
  });

  it('renders the rating and count for a rated professor', () => {
    const badge = mount();
    badge.data = makeProfessor({ name: 'Richard Mercer', overallRating: 4.2, numRatings: 164 });

    expect(text(badge)).toContain('4.2');
    expect(text(badge)).toContain('(164)');
  });

  it('shows the ratings-count tooltip on hover', () => {
    const badge = mount();
    badge.data = makeProfessor({ numRatings: 164 });
    expect(badge.title).toBe('Based on 164 ratings on RMP');
  });

  it('uses the singular for a lone rating', () => {
    const badge = mount();
    badge.data = makeProfessor({ numRatings: 1 });
    expect(badge.title).toBe('Based on 1 rating on RMP');
  });

  it.each([
    [4.5, COLOR_GOOD],
    [3.5, COLOR_GOOD],
    [3.0, COLOR_OK],
    [2.5, COLOR_OK],
    [1.5, COLOR_BAD],
  ])('colors a %s rating correctly', (rating, expected) => {
    const badge = mount();
    badge.data = makeProfessor({ overallRating: rating });
    expect(background(badge)).toBe(expected);
  });

  it('shows N/A for a professor found on RMP but with no ratings', () => {
    const badge = mount();
    badge.data = makeProfessor({ name: 'New Prof', overallRating: null, numRatings: 0 });

    expect(text(badge)).toBe('N/A');
    expect(background(badge)).toBe(COLOR_UNKNOWN);
    expect(badge.title).toContain('no ratings yet');
  });

  it('leaves the loading state when data arrives', () => {
    const badge = mount();
    badge.data = makeProfessor({ overallRating: 4.2 });

    expect(badge.shadowRoot?.querySelector('.badge')?.classList.contains('is-loading')).toBe(false);
  });

  it('can be updated repeatedly', () => {
    const badge = mount();
    badge.data = makeProfessor({ overallRating: 4.2, numRatings: 10 });
    badge.data = 'error';
    badge.data = makeProfessor({ overallRating: 1.5, numRatings: 3 });

    expect(text(badge)).toContain('1.5');
    expect(text(badge)).not.toContain('4.2');
    expect(background(badge)).toBe(COLOR_BAD);
  });

  it('exposes an accessible label', () => {
    const badge = mount();
    badge.data = makeProfessor({ name: 'Richard Mercer', overallRating: 4.2, numRatings: 164 });
    expect(badge.getAttribute('aria-label')).toBe(
      'Richard Mercer: 4.2 out of 5, based on 164 ratings',
    );
  });
});

describe('UPIBadge rank context', () => {
  it('marks the best-rated instructor on the page', () => {
    const badge = mount();
    badge.data = makeProfessor({ overallRating: 4.2 });
    badge.rank = { rank: 1, total: 8 };

    expect(text(badge)).toContain('BEST');
    expect(badge.title).toContain('ranked 1 of 8');
  });

  it('does not mark a professor who is not top', () => {
    const badge = mount();
    badge.data = makeProfessor({ overallRating: 3.1 });
    badge.rank = { rank: 3, total: 8 };

    expect(text(badge)).not.toContain('BEST');
    expect(badge.title).toContain('ranked 3 of 8');
  });

  it('stays quiet when there is nothing to compare against', () => {
    const badge = mount();
    badge.data = makeProfessor({ overallRating: 4.2 });
    badge.rank = { rank: 1, total: 1 };

    expect(text(badge)).not.toContain('BEST');
    expect(badge.title).not.toContain('ranked');
  });

  it('omits rank entirely when unknown', () => {
    const badge = mount();
    badge.data = makeProfessor({ overallRating: 4.2 });

    expect(badge.rank).toBeNull();
    expect(badge.title).not.toContain('ranked');
  });

  it('updates when the ranking shifts as more results load', () => {
    const badge = mount();
    badge.data = makeProfessor({ overallRating: 4.2 });
    badge.rank = { rank: 1, total: 2 };
    expect(text(badge)).toContain('BEST');

    badge.rank = { rank: 2, total: 5 };
    expect(text(badge)).not.toContain('BEST');
  });
});

describe('UPIBadge click events', () => {
  it('emits upi-badge-click carrying the professor data', () => {
    const badge = mount();
    const prof = makeProfessor({ name: 'Richard Mercer' });
    badge.data = prof;

    let detail: unknown;
    badge.addEventListener(BADGE_CLICK_EVENT, (e) => {
      detail = (e as CustomEvent).detail;
    });
    badge.click();

    expect(detail).toBe(prof);
  });

  it('emits the current data after an update', () => {
    const badge = mount();
    badge.data = 'error';

    let detail: unknown;
    badge.addEventListener(BADGE_CLICK_EVENT, (e) => {
      detail = (e as CustomEvent).detail;
    });
    badge.click();

    expect(detail).toBe('error');
  });

  it('bubbles out of the shadow root so ancestors can listen', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const badge = new UPIBadge(document);
    host.appendChild(badge.el);

    let seen = false;
    document.body.addEventListener(BADGE_CLICK_EVENT, () => {
      seen = true;
    });
    badge.click();

    expect(seen).toBe(true);
  });

  it('emits on Enter', () => {
    const badge = mount();
    let count = 0;
    badge.addEventListener(BADGE_CLICK_EVENT, () => {
      count += 1;
    });

    badge.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(count).toBe(1);
  });

  it('ignores unrelated keys', () => {
    const badge = mount();
    let count = 0;
    badge.addEventListener(BADGE_CLICK_EVENT, () => {
      count += 1;
    });

    badge.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(count).toBe(0);
  });
});
