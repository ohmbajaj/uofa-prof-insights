/**
 * Normalized professor record used across the whole extension.
 *
 * This is our own shape, deliberately decoupled from the RateMyProfessors
 * GraphQL response. `rmp-api.ts` is responsible for mapping RMP's raw node
 * (which uses sentinel values like `-1` / `0` for "no data") onto the
 * `number | null` fields below.
 */
/**
 * How confidently the UAccess name was tied to this RMP profile.
 * `nickname` means the given names differ but are equivalent — "Rick" for
 * "Richard" — which is worth disclosing rather than hiding.
 */
export type MatchConfidence = 'exact' | 'nickname';

/**
 * Another RMP profile that appears to be the same person.
 *
 * RateMyProfessors has no deduplication, so one professor routinely has two or
 * three profiles under different spellings. We show the best-evidenced one and
 * list the rest rather than silently discarding them.
 */
export interface AlternateProfile {
  name: string;
  overallRating: number | null;
  numRatings: number;
  rmpUrl: string;
}

/**
 * Ratings restricted to a single course.
 *
 * The headline average blends every course a professor has ever taught, which
 * can hide a wide spread — strong in a 100-level survey, punishing in a
 * graduate seminar. This is the number that actually answers "should I take
 * *this* section".
 *
 * Derived from the most recent TAG_SAMPLE_SIZE reviews, not the full history,
 * so these can legitimately differ from `overallRating` on both recency and
 * course. Surface them as "recent" wherever they are shown.
 */
export interface CourseRating {
  /** Course code as RMP records it, normalized: "CSC110". */
  course: string;
  rating: number | null;
  difficulty: number | null;
  numRatings: number;
}

export interface ProfessorData {
  /** RMP's opaque global node id, e.g. "VGVhY2hlci0xMjMwMg==" (base64 "Teacher-12302"). */
  id: string;
  /** Display name in natural order, e.g. "Rick Mercer". */
  name: string;
  department: string;
  university: string;
  /** 1.0-5.0, or null when the professor has no ratings yet. */
  overallRating: number | null;
  /** 1.0-5.0, or null when the professor has no ratings yet. */
  difficulty: number | null;
  /** 0-100 percent, or null when RMP reports no data (raw sentinel is -1). */
  wouldTakeAgain: number | null;
  numRatings: number;
  /** Most frequent rating tags, highest count first. */
  topTags: string[];
  rmpUrl: string;
  /** Epoch milliseconds at which this record was fetched. */
  cachedAt: number;
  /** How the UAccess name was tied to this profile. */
  matchConfidence: MatchConfidence;
  /** Other RMP profiles that look like the same person, best-evidenced first. */
  alternateProfiles: AlternateProfile[];
  /** Per-course breakdown derived from individual ratings, most-rated first. */
  courseRatings: CourseRating[];
}

export interface CacheEntry {
  key: string;
  data: ProfessorData;
  /** Epoch milliseconds after which this entry must be refetched. */
  expiresAt: number;
  /**
   * Shape of `data` when it was written. Entries stamped with an older version
   * are discarded on read rather than migrated — they are a cheap refetch, and
   * migrating would mean carrying every historical shape forever.
   */
  version: number;
}

/**
 * Local-only usage counters.
 *
 * Stored in chrome.storage.local and never transmitted. Present so the user
 * can see what the extension has done, not so anyone can observe them.
 */
export interface UsageStats {
  /** Professor lookups requested, cache hits included. */
  lookups: number;
  /** Lookups that resolved to an RMP profile. */
  matches: number;
  /** Lookups that found no match. */
  misses: number;
  /** Lookups that failed outright. */
  errors: number;
  cacheHits: number;
  badgesShown: number;
  /** Epoch ms of the first recorded event, so rates can be described. */
  since: number;
}

/** A professor whose card the user opened, for the popup's recents list. */
export interface RecentProfessor {
  name: string;
  department: string;
  overallRating: number | null;
  numRatings: number;
  rmpUrl: string;
  viewedAt: number;
}

/**
 * What the content script can see on a page, for troubleshooting.
 *
 * "No badges appeared" has two opposite causes — the script not running, or
 * the selectors not matching — and they are indistinguishable from outside.
 */
export interface PageDiagnostics {
  url: string;
  title: string;
  inFrame: boolean;
  classicCount: number;
  newCount: number;
  genericCount: number;
  badgesInPage: number;
  /** How many text runs were considered at all. Zero means an empty document. */
  textRuns: number;
  names: string[];
  samples: { text: string; path: string }[];
  /** Name-shaped text that was rejected, when nothing was detected. */
  nearMisses: { text: string; path: string }[];
}

export interface ExtensionSettings {
  autoDetect: boolean;
  showComparison: boolean;
  /** Show the controls that hide sections below a rating threshold. */
  showFilterBar: boolean;
  cacheTTLDays: number;
}
