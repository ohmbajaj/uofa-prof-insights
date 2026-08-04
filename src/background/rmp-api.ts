import {
  MAX_TOP_TAGS,
  RMP_AUTH_HEADER,
  RMP_GRAPHQL_ENDPOINT,
  RMP_NO_DATA_SENTINEL,
  RMP_PROFESSOR_URL_BASE,
  TAG_SAMPLE_SIZE,
  UOFA_SCHOOL_ID,
} from '@shared/constants';
import type { ProfessorData } from '@shared/types';

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

interface RatingsResponse {
  node?: {
    ratings?: { edges: { node: { ratingTags: string | null } }[] } | null;
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

/** Lowercase, strip accents and anything that is not a letter or space. */
function comparable(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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

export function mapTeacherNode(node: TeacherNode, topTags: string[] = []): ProfessorData {
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
    topTags,
    rmpUrl: `${RMP_PROFESSOR_URL_BASE}/${node.legacyId}`,
    cachedAt: Date.now(),
  };
}

/**
 * Picks the single teacher that actually corresponds to `name`.
 *
 * Only exact first+last matches are accepted. A looser match (surname plus
 * first initial) would happily conflate real, distinct UofA professors — CS has
 * both a "Rick Mercer" and a "Richard Mercer" — and showing the wrong person's
 * rating is worse than showing nothing. Ties break toward the profile with the
 * most ratings, which handles RMP's duplicate/typo profiles.
 */
export function selectExactMatch(nodes: TeacherNode[], name: string): TeacherNode | null {
  const wanted = comparable(name);
  const matches = nodes.filter((n) => comparable(`${n.firstName} ${n.lastName}`) === wanted);
  if (matches.length === 0) return null;

  return matches.reduce((best, current) =>
    (current.numRatings ?? 0) > (best.numRatings ?? 0) ? current : best,
  );
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

/** Fetches recent ratings and derives the professor's most common tags. */
export async function fetchTopTags(teacherId: string): Promise<string[]> {
  const data = await gql<RatingsResponse>(TEACHER_RATINGS_QUERY, {
    id: teacherId,
    count: TAG_SAMPLE_SIZE,
  });
  const edges = data.node?.ratings?.edges ?? [];
  return tallyTags(edges.map((e) => e.node.ratingTags));
}

/**
 * Looks up one professor by natural-order name ("Rick Mercer"), scoped to UofA.
 * Resolves to null when there is no exact match. Throws RmpApiError on network
 * or GraphQL failures so the caller can distinguish "not found" from "broken".
 */
export async function searchProfessor(name: string): Promise<ProfessorData | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const data = await gql<SearchResponse>(TEACHER_SEARCH_QUERY, {
    query: { text: trimmed, schoolID: UOFA_SCHOOL_ID },
  });

  const edges = data.newSearch?.teachers?.edges ?? [];
  const match = selectExactMatch(
    edges.map((e) => e.node),
    trimmed,
  );
  if (!match) return null;

  // A missing tag list should never sink an otherwise good result.
  let topTags: string[] = [];
  if ((match.numRatings ?? 0) > 0) {
    try {
      topTags = await fetchTopTags(match.id);
    } catch {
      topTags = [];
    }
  }

  return mapTeacherNode(match, topTags);
}
