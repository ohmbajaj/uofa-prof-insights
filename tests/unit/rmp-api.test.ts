import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RmpApiError,
  mapTeacherNode,
  searchProfessor,
  selectExactMatch,
  tallyTags,
} from '@background/rmp-api';
import { UOFA_SCHOOL_ID } from '@shared/constants';

/** Shape mirrors the live response recorded during Phase 0. */
function teacher(patch: Record<string, unknown> = {}) {
  return {
    id: 'VGVhY2hlci0xMjMwMg==',
    legacyId: 12302,
    firstName: 'Rick',
    lastName: 'Mercer',
    department: 'Computer Science',
    school: { id: UOFA_SCHOOL_ID, name: 'University of Arizona' },
    avgRating: 2.9,
    avgDifficulty: 2.9,
    wouldTakeAgainPercent: 48.5714,
    numRatings: 164,
    ...patch,
  };
}

function searchPayload(nodes: Record<string, unknown>[]) {
  return {
    data: {
      newSearch: { teachers: { didFallback: false, edges: nodes.map((node) => ({ node })) } },
    },
  };
}

function ratingsPayload(tagStrings: (string | null)[]) {
  return {
    data: {
      node: { ratings: { edges: tagStrings.map((ratingTags) => ({ node: { ratingTags } })) } },
    },
  };
}

function mockFetchSequence(...payloads: unknown[]) {
  const fetchMock = vi.fn();
  for (const payload of payloads) {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => payload,
    });
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('selectExactMatch', () => {
  it('picks the exact first+last match out of fuzzy results', () => {
    const nodes = [
      teacher({ firstName: 'Dave', lastName: 'Rick', numRatings: 8 }),
      teacher({ firstName: 'Rick', lastName: 'Mercer', numRatings: 164 }),
      teacher({ firstName: 'Rick', lastName: 'Yngve', numRatings: 3 }),
    ];
    expect(selectExactMatch(nodes as never, 'Rick Mercer')?.lastName).toBe('Mercer');
  });

  it('returns null when nothing matches exactly', () => {
    const nodes = [teacher({ firstName: 'Richard', lastName: 'Mercer' })];
    expect(selectExactMatch(nodes as never, 'Rick Mercer')).toBeNull();
  });

  it('does not conflate Rick Mercer with Richard Mercer', () => {
    const nodes = [
      teacher({ firstName: 'Richard', lastName: 'Mercer', numRatings: 1 }),
      teacher({ firstName: 'Rick', lastName: 'Mercer', numRatings: 164 }),
    ];
    expect(selectExactMatch(nodes as never, 'Richard Mercer')?.numRatings).toBe(1);
  });

  it('is case- and accent-insensitive', () => {
    const nodes = [teacher({ firstName: 'José', lastName: 'García' })];
    expect(selectExactMatch(nodes as never, 'jose garcia')).not.toBeNull();
  });

  it('breaks duplicate-profile ties toward the most-rated profile', () => {
    const nodes = [
      teacher({ id: 'dupe', numRatings: 0 }),
      teacher({ id: 'real', numRatings: 164 }),
    ];
    expect(selectExactMatch(nodes as never, 'Rick Mercer')?.id).toBe('real');
  });

  it('returns null for an empty result set', () => {
    expect(selectExactMatch([], 'Rick Mercer')).toBeNull();
  });
});

describe('mapTeacherNode', () => {
  it('maps a rated professor onto ProfessorData', () => {
    const data = mapTeacherNode(teacher() as never, ['Tough grader']);
    expect(data).toMatchObject({
      id: 'VGVhY2hlci0xMjMwMg==',
      name: 'Rick Mercer',
      department: 'Computer Science',
      university: 'University of Arizona',
      overallRating: 2.9,
      difficulty: 2.9,
      wouldTakeAgain: 48.6,
      numRatings: 164,
      topTags: ['Tough grader'],
      rmpUrl: 'https://www.ratemyprofessors.com/professor/12302',
    });
    expect(data.cachedAt).toBeGreaterThan(0);
  });

  it('maps the unrated sentinels (0 rating, -1 WTA) to null', () => {
    const data = mapTeacherNode(
      teacher({
        avgRating: 0,
        avgDifficulty: 0,
        wouldTakeAgainPercent: -1,
        numRatings: 0,
      }) as never,
    );
    expect(data.overallRating).toBeNull();
    expect(data.difficulty).toBeNull();
    expect(data.wouldTakeAgain).toBeNull();
    expect(data.numRatings).toBe(0);
  });

  it('keeps a legitimate 0% wouldTakeAgain distinct from no data', () => {
    const data = mapTeacherNode(teacher({ wouldTakeAgainPercent: 0 }) as never);
    expect(data.wouldTakeAgain).toBe(0);
  });

  it('falls back when department or school is missing', () => {
    const data = mapTeacherNode(teacher({ department: null, school: null }) as never);
    expect(data.department).toBe('Unknown');
    expect(data.university).toBe('University of Arizona');
  });
});

