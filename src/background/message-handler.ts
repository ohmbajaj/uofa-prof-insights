import { MAX_CONCURRENT_REQUESTS } from '@shared/constants';
import type { IncomingMessage, OutgoingMessage } from '@shared/messages';
import type { ProfessorData } from '@shared/types';
import { normalizeCacheKey, normalizeNameForRMP } from '@shared/utils';
import * as cache from './cache';
import { searchProfessor } from './rmp-api';

/**
 * De-duplicates concurrent lookups for the same professor. A results grid with
 * eight sections taught by the same instructor should cost one network call,
 * not eight.
 */
const inFlight = new Map<string, Promise<ProfessorData | null>>();

/** Runs `worker` over `items`, never exceeding `limit` in parallel. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index] as T);
    }
  });

  await Promise.all(runners);
  return results;
}

/**
 * Cache-first lookup for a single UAccess-formatted instructor name.
 * Returns null both for "no such professor" and for a failed fetch — callers
 * that need to tell those apart should use the thrown-error path in rmp-api.
 */
export async function lookup(rawName: string, forceRefresh = false): Promise<ProfessorData | null> {
  const name = normalizeNameForRMP(rawName);
  const key = normalizeCacheKey(name);

  if (forceRefresh) {
    await cache.remove(key);
  } else {
    const cached = await cache.get(key);
    if (cached) return cached;

    const pending = inFlight.get(key);
    if (pending) return pending;
  }

  const request = (async () => {
    try {
      const data = await searchProfessor(name);
      if (data) await cache.set(key, data);
      return data;
    } catch (error) {
      console.warn(`[UPI] lookup failed for "${name}":`, error);
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, request);
  return request;
}

export async function handleMessage(message: OutgoingMessage): Promise<IncomingMessage> {
  try {
    switch (message.type) {
      case 'LOOKUP_PROFESSOR':
        return {
          type: 'PROFESSOR_RESULT',
          name: message.name,
          data: await lookup(message.name),
        };

      case 'REFRESH_PROFESSOR':
        return {
          type: 'PROFESSOR_RESULT',
          name: message.name,
          data: await lookup(message.name, true),
        };

      case 'LOOKUP_BATCH': {
        const unique = [...new Set(message.names)];
        const data = await mapWithConcurrency(unique, MAX_CONCURRENT_REQUESTS, (n) => lookup(n));

        const results: Record<string, ProfessorData | null> = {};
        unique.forEach((name, i) => {
          results[name] = data[i] ?? null;
        });
        return { type: 'BATCH_RESULTS', results };
      }

      case 'GET_CACHE_STATS':
        return { type: 'CACHE_STATS', stats: await cache.getStats() };

      case 'CLEAR_CACHE':
        await cache.clear();
        inFlight.clear();
        return { type: 'CACHE_CLEARED' };

      default: {
        const exhaustive: never = message;
        return { type: 'ERROR', message: `Unhandled message: ${JSON.stringify(exhaustive)}` };
      }
    }
  } catch (error) {
    return { type: 'ERROR', message: error instanceof Error ? error.message : String(error) };
  }
}
