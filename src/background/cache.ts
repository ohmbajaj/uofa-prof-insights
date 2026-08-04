import {
  CACHE_STORAGE_KEY,
  DEFAULT_SETTINGS as DEFAULTS,
  MAX_CACHE_ENTRIES,
  MAX_CACHE_TTL_DAYS,
  MIN_CACHE_TTL_DAYS,
  SETTINGS_STORAGE_KEY,
} from '@shared/constants';
import type { CacheEntry, ExtensionSettings, ProfessorData } from '@shared/types';

/**
 * Professor cache, persisted as a single object under CACHE_STORAGE_KEY in
 * chrome.storage.local.
 *
 * One blob rather than one storage key per professor: the whole cache is a few
 * hundred small records, and a single read/write keeps eviction atomic. If this
 * ever outgrows chrome.storage.local's quota, sharding by first letter is the
 * natural next step.
 */
type CacheMap = Record<string, CacheEntry>;

const MS_PER_DAY = 86_400_000;

export const DEFAULT_SETTINGS: ExtensionSettings = { ...DEFAULTS };

/** Keeps a hand-edited or out-of-range TTL from disabling or ossifying the cache. */
function clampTTL(days: number): number {
  if (!Number.isFinite(days)) return DEFAULTS.cacheTTLDays;
  return Math.min(MAX_CACHE_TTL_DAYS, Math.max(MIN_CACHE_TTL_DAYS, Math.round(days)));
}

async function readMap(): Promise<CacheMap> {
  const stored = await chrome.storage.local.get(CACHE_STORAGE_KEY);
  const raw = stored[CACHE_STORAGE_KEY];
  return isCacheMap(raw) ? raw : {};
}

async function writeMap(map: CacheMap): Promise<void> {
  await chrome.storage.local.set({ [CACHE_STORAGE_KEY]: map });
}

function isCacheMap(value: unknown): value is CacheMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Drops expired entries, then trims to MAX_CACHE_ENTRIES by evicting the
 * least-recently-fetched records first.
 */
function prune(map: CacheMap, now: number): CacheMap {
  const live = Object.entries(map).filter(([, entry]) => entry.expiresAt > now);

  if (live.length > MAX_CACHE_ENTRIES) {
    live.sort((a, b) => b[1].data.cachedAt - a[1].data.cachedAt);
    live.length = MAX_CACHE_ENTRIES;
  }

  return Object.fromEntries(live);
}

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
  const raw = stored[SETTINGS_STORAGE_KEY] as Partial<ExtensionSettings> | undefined;
  const merged = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
  return { ...merged, cacheTTLDays: clampTTL(merged.cacheTTLDays) };
}

export async function saveSettings(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const next = { ...(await getSettings()), ...patch };
  next.cacheTTLDays = clampTTL(next.cacheTTLDays);
  await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: next });
  return next;
}

/** Returns the cached record, or null when missing or expired. */
export async function get(key: string): Promise<ProfessorData | null> {
  const map = await readMap();
  const entry = map[key];
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    delete map[key];
    await writeMap(map);
    return null;
  }

  return entry.data;
}

export async function set(key: string, data: ProfessorData): Promise<void> {
  const now = Date.now();
  const { cacheTTLDays } = await getSettings();
  const map = await readMap();

  map[key] = { key, data, expiresAt: now + cacheTTLDays * MS_PER_DAY };
  await writeMap(prune(map, now));
}

export async function remove(key: string): Promise<void> {
  const map = await readMap();
  if (!(key in map)) return;
  delete map[key];
  await writeMap(map);
}

export async function getStats(): Promise<{ count: number; oldestAge: number }> {
  const now = Date.now();
  const entries = Object.values(prune(await readMap(), now));
  if (entries.length === 0) return { count: 0, oldestAge: 0 };

  const oldest = Math.min(...entries.map((e) => e.data.cachedAt));
  return { count: entries.length, oldestAge: now - oldest };
}

export async function clear(): Promise<void> {
  await chrome.storage.local.remove(CACHE_STORAGE_KEY);
}

export async function readAll(): Promise<CacheEntry[]> {
  return Object.values(prune(await readMap(), Date.now()));
}
