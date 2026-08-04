import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installChromeMock, makeProfessor } from '../helpers/chrome-mock';

const chromeMock = installChromeMock();

// Imported after the global mock is installed.
const cache = await import('@background/cache');
const { CACHE_STORAGE_KEY, MAX_CACHE_ENTRIES, SETTINGS_STORAGE_KEY } =
  await import('@shared/constants');

const DAY = 86_400_000;

beforeEach(() => {
  chromeMock.reset();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('cache get/set', () => {
  it('returns null for a missing key', async () => {
    await expect(cache.get('uofa:nobody')).resolves.toBeNull();
  });

  it('round-trips a stored professor', async () => {
    const prof = makeProfessor({ name: 'Rick Mercer' });
    await cache.set('uofa:rick_mercer', prof);
    await expect(cache.get('uofa:rick_mercer')).resolves.toEqual(prof);
  });

  it('persists under the documented storage key', async () => {
    await cache.set('uofa:rick_mercer', makeProfessor());
    expect(Object.keys(chromeMock.store)).toContain(CACHE_STORAGE_KEY);
  });

  it('overwrites an existing entry rather than duplicating it', async () => {
    await cache.set('uofa:rick_mercer', makeProfessor({ overallRating: 2.9 }));
    await cache.set('uofa:rick_mercer', makeProfessor({ overallRating: 4.4 }));

    const stored = await cache.readAll();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.data.overallRating).toBe(4.4);
  });

  it('tolerates a corrupted storage blob', async () => {
    await chrome.storage.local.set({ [CACHE_STORAGE_KEY]: 'not-an-object' });
    await expect(cache.get('uofa:anyone')).resolves.toBeNull();
  });
});

describe('cache expiry', () => {
  it('returns null once an entry is past its TTL', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    await cache.set('uofa:rick_mercer', makeProfessor());

    // Default TTL is 7 days.
    vi.setSystemTime(new Date('2026-01-06T00:00:00Z'));
    await expect(cache.get('uofa:rick_mercer')).resolves.not.toBeNull();

    vi.setSystemTime(new Date('2026-01-09T00:00:00Z'));
    await expect(cache.get('uofa:rick_mercer')).resolves.toBeNull();
  });

  it('honours a custom cacheTTLDays setting', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: { cacheTTLDays: 1 } });
    await cache.set('uofa:rick_mercer', makeProfessor());

    vi.setSystemTime(new Date('2026-01-03T00:00:00Z'));
    await expect(cache.get('uofa:rick_mercer')).resolves.toBeNull();
  });

  it('evicts the expired entry from storage on read', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    await cache.set('uofa:rick_mercer', makeProfessor());

    vi.setSystemTime(new Date('2026-02-01T00:00:00Z'));
    await cache.get('uofa:rick_mercer');

    const blob = chromeMock.store[CACHE_STORAGE_KEY] as Record<string, unknown>;
    expect(Object.keys(blob)).toHaveLength(0);
  });
});

describe('cache eviction', () => {
  it('trims to MAX_CACHE_ENTRIES, dropping the least recently fetched', async () => {
    const now = Date.now();

    // Seed one over the limit; entry 0 is the oldest by cachedAt.
    for (let i = 0; i <= MAX_CACHE_ENTRIES; i++) {
      await chrome.storage.local.get(CACHE_STORAGE_KEY);
      await cache.set(`uofa:prof_${i}`, makeProfessor({ cachedAt: now + i }));
    }

    const stored = await cache.readAll();
    expect(stored).toHaveLength(MAX_CACHE_ENTRIES);
    expect(await cache.get('uofa:prof_0')).toBeNull();
    expect(await cache.get(`uofa:prof_${MAX_CACHE_ENTRIES}`)).not.toBeNull();
  }, 30_000);
});

describe('getStats', () => {
  it('reports zero for an empty cache', async () => {
    await expect(cache.getStats()).resolves.toEqual({ count: 0, oldestAge: 0 });
  });

  it('counts live entries and measures the oldest', async () => {
    const now = Date.now();
    await cache.set('uofa:a', makeProfessor({ cachedAt: now - 3 * DAY }));
    await cache.set('uofa:b', makeProfessor({ cachedAt: now - 1 * DAY }));

    const stats = await cache.getStats();
    expect(stats.count).toBe(2);
    expect(stats.oldestAge).toBeGreaterThanOrEqual(3 * DAY);
    expect(stats.oldestAge).toBeLessThan(4 * DAY);
  });
});

describe('clear and remove', () => {
  it('clear empties the cache', async () => {
    await cache.set('uofa:a', makeProfessor());
    await cache.clear();
    await expect(cache.getStats()).resolves.toEqual({ count: 0, oldestAge: 0 });
  });

  it('remove deletes only the named key', async () => {
    await cache.set('uofa:a', makeProfessor());
    await cache.set('uofa:b', makeProfessor());
    await cache.remove('uofa:a');

    expect(await cache.get('uofa:a')).toBeNull();
    expect(await cache.get('uofa:b')).not.toBeNull();
  });

  it('remove is a no-op for an unknown key', async () => {
    await expect(cache.remove('uofa:ghost')).resolves.toBeUndefined();
  });
});

describe('settings', () => {
  it('falls back to defaults when nothing is stored', async () => {
    await expect(cache.getSettings()).resolves.toEqual(cache.DEFAULT_SETTINGS);
  });

  it('merges a partial patch over the defaults', async () => {
    const saved = await cache.saveSettings({ autoDetect: false });
    expect(saved.autoDetect).toBe(false);
    expect(saved.cacheTTLDays).toBe(cache.DEFAULT_SETTINGS.cacheTTLDays);
    await expect(cache.getSettings()).resolves.toEqual(saved);
  });

  it.each([
    [0, 1],
    [-5, 1],
    [1000, 90],
    [7.6, 8],
  ])('clamps a cacheTTLDays of %s to %s', async (input, expected) => {
    const saved = await cache.saveSettings({ cacheTTLDays: input });
    expect(saved.cacheTTLDays).toBe(expected);
  });

  it('falls back to the default for a non-numeric TTL', async () => {
    const saved = await cache.saveSettings({ cacheTTLDays: Number.NaN });
    expect(saved.cacheTTLDays).toBe(cache.DEFAULT_SETTINGS.cacheTTLDays);
  });

  it('clamps a TTL that was written directly to storage', async () => {
    await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: { cacheTTLDays: 9999 } });
    await expect(cache.getSettings()).resolves.toMatchObject({ cacheTTLDays: 90 });
  });
});
