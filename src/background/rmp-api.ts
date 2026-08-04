import {
  MAX_TOP_TAGS,
  MIN_COURSE_RATINGS,
  RMP_AUTH_HEADER,
  RMP_GRAPHQL_ENDPOINT,
  RMP_NO_DATA_SENTINEL,
  RMP_PROFESSOR_URL_BASE,
  SEARCH_PAGE_SIZE,
  TAG_SAMPLE_SIZE,
  UOFA_SCHOOL_ID,
} from '@shared/constants';
import { comparableName, givenNamesMatch, splitName } from '@shared/names';
import { normalizeCourseCode } from '@shared/utils';
import type { AlternateProfile, CourseRating, MatchConfidence, ProfessorData } from '@shared/types';

/**
 * Teacher search query, verified against the live endpoint on 2026-08-02.
 *
 * Variables: `{ query: { text: string, schoolID: UOFA_SCHOOL_ID } }`
 *
 * Caveat found during Phase 0: the search is fuzzy and school-scoped only —
 * querying "Rick Mercer" returns 10 UofA hits (Rick Mercer, Dave Rick,
 * Rick Yngve, ...). Exact first+last matching has to happen on our side.
 */
export const TEACHER_SEARCH_QUERY = `
query NewSearchTeachersQuery($query: TeacherSearchQuery!) {
  newSearch {
    teachers(query: $query) {
      didFallback
      edges {
        cursor
        node {
          id
          legacyId
          firstName
          lastName
          department
          school { id name }
          avgRating
          avgDifficulty
          wouldTakeAgainPercent
          numRatings
        }
      }
    }
  }
}`;

/**
 * Per-teacher ratings query. Needed because `Teacher.teacherRatingTags` comes
 * back empty in practice — top tags must be tallied from the `--`-delimited
 * `ratingTags` string on individual ratings.
 */
export const TEACHER_RATINGS_QUERY = `
query TeacherRatingsQuery($id: ID!, $count: Int!) {
  node(id: $id) {
    ... on Teacher {
      courseCodes { courseName courseCount }
      ratings(first: $count) {
        edges { node { class ratingTags helpfulRating difficultyRating date } }
      }
    }
  }
}`;

interface TeacherNode {
  id: string;
  legacyId: number;
  firstName: string;
  lastName: string;
  department: string | null;
  school: { id: string; name: string } | null;
  avgRating: number | null;
  avgDifficulty: number | null;
  wouldTakeAgainPercent: number | null;
  numRatings: number | null;
}

interface SearchResponse {
  newSearch?: { teachers?: { didFallback: boolean; edges: { node: TeacherNode }[] } | null } | null;
}

interface RatingNode {
  ratingTags: string | null;
  /** Free-text course the student entered, e.g. "CSC210". */
  class: string | null;
  helpfulRating: number | null;
  difficultyRating: number | null;
}

interface RatingsResponse {
  node?: {
    ratings?: { edges: { node: RatingNode }[] } | null;
  } | null;
}

export class RmpApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RmpApiError';
  }
}

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(RMP_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: RMP_AUTH_HEADER,
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (cause) {
    throw new RmpApiError(`Network request to RateMyProfessors failed: ${String(cause)}`);
  }

  if (!response.ok) {
    throw new RmpApiError(`RateMyProfessors returned HTTP ${response.status}`);
  }

  const body = (await response.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) {
    throw new RmpApiError(body.errors.map((e) => e.message).join('; '));
  }
  if (!body.data) {
    throw new RmpApiError('RateMyProfessors returned an empty response');
  }

  return body.data;
}

/** RMP reports 0 for unrated professors; treat that as "no data", not a real score. */
function toRating(value: number | null | undefined, numRatings: number): number | null {
  if (numRatings <= 0) return null;
  if (value === null || value === undefined || value <= 0) return null;
  return value;
}

function toPercent(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (value === RMP_NO_DATA_SENTINEL || value < 0) return null;
  return Math.round(value * 10) / 10;
}

function toAlternate(node: TeacherNode): AlternateProfile {
  const numRatings = node.numRatings ?? 0;
  return {
    name: `${node.firstName} ${node.lastName}`.trim(),
    overallRating: toRating(node.avgRating, numRatings),
    numRatings,
    rmpUrl: `${RMP_PROFESSOR_URL_BASE}/${node.legacyId}`,
  };
}

