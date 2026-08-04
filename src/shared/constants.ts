/**
 * University of Arizona (Tucson) — base64("School-1402"), RMP legacyId 1402.
 *
 * NOTE: the Phase 0 spec listed 'U2Nob29sLTEwNzU=' (base64 "School-1075") for
 * this value, but that id resolves to UCLA. Verified against the live API on
 * 2026-08-02: searching schools for "University of Arizona" returns
 * School-1402 (Tucson, AZ, ~848 ratings), and a teacher search scoped to it
 * correctly returns UofA faculty such as Rick Mercer (Computer Science).
 */
export const UOFA_SCHOOL_ID = 'U2Nob29sLTE0MDI=';

/** Kept for reference/testing — this is UCLA, NOT University of Arizona. */
export const UCLA_SCHOOL_ID_DO_NOT_USE = 'U2Nob29sLTEwNzU=';

export const RMP_GRAPHQL_ENDPOINT = 'https://www.ratemyprofessors.com/graphql';

/** RMP ships this public credential in its own web client; base64("test:test"). */
export const RMP_AUTH_HEADER = 'Basic dGVzdDp0ZXN0';

/** Base for public professor pages: `${RMP_PROFESSOR_URL_BASE}/${legacyId}`. */
export const RMP_PROFESSOR_URL_BASE = 'https://www.ratemyprofessors.com/professor';

export const DEFAULT_CACHE_TTL_DAYS = 7;
export const MAX_CACHE_ENTRIES = 500;
export const MAX_CONCURRENT_REQUESTS = 5;

export const CACHE_STORAGE_KEY = 'upi_professor_cache';
export const SETTINGS_STORAGE_KEY = 'upi_settings';

/** RMP sentinel meaning "not enough data" for wouldTakeAgainPercent. */
export const RMP_NO_DATA_SENTINEL = -1;

/** How many recent ratings to pull when tallying top tags. */
export const TAG_SAMPLE_SIZE = 40;
export const MAX_TOP_TAGS = 5;

/**
 * Hosts that actually serve UAccess. `uaccess.arizona.edu` on its own is only
 * the portal landing page — class search and registration live on the
 * subdomains below, which Chrome match patterns do NOT cover implicitly.
 */
export const UACCESS_HOSTS = [
  'uaccess.arizona.edu',
  'student.uaccess.arizona.edu',
  'student851.uaccess.arizona.edu',
  'studentcenter.arizona.edu',
] as const;

/** Instructor placeholders in UAccess that should never be looked up. */
export const NON_INSTRUCTOR_NAMES = new Set([
  'staff',
  'to be announced',
  'tba',
  'tbd',
  'not available',
  '',
]);

/** Rating thresholds used for badge colors. */
export const RATING_GOOD_THRESHOLD = 3.5;
export const RATING_OK_THRESHOLD = 2.5;

export const COLOR_GOOD = '#2DC653';
export const COLOR_OK = '#F5A623';
export const COLOR_BAD = '#E74C3C';
export const COLOR_UNKNOWN = '#9B9B9B';
