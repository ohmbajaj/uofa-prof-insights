import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BADGE_CLICK_EVENT, BADGE_TAG, badgesIn as badgesInRoot } from '@content/components/Badge';
import type { UPIBadge } from '@content/components/Badge';
import {
  injectBadges,
  injectedCount,
  pruneDetached,
  removeBadges,
  resetInjectorState,
} from '@content/injector';
import { detectProfessors } from '@content/detector';
import { makeProfessor } from '../helpers/chrome-mock';

const CLASSIC = `
  <table id="CLASS_SRCH_WRK2_STRM$scroll$0">
    <tr><th id="CLASS_SRCH_WRK2_STRM_INSTRUCTOR$0">Instructor</th></tr>
    <tr><td id="MTG_INSTR$0">Mercer, Richard</td></tr>
    <tr><td id="MTG_INSTR$1">Debray, Saumya</td></tr>
  </table>`;

function badgesIn(root: ParentNode = document): UPIBadge[] {
  return badgesInRoot(root);
}

beforeEach(() => {
  document.body.innerHTML = '';
  resetInjectorState();
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

describe('injectBadges', () => {
  it('injects one badge per detected professor', () => {
    document.body.innerHTML = CLASSIC;
    const added = injectBadges(detectProfessors(document));

    expect(added).toHaveLength(2);
    expect(badgesIn()).toHaveLength(2);
  });

  it('starts every badge in the loading state', () => {
    document.body.innerHTML = CLASSIC;
    injectBadges(detectProfessors(document));

    expect(badgesIn().every((b) => b.data === 'loading')).toBe(true);
  });

  it('places the badge inside the instructor cell, not as a table sibling', () => {
    document.body.innerHTML = CLASSIC;
    injectBadges(detectProfessors(document));

    const cell = document.querySelector('#MTG_INSTR\\$0');
    expect(cell?.querySelector(BADGE_TAG)).not.toBeNull();
    // A badge parented to <tr> would be hoisted out of the table by the parser.
    expect(document.querySelector(`tr > ${BADGE_TAG}`)).toBeNull();
  });

  it('leaves the instructor name text intact', () => {
    document.body.innerHTML = CLASSIC;
    injectBadges(detectProfessors(document));

    expect(document.querySelector('#MTG_INSTR\\$0')?.textContent).toContain('Mercer, Richard');
  });

  it('does not double-inject on a repeat pass', () => {
    document.body.innerHTML = CLASSIC;
    const profs = detectProfessors(document);

    injectBadges(profs);
    const second = injectBadges(profs);

    expect(second).toHaveLength(0);
    expect(badgesIn()).toHaveLength(2);
  });

  it('injects for a newly appeared row without touching existing badges', () => {
    document.body.innerHTML = CLASSIC;
    const first = injectBadges(detectProfessors(document));
    first[0]!.badge.data = makeProfessor({ overallRating: 4.2 });

    document
      .querySelector('table')!
      .insertAdjacentHTML('beforeend', '<tr><td id="MTG_INSTR$2">Smith, John</td></tr>');
    const added = injectBadges(detectProfessors(document));

    expect(added).toHaveLength(1);
    expect(badgesIn()).toHaveLength(3);
    // The pre-existing badge kept its resolved data.
    expect(first[0]!.badge.data).not.toBe('loading');
  });

  it('injects a badge per instructor when one cell lists two', () => {
    document.body.innerHTML = `
      <table id="CLASS_SRCH_WRK2_STRM$scroll$0">
        <tr><th id="CLASS_SRCH_WRK2_STRM_INSTRUCTOR$0">Instructor</th></tr>
        <tr><td id="MTG_INSTR$0">Mercer, Richard<br>Debray, Saumya</td></tr>
      </table>`;

    injectBadges(detectProfessors(document));
    expect(document.querySelectorAll(`#MTG_INSTR\\$0 ${BADGE_TAG}`)).toHaveLength(2);
  });

  it('works on the new Student Center layout', () => {
    document.body.innerHTML = `
      <div class="resultPanel">
        <div class="classInstructors"><div class="instructor">Mercer, Richard</div></div>
      </div>`;

    injectBadges(detectProfessors(document));
    expect(document.querySelector('.instructor')?.querySelector(BADGE_TAG)).not.toBeNull();
  });

  it('emits upi-badge-click carrying the resolved data', () => {
    document.body.innerHTML = CLASSIC;
    const added = injectBadges(detectProfessors(document));
    const prof = makeProfessor({ name: 'Richard Mercer' });
    added[0]!.badge.data = prof;

    let detail: unknown;
    document.body.addEventListener(BADGE_CLICK_EVENT, (e) => {
      detail = (e as CustomEvent).detail;
    });
    added[0]!.badge.click();

    expect(detail).toBe(prof);
  });

  it('reports the professor alongside each badge it created', () => {
    document.body.innerHTML = CLASSIC;
    const added = injectBadges(detectProfessors(document));

    expect(added.map((a) => a.professor.name)).toEqual(['Richard Mercer', 'Saumya Debray']);
  });

  it('does nothing when nothing was detected', () => {
    expect(injectBadges([])).toEqual([]);
    expect(badgesIn()).toHaveLength(0);
  });
});

describe('removeBadges', () => {
  it('removes the badges for the given professors', () => {
    document.body.innerHTML = CLASSIC;
    const profs = detectProfessors(document);
    injectBadges(profs);

    removeBadges(profs);

    expect(badgesIn()).toHaveLength(0);
    expect(injectedCount()).toBe(0);
  });

  it('removes only the professors it was given', () => {
    document.body.innerHTML = CLASSIC;
    const profs = detectProfessors(document);
    injectBadges(profs);

    removeBadges([profs[0]!]);

    expect(badgesIn()).toHaveLength(1);
  });

  it('allows re-injection afterwards', () => {
    document.body.innerHTML = CLASSIC;
    const profs = detectProfessors(document);
    injectBadges(profs);
    removeBadges(profs);

    expect(injectBadges(profs)).toHaveLength(2);
  });

  it('is a no-op for professors that were never injected', () => {
    document.body.innerHTML = CLASSIC;
    expect(() => removeBadges(detectProfessors(document))).not.toThrow();
  });
});

describe('pruneDetached', () => {
  it('drops badges whose row was replaced by a new search', () => {
    document.body.innerHTML = CLASSIC;
    injectBadges(detectProfessors(document));
    expect(injectedCount()).toBe(2);

    // PeopleSoft replaces the results container wholesale.
    document.body.innerHTML = '<div>Searching…</div>';

    expect(pruneDetached()).toBe(2);
    expect(injectedCount()).toBe(0);
  });

  it('runs automatically on the next injection pass', () => {
    document.body.innerHTML = CLASSIC;
    injectBadges(detectProfessors(document));

    document.body.innerHTML = CLASSIC; // fresh cells, same ids
    const added = injectBadges(detectProfessors(document));

    expect(added).toHaveLength(2);
    expect(injectedCount()).toBe(2);
    expect(badgesIn()).toHaveLength(2);
  });

  it('keeps badges that are still attached', () => {
    document.body.innerHTML = CLASSIC;
    injectBadges(detectProfessors(document));

    expect(pruneDetached()).toBe(0);
    expect(injectedCount()).toBe(2);
  });
});