export interface MapOptions {
  topTags?: string[];
  courseRatings?: CourseRating[];
  matchConfidence?: MatchConfidence;
  alternates?: TeacherNode[];
}

export function mapTeacherNode(node: TeacherNode, options: MapOptions = {}): ProfessorData {
  const numRatings = node.numRatings ?? 0;
  return {
    id: node.id,
    name: `${node.firstName} ${node.lastName}`.trim(),
    department: node.department ?? 'Unknown',
    university: node.school?.name ?? 'University of Arizona',
    overallRating: toRating(node.avgRating, numRatings),
    difficulty: toRating(node.avgDifficulty, numRatings),
    wouldTakeAgain: toPercent(node.wouldTakeAgainPercent),
    numRatings,
    topTags: options.topTags ?? [],
    rmpUrl: `${RMP_PROFESSOR_URL_BASE}/${node.legacyId}`,
    cachedAt: Date.now(),
    matchConfidence: options.matchConfidence ?? 'exact',
    alternateProfiles: (options.alternates ?? []).map(toAlternate),
    courseRatings: options.courseRatings ?? [],
  };
}

export interface ProfessorMatch {
  node: TeacherNode;
  /** Same-person candidates that lost, best-evidenced first. */
  alternates: TeacherNode[];
  confidence: MatchConfidence;
}

/**
 * Picks the RMP profile that actually corresponds to a UAccess instructor.
 *
 * Surname must match exactly. Given names may differ if they are recognised
 * equivalents ("Rick" for "Richard"), because RMP profiles use whatever name
 * students typed. Among the resulting candidates the one with the most ratings
 * wins, and the rest are returned as alternates rather than dropped.
 *
 * The volume rule is what makes this correct rather than merely lenient. For
 * "Mercer, Richard" the UofA CS candidates are Rick Mercer (2.9, 164 ratings)
 * and Richard Mercer (1.0, 1 rating) — the same person, with a duplicate
 * profile. Exact matching picks the single-review profile and reports 1.0.
 *
 * Guard: a nickname-equivalent profile is only merged with an exact-name one
 * when they share a department. Two genuinely different people who happen to
 * be "Pat Miller" and "Patricia Miller" in different departments stay separate.
 */
export function selectMatch(nodes: TeacherNode[], name: string): ProfessorMatch | null {
  const { first, last } = splitName(name);
  if (!last) return null;

  const sameSurname = nodes.filter((n) => comparableName(n.lastName ?? '') === last);
  if (sameSurname.length === 0) return null;

  const exact = sameSurname.filter((n) => comparableName(n.firstName ?? '') === first);
  const equivalent = sameSurname.filter(
    (n) => comparableName(n.firstName ?? '') !== first && givenNamesMatch(n.firstName ?? '', first),
  );

  let candidates: TeacherNode[];
  if (exact.length > 0) {
    // Only fold in nickname variants from a department we already matched.
    const departments = new Set(exact.map((n) => comparableName(n.department ?? '')));
    candidates = [
      ...exact,
      ...equivalent.filter((n) => departments.has(comparableName(n.department ?? ''))),
    ];
  } else {
    candidates = equivalent;
  }

  if (candidates.length === 0) return null;

  const ranked = [...candidates].sort((a, b) => (b.numRatings ?? 0) - (a.numRatings ?? 0));
  const [best, ...alternates] = ranked;
  if (!best) return null;

  return {
    node: best,
    alternates,
    confidence: comparableName(best.firstName ?? '') === first ? 'exact' : 'nickname',
  };
}

