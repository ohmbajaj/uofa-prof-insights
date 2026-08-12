import { describe, expect, it } from 'vitest';
import {
  formatAge,
  formatDuration,
  getRatingColor,
  normalizeCacheKey,
  normalizeNaturalNameForRMP,
  normalizeNameForRMP,
} from '@shared/utils';
import { COLOR_BAD, COLOR_GOOD, COLOR_OK, COLOR_UNKNOWN } from '@shared/constants';

describe('normalizeNameForRMP', () => {
  it('converts "Last, First Middle" to "First Last"', () => {
    expect(normalizeNameForRMP('Smith, John A')).toBe('John Smith');
  });

  it('converts "Last, First" to "First Last"', () => {
    expect(normalizeNameForRMP('Garcia, Maria')).toBe('Maria Garcia');
  });

  it('passes through a single token unchanged', () => {
    expect(normalizeNameForRMP('Staff')).toBe('Staff');
  });

  it('preserves apostrophes in surnames', () => {
    expect(normalizeNameForRMP("O'Brien, Sean")).toBe("Sean O'Brien");
  });

  it('collapses stray whitespace', () => {
    expect(normalizeNameForRMP('  Mercer ,   Rick  ')).toBe('Rick Mercer');
  });

  it('drops multiple middle names', () => {
    expect(normalizeNameForRMP('Van Horn, Elizabeth Anne Marie')).toBe('Elizabeth Van Horn');
  });

  it('falls back to the surname when nothing follows the comma', () => {
    expect(normalizeNameForRMP('Debray,')).toBe('Debray');
  });

  it('returns an empty string for empty input', () => {
    expect(normalizeNameForRMP('   ')).toBe('');
  });
});

describe('normalizeNaturalNameForRMP', () => {
  it('drops a formal leading initial when an everyday given name follows', () => {
    expect(normalizeNaturalNameForRMP('C. Douglas Haessig')).toBe('Douglas Haessig');
  });

  it('drops an interior middle initial', () => {
    expect(normalizeNaturalNameForRMP('John A. Smith')).toBe('John Smith');
  });

  it('keeps a two-token initial and surname matchable', () => {
    expect(normalizeNaturalNameForRMP('R. Mercer')).toBe('R. Mercer');
  });

  it('preserves ordinary and compound-surname names', () => {
    expect(normalizeNaturalNameForRMP('Ratchaneekorn Thamvichai')).toBe('Ratchaneekorn Thamvichai');
    expect(normalizeNaturalNameForRMP('Elizabeth van Horn')).toBe('Elizabeth van Horn');
  });
});

describe('getRatingColor', () => {
  it('returns green at or above 3.5', () => {
    expect(getRatingColor(4.5)).toBe(COLOR_GOOD);
    expect(getRatingColor(3.5)).toBe(COLOR_GOOD);
  });

  it('returns amber between 2.5 and 3.4', () => {
    expect(getRatingColor(3.0)).toBe(COLOR_OK);
    expect(getRatingColor(3.4)).toBe(COLOR_OK);
    expect(getRatingColor(2.5)).toBe(COLOR_OK);
  });

  it('returns red below 2.5', () => {
    expect(getRatingColor(1.5)).toBe(COLOR_BAD);
    expect(getRatingColor(2.4)).toBe(COLOR_BAD);
    expect(getRatingColor(0)).toBe(COLOR_BAD);
  });

  it('returns gray for null', () => {
    expect(getRatingColor(null)).toBe(COLOR_UNKNOWN);
  });

  it('returns gray for NaN', () => {
    expect(getRatingColor(Number.NaN)).toBe(COLOR_UNKNOWN);
  });

  it('uses the documented hex values', () => {
    expect(getRatingColor(4.5)).toBe('#2DC653');
    expect(getRatingColor(3.0)).toBe('#F5A623');
    expect(getRatingColor(1.5)).toBe('#E74C3C');
    expect(getRatingColor(null)).toBe('#9B9B9B');
  });
});

describe('normalizeCacheKey', () => {
  it('lowercases and underscores non-letters', () => {
    expect(normalizeCacheKey('Rick Mercer')).toBe('uofa:rick_mercer');
  });

  it('is case-insensitive', () => {
    expect(normalizeCacheKey('RICK MERCER')).toBe(normalizeCacheKey('rick mercer'));
  });

  it('replaces apostrophes', () => {
    expect(normalizeCacheKey("Sean O'Brien")).toBe('uofa:sean_o_brien');
  });

  it('replaces digits', () => {
    expect(normalizeCacheKey('John Smith 3rd')).toBe('uofa:john_smith__rd');
  });

  it('handles an empty name', () => {
    expect(normalizeCacheKey('')).toBe('uofa:');
  });

  it('round-trips a normalized UAccess name', () => {
    expect(normalizeCacheKey(normalizeNameForRMP('Mercer, Rick'))).toBe('uofa:rick_mercer');
  });
});

describe('time labels', () => {
  const now = Date.parse('2026-08-04T12:00:00Z');

  it.each([
    [0, 'just now'],
    [30_000, 'just now'],
    [5 * 60_000, '5m ago'],
    [3 * 3_600_000, '3h ago'],
    [26 * 3_600_000, '1 day ago'],
    [5 * 86_400_000, '5 days ago'],
  ])('formats an age of %s ms as %s', (elapsed, expected) => {
    expect(formatAge(now - elapsed, now)).toBe(expected);
  });

  it.each([
    [0, 'N/A'],
    [30 * 60_000, '<1h'],
    [6 * 3_600_000, '6h'],
    [3 * 86_400_000, '3d'],
  ])('formats a duration of %s ms as %s', (duration, expected) => {
    expect(formatDuration(duration)).toBe(expected);
  });
});
