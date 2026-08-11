import type { IncomingMessage, OutgoingMessage } from '@shared/messages';
import type { ProfessorData } from '@shared/types';
import { normalizeCacheKey, normalizeNameForRMP } from '@shared/utils';
import * as cache from './cache';
import * as stats from './stats';
import { searchProfessor } from './rmp-api';

/**
 * De-duplicates concurrent lookups for the same professor. A results grid with
 * eight sections taught by the same instructor should cost one network call,
 * not eight.
 */
const inFlight = new Map<string, Promise<ProfessorData | null>>();

/**
 * Cache-first lookup for a single UAccess-formatted instructor name.
 * Returns null for both a missing professor and a failed fetch.
 */
export async function lookup(
  rawName: string,
  forceRefresh = false,
  fuzzy = false,
): Promise<ProfessorData | null> {
  const name = normalizeNameForRMP(rawName);
  const key = normalizeCacheKey(name);

  if (forceRefresh) {
    await cache.remove(key);
  } else {
    const cached = await cache.get(key);
    if (cached) {
      void stats.bumpStats({ lookups: 1, cacheHits: 1, matches: 1 });
      return cached;
    }

    const pending = inFlight.get(key);
    if (pending) return pending;
  }

  const request = (async () => {
    try {
      const data = await searchProfessor(name, { fuzzy });
      if (data) await cache.set(key, data);
      void stats.bumpStats({ lookups: 1, ...(data ? { matches: 1 } : { misses: 1 }) });
      return data;
    } catch (error) {
      void stats.bumpStats({ lookups: 1, errors: 1 });
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
          data: await lookup(message.name, false, message.fuzzy ?? false),
        };

      case 'REFRESH_PROFESSOR':
        return {
          type: 'PROFESSOR_RESULT',
          name: message.name,
          data: await lookup(message.name, true),
        };

      case 'GET_CACHE_STATS':
        return { type: 'CACHE_STATS', stats: await cache.getStats() };

      case 'GET_SETTINGS':
        return { type: 'SETTINGS', settings: await cache.getSettings() };

      case 'SAVE_SETTINGS':
        return { type: 'SETTINGS', settings: await cache.saveSettings(message.settings) };

      case 'CLEAR_CACHE':
        await cache.clear();
        inFlight.clear();
        return { type: 'CACHE_CLEARED' };

      case 'GET_USAGE':
        return {
          type: 'USAGE',
          stats: await stats.getStats(),
          recents: await stats.getRecents(),
        };

      case 'RECORD_VIEW': {
        const recents = await stats.recordRecent(message.data);
        return { type: 'USAGE', stats: await stats.getStats(), recents };
      }

      case 'BADGES_SHOWN':
        await stats.bumpStats({ badgesShown: message.count });
        return { type: 'USAGE', stats: await stats.getStats(), recents: await stats.getRecents() };

      case 'CLEAR_USAGE':
        await stats.clearStats();
        await stats.clearRecents();
        return { type: 'USAGE', stats: stats.EMPTY_STATS, recents: [] };

      default: {
        const exhaustive: never = message;
        return { type: 'ERROR', message: `Unhandled message: ${JSON.stringify(exhaustive)}` };
      }
    }
  } catch (error) {
    return { type: 'ERROR', message: error instanceof Error ? error.message : String(error) };
  }
}
