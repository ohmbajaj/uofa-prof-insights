/**
 * University of Arizona (Tucson), base64("School-1402").
 *
 * Widely-circulated snippets use 'U2Nob29sLTEwNzU=' (base64 "School-1075") for
 * UofA. That id is UCLA, and it fails silently: queries scoped to it return
 * plausible-looking professors from the wrong university. Verified against the
 * live API on 2026-08-02, searching schools for "University of Arizona"
 * returns School-1402 (Tucson, AZ, ~848 ratings).
 */
export const UOFA_SCHOOL_ID = 'U2Nob29sLTE0MDI=';

export const RMP_GRAPHQL_ENDPOINT = 'https://www.ratemyprofessors.com/graphql';

/** RMP ships this public credential in its own web client; base64("test:test"). */
export const RMP_AUTH_HEADER = 'Basic dGVzdDp0ZXN0';

/** Base for public professor pages: `${RMP_PROFESSOR_URL_BASE}/${legacyId}`. */
export const RMP_PROFESSOR_URL_BASE = 'https://www.ratemyprofessors.com/professor';

export const DEFAULT_CACHE_TTL_DAYS = 7;
export const MAX_CACHE_ENTRIES = 500;

/** Bounds untrusted names before they become cache keys or GraphQL variables. */
export const MAX_PROFESSOR_NAME_LENGTH = 160;

/** Keeps a compromised page from turning the extension into an API request flood. */
export const MAX_CONCURRENT_LOOKUPS = 4;
export const MAX_LOOKUPS_PER_MINUTE = 120;

/** Network and payload limits for the third-party RMP GraphQL endpoint. */
export const RMP_REQUEST_TIMEOUT_MS = 10_000;
export const RMP_MAX_RESPONSE_BYTES = 2_000_000;

export const CACHE_STORAGE_KEY = 'upi_professor_cache';
export const SETTINGS_STORAGE_KEY = 'upi_settings';
export const STATS_STORAGE_KEY = 'upi_stats';
export const RECENTS_STORAGE_KEY = 'upi_recents';

/** How many recently viewed professors the popup keeps. */
export const MAX_RECENT_PROFESSORS = 8;

/** Lives here rather than in background/ so content and popup can read it too. */
export const DEFAULT_SETTINGS = {
  autoDetect: true,
  showFilterBar: true,
  cacheTTLDays: DEFAULT_CACHE_TTL_DAYS,
} as const;

/** Bounds for the cacheTTLDays setting, enforced in the popup and on save. */
export const MIN_CACHE_TTL_DAYS = 1;
export const MAX_CACHE_TTL_DAYS = 90;

/** Caps on the detail card's supplementary lists, so it stays a card and not a page. */
export const MAX_COURSES_SHOWN = 4;
export const MAX_ALTERNATES_SHOWN = 3;

/** RMP sentinel meaning "not enough data" for wouldTakeAgainPercent. */
export const RMP_NO_DATA_SENTINEL = -1;

/** How many recent ratings to pull when tallying tags and per-course averages. */
export const TAG_SAMPLE_SIZE = 40;
export const MAX_TOP_TAGS = 5;
export const MAX_TAG_LENGTH = 120;

/**
 * Minimum reviews before a per-course average is shown. One review is noise,
 * and printing it next to a 164-review overall implies precision that is absent.
 */
export const MIN_COURSE_RATINGS = 3;

/**
 * A phrase must recur across this many separate reviews before it is shown.
 * One student's turn of phrase is not a theme.
 */
export const MIN_PHRASE_MENTIONS = 3;
export const MAX_REVIEW_PHRASES = 5;

/** Bumped whenever ProfessorData's shape changes; older entries are discarded. */
export const CACHE_SCHEMA_VERSION = 2;

/**
 * Results RMP returns per search page. A full page means the list was probably
 * cut short, so a surname search may not contain the professor we want.
 */
export const SEARCH_PAGE_SIZE = 10;

/**
 * Hosts that actually serve UAccess. `uaccess.arizona.edu` on its own is only
 * the portal landing page. Class search and registration live on the
 * subdomains below, which Chrome match patterns do not cover implicitly.
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
