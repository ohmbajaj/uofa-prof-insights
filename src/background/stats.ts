import { MAX_RECENT_PROFESSORS, RECENTS_STORAGE_KEY, STATS_STORAGE_KEY } from '@shared/constants';
import type { ProfessorData, RecentProfessor, UsageStats } from '@shared/types';

/**
 * Local-only usage counters and recently viewed professors.
 *
 * Everything here stays in chrome.storage.local. These counters let users see
 * what the extension has done without adding remote analytics.
 */
export const EMPTY_STATS: UsageStats = {
  lookups: 0,
  matches: 0,
  misses: 0,
  errors: 0,
  cacheHits: 0,
  badgesShown: 0,
  since: 0,
};

export async function getStats(): Promise<UsageStats> {
  const stored = await chrome.storage.local.get(STATS_STORAGE_KEY);
  const raw = stored[STATS_STORAGE_KEY] as Partial<UsageStats> | undefined;
  return { ...EMPTY_STATS, ...(raw ?? {}) };
}

/**
 * Adds to the running counters.
 *
 * Read-modify-write is safe enough here: the service worker is single
 * threaded, and a lost increment under a burst costs nothing that matters.
 */
export async function bumpStats(delta: Partial<UsageStats>): Promise<UsageStats> {
  const current = await getStats();
  const next: UsageStats = { ...current };

  for (const [key, value] of Object.entries(delta) as [keyof UsageStats, number][]) {
    if (key === 'since') continue;
    next[key] = (current[key] ?? 0) + value;
  }
  if (!next.since) next.since = Date.now();

  await chrome.storage.local.set({ [STATS_STORAGE_KEY]: next });
  return next;
}

export async function clearStats(): Promise<void> {
  await chrome.storage.local.remove(STATS_STORAGE_KEY);
}

export async function getRecents(): Promise<RecentProfessor[]> {
  const stored = await chrome.storage.local.get(RECENTS_STORAGE_KEY);
  const raw = stored[RECENTS_STORAGE_KEY];
  return Array.isArray(raw) ? (raw as RecentProfessor[]) : [];
}

/**
 * Records a professor as recently viewed, most recent first.
 *
 * Stores only what the popup renders. Course and section details are omitted.
 */
export async function recordRecent(data: ProfessorData): Promise<RecentProfessor[]> {
  const entry: RecentProfessor = {
    name: data.name,
    department: data.department,
    overallRating: data.overallRating,
    numRatings: data.numRatings,
    rmpUrl: data.rmpUrl,
    viewedAt: Date.now(),
  };

  const existing = (await getRecents()).filter((r) => r.name !== entry.name);
  const next = [entry, ...existing].slice(0, MAX_RECENT_PROFESSORS);

  await chrome.storage.local.set({ [RECENTS_STORAGE_KEY]: next });
  return next;
}

export async function clearRecents(): Promise<void> {
  await chrome.storage.local.remove(RECENTS_STORAGE_KEY);
}
