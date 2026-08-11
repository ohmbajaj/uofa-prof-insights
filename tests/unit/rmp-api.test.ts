import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RmpApiError,
  mapTeacherNode,
  searchProfessor,
  selectMatch,
  tallyCourseRatings,
  tallyTags,
} from '@background/rmp-api';
import { normalizeCourseCode } from '@shared/utils';
import { UOFA_SCHOOL_ID } from '@shared/constants';

/** Shape mirrors the live API response. */
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
      node: {
        ratings: {
          edges: tagStrings.map((ratingTags) => ({
            node: { ratingTags, class: null, helpfulRating: null, difficultyRating: null },
          })),
        },
      },
    },
  };
}

function courseRatingsPayload(
  rows: { class: string | null; helpfulRating?: number; difficultyRating?: number }[],
) {
  return {
    data: {
      node: {
        ratings: {
          edges: rows.map((r) => ({
            node: {
              ratingTags: null,
              class: r.class,
              helpfulRating: r.helpfulRating ?? null,
              difficultyRating: r.difficultyRating ?? null,
            },
          })),
        },
      },
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

describe('selectMatch', () => {
  it('picks the exact first+last match out of fuzzy results', () => {
    const nodes = [
      teacher({ firstName: 'Dave', lastName: 'Rick', numRatings: 8 }),
      teacher({ firstName: 'Rick', lastName: 'Mercer', numRatings: 164 }),
      teacher({ firstName: 'Rick', lastName: 'Yngve', numRatings: 3 }),
    ];
    const match = selectMatch(nodes as never, 'Rick Mercer');
    expect(match?.node.lastName).toBe('Mercer');
    expect(match?.confidence).toBe('exact');
  });

  // The case that motivated all of this, taken from the live API: UAccess says
  // "Mercer, Richard", and the two UofA CS profiles are a 1-review "Richard"
  // and a 164-review "Rick". Exact matching reported 1.0 for a 2.9 professor.
  it('prefers the well-evidenced nickname profile over a one-review exact name', () => {
    const nodes = [
      teacher({
        id: 'noise',
        firstName: 'Richard',
        lastName: 'Mercer',
        numRatings: 1,
        avgRating: 1,
      }),
      teacher({
        id: 'real',
        firstName: 'Rick',
        lastName: 'Mercer',
        numRatings: 164,
        avgRating: 2.9,
      }),
    ];
    const match = selectMatch(nodes as never, 'Richard Mercer');

    expect(match?.node.id).toBe('real');
    expect(match?.confidence).toBe('nickname');
    expect(match?.alternates.map((a) => a.id)).toEqual(['noise']);
  });

  it('resolves the reverse direction too (roster "Rick", RMP "Richard")', () => {
    const nodes = [teacher({ firstName: 'Richard', lastName: 'Mercer', numRatings: 164 })];
    expect(selectMatch(nodes as never, 'Rick Mercer')?.node.numRatings).toBe(164);
  });

  it('keeps the exact profile when it is the better-evidenced one', () => {
    const nodes = [
      teacher({ id: 'exact', firstName: 'Richard', lastName: 'Mercer', numRatings: 200 }),
      teacher({ id: 'nick', firstName: 'Rick', lastName: 'Mercer', numRatings: 3 }),
    ];
    const match = selectMatch(nodes as never, 'Richard Mercer');
    expect(match?.node.id).toBe('exact');
    expect(match?.confidence).toBe('exact');
  });

  it('will not merge nickname variants across departments', () => {
    // Two real people, not one person with a duplicate profile.
    const nodes = [
      teacher({
        id: 'math',
        firstName: 'Pat',
        lastName: 'Miller',
        department: 'Mathematics',
        numRatings: 2,
      }),
      teacher({
        id: 'chem',
        firstName: 'Patricia',
        lastName: 'Miller',
        department: 'Chemistry',
        numRatings: 90,
      }),
    ];
    const match = selectMatch(nodes as never, 'Pat Miller');

    expect(match?.node.id).toBe('math');
    expect(match?.alternates).toEqual([]);
  });

  it('matches a single-initial profile against the full name', () => {
    const nodes = [teacher({ firstName: 'R', lastName: 'Mercer', numRatings: 40 })];
    expect(selectMatch(nodes as never, 'Richard Mercer')?.node.numRatings).toBe(40);
  });

  it('rejects a different surname outright', () => {
    const nodes = [teacher({ firstName: 'Rick', lastName: 'Yngve' })];
    expect(selectMatch(nodes as never, 'Rick Mercer')).toBeNull();
  });

  it('rejects unrelated given names sharing a surname', () => {
    const nodes = [teacher({ firstName: 'Mike', lastName: 'Mercer', numRatings: 9 })];
    expect(selectMatch(nodes as never, 'Richard Mercer')).toBeNull();
  });

  it('is case- and accent-insensitive', () => {
    const nodes = [teacher({ firstName: 'José', lastName: 'García' })];
    expect(selectMatch(nodes as never, 'jose garcia')).not.toBeNull();
  });

  it('handles multi-word surnames', () => {
    const nodes = [teacher({ firstName: 'Elizabeth', lastName: 'Van Horn', numRatings: 5 })];
    expect(selectMatch(nodes as never, 'Liz Van Horn')?.node.numRatings).toBe(5);
  });

  it('breaks duplicate-profile ties toward the most-rated profile', () => {
    const nodes = [
      teacher({ id: 'dupe', numRatings: 0 }),
      teacher({ id: 'real', numRatings: 164 }),
    ];
    expect(selectMatch(nodes as never, 'Rick Mercer')?.node.id).toBe('real');
  });

  it('returns null for an empty result set', () => {
    expect(selectMatch([], 'Rick Mercer')).toBeNull();
  });
});

describe('normalizeCourseCode', () => {
  it.each([
    ['CSC110', 'CSC110'],
    ['csc 110', 'CSC110'],
    ['CSC-110', 'CSC110'],
    ['  csc110  ', 'CSC110'],
    ['MATH223A', 'MATH223A'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeCourseCode(input)).toBe(expected);
  });

  it.each([null, undefined, '', '110', 'COMPUTERS', 'A', 'X'])(
    'drops unusable value %s',
    (input) => {
      expect(normalizeCourseCode(input)).toBeNull();
    },
  );
});

describe('tallyCourseRatings', () => {
  const rating = (cls: string | null, helpful: number, difficulty = 3) => ({
    class: cls,
    helpfulRating: helpful,
    difficultyRating: difficulty,
  });

  it('averages ratings per course', () => {
    const result = tallyCourseRatings([
      rating('CSC110', 4, 2),
      rating('CSC110', 5, 2),
      rating('CSC110', 3, 2),
    ]);
    expect(result).toEqual([{ course: 'CSC110', rating: 4, difficulty: 2, numRatings: 3 }]);
  });

  it('separates courses and orders by volume', () => {
    const result = tallyCourseRatings([
      ...Array.from({ length: 3 }, () => rating('CSC110', 5)),
      ...Array.from({ length: 6 }, () => rating('CSC335', 2)),
    ]);
    expect(result.map((c) => c.course)).toEqual(['CSC335', 'CSC110']);
  });

  it('drops courses below the minimum sample, since one review is noise', () => {
    const result = tallyCourseRatings([rating('CSC110', 5), rating('CSC110', 4)]);
    expect(result).toEqual([]);
  });

  it('normalizes spelling variants into one bucket', () => {
    const result = tallyCourseRatings([
      rating('CSC110', 4),
      rating('csc 110', 4),
      rating('CSC-110', 4),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.numRatings).toBe(3);
  });

  it('ignores ratings with no usable course', () => {
    expect(tallyCourseRatings([rating(null, 5), rating('110', 5), rating('', 5)])).toEqual([]);
  });

  it('returns an empty list for no ratings', () => {
    expect(tallyCourseRatings([])).toEqual([]);
  });
});

describe('mapTeacherNode', () => {
  it('maps a rated professor onto ProfessorData', () => {
    const data = mapTeacherNode(teacher() as never, { topTags: ['Tough grader'] });
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
    // Surname, not the full name: RMP ranks by given name, so "Rick Mercer"
    // returns ten unrelated Ricks and omits the Mercers.
    expect(body.variables.query.text).toBe('mercer');
  });

  it('does not make a second request when the surname search resolves it', async () => {
    const fetchMock = mockFetchSequence(searchPayload([teacher()]), ratingsPayload([]));

    await searchProfessor('Rick Mercer');

    // One search + one ratings call; no full-name fallback needed.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to the full-name query when the surname search finds nobody', async () => {
    const fetchMock = mockFetchSequence(
      searchPayload([]), // surname page: empty
      searchPayload([teacher()]), // full-name fallback finds them
      ratingsPayload([]),
    );

    const result = await searchProfessor('Rick Mercer');

    expect(result?.name).toBe('Rick Mercer');
    const second = JSON.parse(fetchMock.mock.calls[1]?.[1].body as string) as {
      variables: { query: { text: string } };
    };
    expect(second.variables.query.text).toBe('Rick Mercer');
  });

  it('carries course-specific ratings through to the result', async () => {
    mockFetchSequence(
      searchPayload([teacher()]),
      courseRatingsPayload([
        { class: 'CSC110', helpfulRating: 4, difficultyRating: 2 },
        { class: 'CSC110', helpfulRating: 4, difficultyRating: 2 },
        { class: 'csc 110', helpfulRating: 4, difficultyRating: 2 },
        { class: 'CSC335', helpfulRating: 1, difficultyRating: 5 },
      ]),
    );

    const result = await searchProfessor('Rick Mercer');

    // CSC335 has a single review, below the noise floor.
    expect(result?.courseRatings).toEqual([
      { course: 'CSC110', rating: 4, difficulty: 2, numRatings: 3 },
    ]);
  });

  it('reports the alternate profile when a nickname match wins', async () => {
    mockFetchSequence(
      searchPayload([
        teacher({
          id: 'noise',
          firstName: 'Richard',
          numRatings: 1,
          avgRating: 1,
          legacyId: 2794287,
        }),
        teacher({ id: 'real', firstName: 'Rick', numRatings: 164, avgRating: 2.9 }),
      ]),
      ratingsPayload([]),
    );

    const result = await searchProfessor('Richard Mercer');

    expect(result?.name).toBe('Rick Mercer');
    expect(result?.overallRating).toBe(2.9);
    expect(result?.matchConfidence).toBe('nickname');
    expect(result?.alternateProfiles).toEqual([
      {
        name: 'Richard Mercer',
        overallRating: 1,
        numRatings: 1,
        rmpUrl: 'https://www.ratemyprofessors.com/professor/2794287',
      },
    ]);
  });

  it('sends the documented auth header', async () => {
    // Two empty pages: the surname search, then the full-name fallback.
    const fetchMock = mockFetchSequence(searchPayload([]), searchPayload([]));
    await searchProfessor('Nobody Here');

    const init = fetchMock.mock.calls[0]?.[1] as { headers: Record<string, string> };
    expect(init.headers.Authorization).toBe('Basic dGVzdDp0ZXN0');
  });

  it('returns null when neither query yields a matching name', async () => {
    mockFetchSequence(
      searchPayload([teacher({ firstName: 'Dave', lastName: 'Rick' })]),
      searchPayload([teacher({ firstName: 'Dave', lastName: 'Rick' })]),
    );
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