describe('tallyTags', () => {
  it('splits the -- delimited string and ranks by frequency', () => {
    expect(
      tallyTags([
        'Tough grader--Lecture heavy--Test heavy',
        'Lecture heavy--Caring',
        'Lecture heavy',
      ]),
    ).toEqual(['Lecture heavy', 'Caring', 'Test heavy', 'Tough grader']);
  });

  it('ignores null and empty tag strings', () => {
    expect(tallyTags([null, '', '   ', 'Caring'])).toEqual(['Caring']);
  });

  it('caps the list at MAX_TOP_TAGS', () => {
    const many = ['a--b--c--d--e--f--g--h'];
    expect(tallyTags(many)).toHaveLength(5);
  });

  it('returns an empty list for no ratings', () => {
    expect(tallyTags([])).toEqual([]);
  });
});

describe('searchProfessor', () => {
  it('queries the UofA school id and returns a mapped professor', async () => {
    const fetchMock = mockFetchSequence(
      searchPayload([teacher()]),
      ratingsPayload(['Tough grader--Lecture heavy', 'Lecture heavy']),
    );

    const result = await searchProfessor('Rick Mercer');

    expect(result?.name).toBe('Rick Mercer');
    expect(result?.topTags).toEqual(['Lecture heavy', 'Tough grader']);

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1].body as string) as {
      variables: { query: { text: string; schoolID: string } };
    };
    expect(body.variables.query.schoolID).toBe(UOFA_SCHOOL_ID);
    expect(body.variables.query.text).toBe('Rick Mercer');
  });

  it('sends the documented auth header', async () => {
    const fetchMock = mockFetchSequence(searchPayload([]));
    await searchProfessor('Nobody Here');

    const init = fetchMock.mock.calls[0]?.[1] as { headers: Record<string, string> };
    expect(init.headers.Authorization).toBe('Basic dGVzdDp0ZXN0');
  });

  it('returns null when the fuzzy search has no exact match', async () => {
    mockFetchSequence(searchPayload([teacher({ firstName: 'Dave', lastName: 'Rick' })]));
    await expect(searchProfessor('Rick Mercer')).resolves.toBeNull();
  });

  it('returns null for an empty name without calling the network', async () => {
    const fetchMock = mockFetchSequence(searchPayload([]));
    await expect(searchProfessor('   ')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips the tags request for an unrated professor', async () => {
    const fetchMock = mockFetchSequence(searchPayload([teacher({ numRatings: 0, avgRating: 0 })]));
    const result = await searchProfessor('Rick Mercer');

    expect(result?.topTags).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still returns the professor when the tags request fails', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => searchPayload([teacher()]),
    });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const result = await searchProfessor('Rick Mercer');
    expect(result?.name).toBe('Rick Mercer');
    expect(result?.topTags).toEqual([]);
  });

  it('throws RmpApiError on an HTTP failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }),
    );
    await expect(searchProfessor('Rick Mercer')).rejects.toBeInstanceOf(RmpApiError);
  });

  it('throws RmpApiError when the network is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(searchProfessor('Rick Mercer')).rejects.toBeInstanceOf(RmpApiError);
  });

  it('surfaces GraphQL errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ errors: [{ message: 'Cannot query field "bogus"' }] }),
      }),
    );
    await expect(searchProfessor('Rick Mercer')).rejects.toThrow(/bogus/);
  });
});
