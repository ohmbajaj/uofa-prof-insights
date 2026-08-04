import { describe, expect, it } from 'vitest';
import { getRatingColor, normalizeCacheKey, normalizeNameForRMP } from '@shared/utils';
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