/** Tallies the `--`-delimited ratingTags strings into the most common tags. */
export function tallyTags(ratingTags: (string | null)[]): string[] {
  const counts = new Map<string, number>();

  for (const raw of ratingTags) {
    for (const tag of (raw ?? '').split('--')) {
      const clean = tag.trim();
      if (clean) counts.set(clean, (counts.get(clean) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_TOP_TAGS)
    .map(([tag]) => tag);
}

/** Mean of the values present, or null when there are none. */
function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  const total = values.reduce((sum, v) => sum + v, 0);
  return Math.round((total / values.length) * 10) / 10;
}

/**
 * Groups individual ratings by course.
 *
 * Only courses with at least MIN_COURSE_RATINGS reviews are kept — a
 * single review is noise, and presenting it beside a 164-review average would
 * imply a precision that is not there.
 */
export function tallyCourseRatings(
  ratings: {
    class: string | null;
    helpfulRating: number | null;
    difficultyRating: number | null;
  }[],
): CourseRating[] {
  const buckets = new Map<string, { helpful: number[]; difficulty: number[] }>();

  for (const rating of ratings) {
    const course = normalizeCourseCode(rating.class);
    if (!course) continue;

    const bucket = buckets.get(course) ?? { helpful: [], difficulty: [] };
    if (typeof rating.helpfulRating === 'number' && rating.helpfulRating > 0) {
      bucket.helpful.push(rating.helpfulRating);
    }
    if (typeof rating.difficultyRating === 'number' && rating.difficultyRating > 0) {
      bucket.difficulty.push(rating.difficultyRating);
    }
    buckets.set(course, bucket);
  }

  return [...buckets.entries()]
    .map(([course, b]) => ({
      course,
      rating: mean(b.helpful),
      difficulty: mean(b.difficulty),
      numRatings: b.helpful.length,
    }))
    .filter((c) => c.numRatings >= MIN_COURSE_RATINGS)
    .sort((a, b) => b.numRatings - a.numRatings || a.course.localeCompare(b.course));
}

export interface RatingInsights {
  topTags: string[];
  courseRatings: CourseRating[];
}

/**
 * Fetches recent ratings once and derives both the tag tally and the per-course
 * breakdown. A single request serves both; the data was already being
 * downloaded and thrown away.
 */
export async function fetchRatingInsights(teacherId: string): Promise<RatingInsights> {
  const data = await gql<RatingsResponse>(TEACHER_RATINGS_QUERY, {
    id: teacherId,
    count: TAG_SAMPLE_SIZE,
  });
  const nodes = (data.node?.ratings?.edges ?? []).map((e) => e.node);

  return {
    topTags: tallyTags(nodes.map((n) => n.ratingTags)),
    courseRatings: tallyCourseRatings(nodes),
  };
}

/**
 * Looks up one professor by natural-order name ("Rick Mercer"), scoped to UofA.
 * Resolves to null when there is no exact match. Throws RmpApiError on network
 * or GraphQL failures so the caller can distinguish "not found" from "broken".
 */
/** One page of school-scoped candidates for a free-text query. */
async function fetchCandidates(text: string): Promise<TeacherNode[]> {
  const data = await gql<SearchResponse>(TEACHER_SEARCH_QUERY, {
    query: { text, schoolID: UOFA_SCHOOL_ID },
  });
  return (data.newSearch?.teachers?.edges ?? []).map((e) => e.node);
}

function dedupeById(nodes: TeacherNode[]): TeacherNode[] {
  const seen = new Map<string, TeacherNode>();
  for (const node of nodes) if (!seen.has(node.id)) seen.set(node.id, node);
  return [...seen.values()];
}

export async function searchProfessor(name: string): Promise<ProfessorData | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const { last } = splitName(trimmed);
  if (!last) return null;

  /*
   * Search by surname, not by the full name.
   *
   * RMP ranks results by given name, so querying "Richard Mercer" returns ten
   * unrelated Richards from across campus and omits "Rick Mercer" — the
   * profile that actually holds this professor's 164 ratings — entirely.
   * Querying "Mercer" returns exactly the three Mercers, which is the pool
   * selectMatch needs. Verified against the live API.
   */
  let candidates = await fetchCandidates(last);
  let match = selectMatch(candidates, trimmed);

  /*
   * A full page suggests the surname results were truncated, so the right
   * person may simply not be on it. Fall back to the full-name query and match
   * over the union — but only when the surname pass was inconclusive, to keep
   * the common case at one request.
   */
  const truncated = candidates.length >= SEARCH_PAGE_SIZE;
  if (!match || (truncated && match.confidence !== 'exact')) {
    candidates = dedupeById([...candidates, ...(await fetchCandidates(trimmed))]);
    match = selectMatch(candidates, trimmed);
  }

  if (!match) return null;

  // Missing insights should never sink an otherwise good result.
  let insights: RatingInsights = { topTags: [], courseRatings: [] };
  if ((match.node.numRatings ?? 0) > 0) {
    try {
      insights = await fetchRatingInsights(match.node.id);
    } catch {
      insights = { topTags: [], courseRatings: [] };
    }
  }

  return mapTeacherNode(match.node, {
    topTags: insights.topTags,
    courseRatings: insights.courseRatings,
    matchConfidence: match.confidence,
    alternates: match.alternates,
  });
}
