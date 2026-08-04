/**
 * Normalized professor record used across the whole extension.
 *
 * This is our own shape, deliberately decoupled from the RateMyProfessors
 * GraphQL response. `rmp-api.ts` is responsible for mapping RMP's raw node
 * (which uses sentinel values like `-1` / `0` for "no data") onto the
 * `number | null` fields below.
 */
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
}

export interface CacheEntry {
  key: string;
  data: ProfessorData;
  /** Epoch milliseconds after which this entry must be refetched. */
  expiresAt: number;
}

export interface ExtensionSettings {
  autoDetect: boolean;
  showComparison: boolean;
  cacheTTLDays: number;
}
