import { describe, expect, it } from 'vitest';
import { editDistance, givenNamesMatch, looselyMatches, splitName } from '@shared/names';
import { parseInstructorField } from '@shared/utils';

describe('givenNamesMatch', () => {
  it.each([
    ['Rick', 'Richard'],
    ['Richard', 'Rick'],
    ['Bob', 'Robert'],
    ['Liz', 'Elizabeth'],
    ['Steve', 'Stephen'],
    ['Steve', 'Steven'],
    ['Pat', 'Patrick'],
    ['Pat', 'Patricia'],
    ['Mike', 'Michael'],
  ])('treats %s and %s as the same person', (a, b) => {
    expect(givenNamesMatch(a, b)).toBe(true);
  });

  it('is not transitive across a shared nickname', () => {
    // Both are "Pat", but Patrick and Patricia are different people.
    expect(givenNamesMatch('Patrick', 'Patricia')).toBe(false);
  });

  it.each([
    ['Richard', 'Michael'],
    ['Sean', 'Shannon'],
    ['Rick', 'Mike'],
  ])('keeps %s and %s apart', (a, b) => {
    expect(givenNamesMatch(a, b)).toBe(false);
  });

  it('accepts an initial against a full name', () => {
    expect(givenNamesMatch('R', 'Richard')).toBe(true);
    expect(givenNamesMatch('Richard', 'R')).toBe(true);
    expect(givenNamesMatch('M', 'Richard')).toBe(false);
  });

  it('ignores case and accents', () => {
    expect(givenNamesMatch('josé', 'Jose')).toBe(true);
  });
});

describe('parseInstructorField', () => {
  it('reads the classic grid as surname-first', () => {
    expect(parseInstructorField('Mercer, Richard', 'surname-first')).toEqual(['Richard Mercer']);
    expect(parseInstructorField('Smith, John A', 'surname-first')).toEqual(['John Smith']);
  });

  /**
   * The Class Schedule page lists several already-natural names in one field.
   * Reading this as surname-first produces "Na Thamvichai" — a person who does
   * not exist — which is exactly the failure this format flag prevents.
   */
  it('reads the schedule card as a list of natural-order names', () => {
    expect(parseInstructorField('Ratchaneekorn Thamvichai, Na Liu', 'natural-list')).toEqual([
      'Ratchaneekorn Thamvichai',
      'Na Liu',
    ]);
  });

  it('handles a single natural-order name', () => {
    expect(parseInstructorField('Ratchaneekorn Thamvichai', 'natural-list')).toEqual([
      'Ratchaneekorn Thamvichai',
    ]);
  });

  it('splits on semicolons and conjunctions too', () => {
    expect(parseInstructorField('Ann Lee; Bo Chen', 'natural-list')).toEqual([
      'Ann Lee',
      'Bo Chen',
    ]);
    expect(parseInstructorField('Ann Lee and Bo Chen', 'natural-list')).toEqual([
      'Ann Lee',
      'Bo Chen',
    ]);
    expect(parseInstructorField('Ann Lee & Bo Chen', 'natural-list')).toEqual([
      'Ann Lee',
      'Bo Chen',
    ]);
  });

  it('collapses whitespace and drops empties', () => {
    expect(parseInstructorField('  Ann   Lee ,  , Bo Chen ', 'natural-list')).toEqual([
      'Ann Lee',
      'Bo Chen',
    ]);
  });

  it('returns nothing for an empty field', () => {
    expect(parseInstructorField('   ', 'natural-list')).toEqual([]);
    expect(parseInstructorField('', 'surname-first')).toEqual([]);
  });

  it('passes a comma-less name through in either format', () => {
    expect(parseInstructorField('Staff', 'surname-first')).toEqual(['Staff']);
    expect(parseInstructorField('Staff', 'natural-list')).toEqual(['Staff']);
  });
});

describe('editDistance', () => {
  it.each([
    ['abc', 'abc', 0],
    ['abc', 'abd', 1],
    ['abc', 'ab', 1],
    ['thamvichai', 'thmavichai', 2],
  ])('scores %s vs %s as %i', (a, b, expected) => {
    expect(editDistance(a, b, 5)).toBe(expected);
  });

  it('bails out past the cap instead of computing the full distance', () => {
    expect(editDistance('short', 'a-completely-different-string', 3)).toBeGreaterThan(3);
  });
});

describe('looselyMatches', () => {
  it('accepts a truncated surname', () => {
    expect(looselyMatches('Thamvich', 'Thamvichai')).toBe(true);
  });

  it('accepts a transposition', () => {
    expect(looselyMatches('Thmavichai', 'Thamvichai')).toBe(true);
  });

  it('accepts a single dropped letter', () => {
    expect(looselyMatches('Mercor', 'Mercer')).toBe(true);
  });

  it('is stricter on short names, where an edit changes the person', () => {
    expect(looselyMatches('Lee', 'Liu')).toBe(false);
    expect(looselyMatches('Ng', 'Wu')).toBe(false);
  });

  it('rejects an unrelated surname', () => {
    expect(looselyMatches('Mercer', 'Debray')).toBe(false);
    expect(looselyMatches('Smith', 'Johnson')).toBe(false);
  });

  it('needs at least four characters before accepting a prefix', () => {
    expect(looselyMatches('Th', 'Thamvichai')).toBe(false);
    expect(looselyMatches('Tham', 'Thamvichai')).toBe(true);
  });

  it('handles empty input', () => {
    expect(looselyMatches('', 'Mercer')).toBe(false);
    expect(looselyMatches('Mercer', '')).toBe(false);
  });
});

describe('splitName', () => {
  it('splits a two-part name', () => {
    expect(splitName('Richard Mercer')).toEqual({ first: 'richard', last: 'mercer' });
  });

  it('keeps a multi-word surname whole', () => {
    expect(splitName('Elizabeth Van Horn')).toEqual({ first: 'elizabeth', last: 'van horn' });
  });

  it('treats a lone token as a surname', () => {
    expect(splitName('Staff')).toEqual({ first: '', last: 'staff' });
  });
});
