import {
  COLOR_BAD,
  COLOR_GOOD,
  COLOR_OK,
  COLOR_UNKNOWN,
  RATING_GOOD_THRESHOLD,
  RATING_OK_THRESHOLD,
} from './constants';

/**
 * Converts a UAccess-style instructor name into the natural order RMP expects.
 *
 *   "Smith, John A"  -> "John Smith"
 *   "Garcia, Maria"  -> "Maria Garcia"
 *   "O'Brien, Sean"  -> "Sean O'Brien"
 *   "Staff"          -> "Staff"   (no comma: passed through unchanged)
 *
 * Only the first token after the comma is kept, which drops middle names and
 * middle initials. RMP's search does better with "John Smith" than with
 * "John A Smith".
 */
export function normalizeNameForRMP(uaccessName: string): string {
  const trimmed = uaccessName.trim().replace(/\s+/g, ' ');
  if (!trimmed.includes(',')) return trimmed;

  const commaIndex = trimmed.indexOf(',');
  const last = trimmed.slice(0, commaIndex).trim();
  const rest = trimmed.slice(commaIndex + 1).trim();

  const first = rest.split(' ')[0] ?? '';
  if (!first) return last;
  if (!last) return first;

  return `${first} ${last}`;
}

/**
 * How a page writes instructor names, which decides what a comma means.
 *
 * `surname-first`: classic class search, one name as "Mercer, Richard".
 * `natural-list`: Class Schedule cards, several already-natural names in one
 * string, "Ratchaneekorn Thamvichai, Na Liu".
 *
 * The two are genuinely ambiguous as strings, and guessing gets it wrong:
 * reading the second as surname-first yields "Na Thamvichai", a person who
 * does not exist. Each detector knows which convention its own page uses, so
 * the format is passed in rather than inferred.
 */
export type NameFormat = 'surname-first' | 'natural-list';

/**
 * Splits one instructor field into normalized, natural-order names.
 *
 *   surname-first: "Smith, John A"                   -> ["John Smith"]
 *   natural-list:  "Ratchaneekorn Thamvichai, Na Liu" -> both names, unchanged
 *
 * Returns an empty array when nothing usable is present.
 */
export function parseInstructorField(raw: string, format: NameFormat): string[] {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (!trimmed) return [];

  if (format === 'natural-list') {
    return trimmed
      .split(/\s*[,;]\s*|\s+&\s+|\s+and\s+/i)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  return [normalizeNameForRMP(trimmed)].filter(Boolean);
}

/**
 * Badge color for an overall rating.
 * >= 3.5 green, >= 2.5 amber, below that red, and gray when unrated.
 */
export function getRatingColor(rating: number | null): string {
  if (rating === null || !Number.isFinite(rating)) return COLOR_UNKNOWN;
  if (rating >= RATING_GOOD_THRESHOLD) return COLOR_GOOD;
  if (rating >= RATING_OK_THRESHOLD) return COLOR_OK;
  return COLOR_BAD;
}

/**
 * Normalizes a free-text course label into a comparable code.
 *
 * Used on both sides: RMP reviews carry a course typed by the student, and
 * UAccess prints its own formatting. The same course therefore arrives as
 * "CSC110", "csc 110", "CSC-110" or "CSC 110". Everything is upper-cased with
 * separators stripped. A bare number cannot be attributed to a subject, so it
 * is dropped rather than guessed at.
 */
export function normalizeCourseCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleaned) return null;
  if (!/^[A-Z]{2,5}\d{2,4}[A-Z]?$/.test(cleaned)) return null;
  return cleaned;
}

/**
 * Stable storage key for a professor. Case- and punctuation-insensitive so
 * "Rick Mercer", "rick mercer" and "Mercer, Rick " collapse onto one entry
 * once the name has been run through `normalizeNameForRMP`.
 */
export function normalizeCacheKey(name: string): string {
  return `uofa:${name.toLowerCase().replace(/[^a-z]/g, '_')}`;
}

/**
 * Rough age of a timestamp, for "cached 3 days ago" style labels.
 *
 * Shared by the in-page card and the popup's recents list so the two never
 * drift into describing the same instant differently.
 */
export function formatAge(since: number, now = Date.now()): string {
  const minutes = Math.floor((now - since) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

/** Compact duration for the popup's cache stats: "<1h", "6h", "3d". */
export function formatDuration(ms: number): string {
  if (ms <= 0) return 'N/A';
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return '<1h';
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
