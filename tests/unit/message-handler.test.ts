import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installChromeMock, makeProfessor } from '../helpers/chrome-mock';

const chromeMock = installChromeMock();

const searchProfessor = vi.hoisted(() => vi.fn());
vi.mock('@background/rmp-api', () => ({ searchProfessor }));

const { handleMessage, lookup } = await import('@background/message-handler');
const cache = await import('@background/cache');

beforeEach(async () => {
  chromeMock.reset();
  searchProfessor.mockReset();
  // Clears any in-flight map left over from a previous test.
  await handleMessage({ type: 'CLEAR_CACHE' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('lookup', () => {
  it('normalizes a UAccess name before querying RMP', async () => {
    searchProfessor.mockResolvedValue(makeProfessor({ name: 'Rick Mercer' }));
    await lookup('Mercer, Rick A');
    expect(searchProfessor).toHaveBeenCalledWith('Rick Mercer', { fuzzy: false });
  });

  it('keeps badge lookups strict, and only opts the popup into fuzzy matching', async () => {
    searchProfessor.mockResolvedValue(null);

    await lookup('Mercer, Rick');
    expect(searchProfessor).toHaveBeenLastCalledWith('Rick Mercer', { fuzzy: false });

    await lookup('Thamvich', false, true);
    expect(searchProfessor).toHaveBeenLastCalledWith('Thamvich', { fuzzy: true });
  });

  it('serves the second call from cache', async () => {
    searchProfessor.mockResolvedValue(makeProfessor({ name: 'Rick Mercer' }));

    await lookup('Mercer, Rick');
    await lookup('Mercer, Rick');

    expect(searchProfessor).toHaveBeenCalledTimes(1);
  });

  it('treats differently-formatted spellings as the same cache entry', async () => {
    searchProfessor.mockResolvedValue(makeProfessor({ name: 'Rick Mercer' }));

    await lookup('Mercer, Rick');
    await lookup('Mercer,  Rick  B');

    expect(searchProfessor).toHaveBeenCalledTimes(1);
  });

  it('de-duplicates concurrent lookups for the same professor', async () => {
    let resolveSearch: (value: unknown) => void = () => {};
    searchProfessor.mockReturnValue(
      new Promise((resolve) => {
        resolveSearch = resolve;
      }),
    );

    const all = Promise.all([
      lookup('Mercer, Rick'),
      lookup('Mercer, Rick'),
      lookup('Mercer, Rick'),
    ]);
    resolveSearch(makeProfessor({ name: 'Rick Mercer' }));
    const results = await all;

    expect(searchProfessor).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r?.name === 'Rick Mercer')).toBe(true);
  });

  it('refetches when forceRefresh is set', async () => {
    searchProfessor.mockResolvedValue(makeProfessor({ name: 'Rick Mercer' }));

    await lookup('Mercer, Rick');
    await lookup('Mercer, Rick', true);

    expect(searchProfessor).toHaveBeenCalledTimes(2);
  });

  it('resolves to null and does not cache when the API throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    searchProfessor.mockRejectedValue(new Error('network down'));

    await expect(lookup('Mercer, Rick')).resolves.toBeNull();
    await expect(cache.getStats()).resolves.toMatchObject({ count: 0 });
  });

  it('does not cache a not-found result', async () => {
    searchProfessor.mockResolvedValue(null);

    await expect(lookup('Nobody, Real')).resolves.toBeNull();
    await expect(cache.getStats()).resolves.toMatchObject({ count: 0 });
  });
});

describe('handleMessage', () => {
  it('answers LOOKUP_PROFESSOR with PROFESSOR_RESULT', async () => {
    searchProfessor.mockResolvedValue(makeProfessor({ name: 'Rick Mercer' }));

    const reply = await handleMessage({ type: 'LOOKUP_PROFESSOR', name: 'Mercer, Rick' });

    expect(reply.type).toBe('PROFESSOR_RESULT');
    expect(reply).toMatchObject({ name: 'Mercer, Rick' });
  });

  it('answers LOOKUP_BATCH keyed by the original raw names', async () => {
    searchProfessor.mockImplementation(async (name: string) => makeProfessor({ name }));

    const reply = await handleMessage({
      type: 'LOOKUP_BATCH',
      names: ['Mercer, Rick', 'Debray, Saumya'],
    });

    expect(reply.type).toBe('BATCH_RESULTS');
    if (reply.type !== 'BATCH_RESULTS') throw new Error('unreachable');
    expect(Object.keys(reply.results)).toEqual(['Mercer, Rick', 'Debray, Saumya']);
    expect(reply.results['Mercer, Rick']?.name).toBe('Rick Mercer');
  });

  it('collapses duplicate names within a batch into one request', async () => {
    searchProfessor.mockImplementation(async (name: string) => makeProfessor({ name }));

    await handleMessage({
      type: 'LOOKUP_BATCH',
      names: ['Mercer, Rick', 'Mercer, Rick', 'Mercer, Rick'],
    });

    expect(searchProfessor).toHaveBeenCalledTimes(1);
  });

  it('never exceeds MAX_CONCURRENT_REQUESTS in flight', async () => {
    const { MAX_CONCURRENT_REQUESTS } = await import('@shared/constants');
    let active = 0;
    let peak = 0;

    searchProfessor.mockImplementation(async (name: string) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return makeProfessor({ name });
    });

    // Alphabetic surnames only: normalizeCacheKey strips digits, so "Prof1"
    // and "Prof2" would collapse onto a single cache entry.
    const letter = (i: number) =>
      String.fromCharCode(97 + Math.floor(i / 5)) + String.fromCharCode(97 + (i % 5));
    const names = Array.from({ length: 25 }, (_, i) => `${letter(i)}surname, Test`);

    await handleMessage({ type: 'LOOKUP_BATCH', names });

    expect(peak).toBeLessThanOrEqual(MAX_CONCURRENT_REQUESTS);
    expect(searchProfessor).toHaveBeenCalledTimes(25);
  });

  it('answers GET_CACHE_STATS', async () => {
    const reply = await handleMessage({ type: 'GET_CACHE_STATS' });
    expect(reply).toEqual({ type: 'CACHE_STATS', stats: { count: 0, oldestAge: 0 } });
  });

  it('answers CLEAR_CACHE and actually empties the cache', async () => {
    searchProfessor.mockResolvedValue(makeProfessor({ name: 'Rick Mercer' }));
    await lookup('Mercer, Rick');

    const reply = await handleMessage({ type: 'CLEAR_CACHE' });

    expect(reply).toEqual({ type: 'CACHE_CLEARED' });
    await expect(cache.getStats()).resolves.toMatchObject({ count: 0 });
  });

  it('returns ERROR rather than throwing on an unknown message', async () => {
    const reply = await handleMessage({ type: 'NOPE' } as never);
    expect(reply.type).toBe('ERROR');
  });

  it('answers GET_SETTINGS with the defaults when nothing is stored', async () => {
    const reply = await handleMessage({ type: 'GET_SETTINGS' });

    expect(reply.type).toBe('SETTINGS');
    expect(reply).toMatchObject({ settings: cache.DEFAULT_SETTINGS });
  });

  it('answers SAVE_SETTINGS with the merged result', async () => {
    const reply = await handleMessage({
      type: 'SAVE_SETTINGS',
      settings: { showFilterBar: false },
    });

    expect(reply).toMatchObject({
      type: 'SETTINGS',
      settings: { showFilterBar: false, autoDetect: true },
    });
  });

  it('persists a saved setting for the next GET_SETTINGS', async () => {
    await handleMessage({ type: 'SAVE_SETTINGS', settings: { autoDetect: false } });
    const reply = await handleMessage({ type: 'GET_SETTINGS' });

    expect(reply).toMatchObject({ settings: { autoDetect: false } });
  });

  it('clamps an out-of-range TTL on save', async () => {
    const reply = await handleMessage({
      type: 'SAVE_SETTINGS',
      settings: { cacheTTLDays: 9999 },
    });

    expect(reply).toMatchObject({ settings: { cacheTTLDays: 90 } });
  });
});
