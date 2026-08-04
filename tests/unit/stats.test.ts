import { beforeEach, describe, expect, it } from 'vitest';
import * as stats from '@background/stats';
import { MAX_RECENT_PROFESSORS } from '@shared/constants';
import { installChromeMock, makeProfessor } from '../helpers/chrome-mock';

const chromeMock = installChromeMock();

beforeEach(() => {
  chromeMock.reset();
});

describe('usage counters', () => {
  it('starts at zero', async () => {
    await expect(stats.getStats()).resolves.toEqual(stats.EMPTY_STATS);
  });

  it('accumulates across calls', async () => {
    await stats.bumpStats({ lookups: 1, matches: 1 });
    await stats.bumpStats({ lookups: 2, misses: 1 });

    const result = await stats.getStats();
    expect(result.lookups).toBe(3);
    expect(result.matches).toBe(1);
    expect(result.misses).toBe(1);
  });

  it('stamps the first-seen time once and keeps it', async () => {
    const first = await stats.bumpStats({ lookups: 1 });
    expect(first.since).toBeGreaterThan(0);

    const second = await stats.bumpStats({ lookups: 1 });
    expect(second.since).toBe(first.since);
  });

  it('tracks each outcome separately', async () => {
    await stats.bumpStats({ lookups: 1, errors: 1 });
    await stats.bumpStats({ lookups: 1, cacheHits: 1, matches: 1 });
    await stats.bumpStats({ badgesShown: 5 });

    expect(await stats.getStats()).toMatchObject({
      lookups: 2,
      errors: 1,
      cacheHits: 1,
      matches: 1,
      badgesShown: 5,
    });
  });

  it('clears back to empty', async () => {
    await stats.bumpStats({ lookups: 9 });
    await stats.clearStats();
    await expect(stats.getStats()).resolves.toEqual(stats.EMPTY_STATS);
  });

  it('tolerates a partially shaped stored record', async () => {
    await chrome.storage.local.set({ upi_stats: { lookups: 4 } });
    const result = await stats.getStats();

    expect(result.lookups).toBe(4);
    expect(result.matches).toBe(0);
  });
});

describe('recently viewed', () => {
  it('starts empty', async () => {
    await expect(stats.getRecents()).resolves.toEqual([]);
  });

  it('records the most recent first', async () => {
    await stats.recordRecent(makeProfessor({ name: 'First Prof' }));
    await stats.recordRecent(makeProfessor({ name: 'Second Prof' }));

    const recents = await stats.getRecents();
    expect(recents.map((r) => r.name)).toEqual(['Second Prof', 'First Prof']);
  });

  it('moves a repeat view to the top without duplicating it', async () => {
    await stats.recordRecent(makeProfessor({ name: 'A Prof' }));
    await stats.recordRecent(makeProfessor({ name: 'B Prof' }));
    await stats.recordRecent(makeProfessor({ name: 'A Prof' }));

    const recents = await stats.getRecents();
    expect(recents.map((r) => r.name)).toEqual(['A Prof', 'B Prof']);
  });

  it(`keeps at most ${MAX_RECENT_PROFESSORS}`, async () => {
    for (let i = 0; i < MAX_RECENT_PROFESSORS + 4; i++) {
      await stats.recordRecent(makeProfessor({ name: `Prof ${i}` }));
    }
    await expect(stats.getRecents()).resolves.toHaveLength(MAX_RECENT_PROFESSORS);
  });

  it('stores only what the popup renders, and nothing schedule-related', async () => {
    await stats.recordRecent(
      makeProfessor({ name: 'Rick Mercer', department: 'Computer Science', overallRating: 2.9 }),
    );
    const [entry] = await stats.getRecents();

    expect(Object.keys(entry!).sort()).toEqual([
      'department',
      'name',
      'numRatings',
      'overallRating',
      'rmpUrl',
      'viewedAt',
    ]);
  });

  it('clears', async () => {
    await stats.recordRecent(makeProfessor());
    await stats.clearRecents();
    await expect(stats.getRecents()).resolves.toEqual([]);
  });
});
