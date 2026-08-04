import { vi } from 'vitest';
import type { ProfessorData } from '@shared/types';

/**
 * Minimal in-memory stand-in for the slice of chrome.storage.local that the
 * extension actually uses. Installed onto globalThis so `src/background/cache`
 * can be imported unchanged under jsdom.
 */
export function installChromeMock(): { store: Record<string, unknown>; reset: () => void } {
  let store: Record<string, unknown> = {};

  const local = {
    get: vi.fn(async (keys?: string | string[] | null) => {
      if (keys === undefined || keys === null) return { ...store };
      const list = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of list) {
        if (k in store) out[k] = store[k];
      }
      return out;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      // Round-trip through JSON so tests catch anything unserializable, which
      // chrome.storage would reject at runtime.
      Object.assign(store, JSON.parse(JSON.stringify(items)) as Record<string, unknown>);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const k of Array.isArray(keys) ? keys : [keys]) delete store[k];
    }),
    clear: vi.fn(async () => {
      store = {};
    }),
  };

  const chromeMock = { storage: { local } };
  vi.stubGlobal('chrome', chromeMock);

  return {
    get store() {
      return store;
    },
    reset() {
      store = {};
      local.get.mockClear();
      local.set.mockClear();
      local.remove.mockClear();
    },
  };
}

let counter = 0;

/** Builds a ProfessorData fixture; override any field via `patch`. */
export function makeProfessor(patch: Partial<ProfessorData> = {}): ProfessorData {
  counter += 1;
  return {
    id: `VGVhY2hlci0${counter}`,
    name: `Prof ${counter}`,
    department: 'Computer Science',
    university: 'University of Arizona',
    overallRating: 4.1,
    difficulty: 2.8,
    wouldTakeAgain: 88,
    numRatings: 12,
    topTags: ['Caring', 'Lecture heavy'],
    rmpUrl: `https://www.ratemyprofessors.com/professor/${counter}`,
    cachedAt: Date.now(),
    ...patch,
  };
}
