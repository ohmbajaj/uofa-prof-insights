import {
  CACHE_SCHEMA_VERSION,
  CACHE_STORAGE_KEY,
  DEFAULT_SETTINGS as DEFAULTS,
  MAX_CACHE_ENTRIES,
  MAX_CACHE_TTL_DAYS,
  MIN_CACHE_TTL_DAYS,
  SETTINGS_STORAGE_KEY,
} from '@shared/constants';
import type { CacheEntry, ExtensionSettings, ProfessorData } from '@shared/types';
import { isProfessorData, isRecord } from '@shared/validation';

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
  if (!isRecord(value)) return false;
  return Object.entries(value).every(
    ([key, entry]) =>
      isRecord(entry) &&
      entry.key === key &&
      Number.isFinite(entry.expiresAt) &&
      Number.isSafeInteger(entry.version) &&
      isProfessorData(entry.data),
  );
}

/**
 * Drops expired and stale-shaped entries, then trims to MAX_CACHE_ENTRIES by
 * evicting the least-recently-fetched records first.
 *
 * Entries written by an older ProfessorData shape are discarded rather than
 * migrated: they are one cheap refetch away, whereas migration would mean
 * carrying every historical shape forever.
 */
function prune(map: CacheMap, now: number): CacheMap {
  const live = Object.entries(map).filter(
    ([, entry]) => entry.expiresAt > now && entry.version === CACHE_SCHEMA_VERSION,
  );

  if (live.length > MAX_CACHE_ENTRIES) {
    live.sort((a, b) => b[1].data.cachedAt - a[1].data.cachedAt);
    live.length = MAX_CACHE_ENTRIES;
  }

  return Object.fromEntries(live);
}

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
  const raw = stored[SETTINGS_STORAGE_KEY];
  const settings = isRecord(raw) ? raw : {};
  return {
    autoDetect:
      typeof settings.autoDetect === 'boolean' ? settings.autoDetect : DEFAULTS.autoDetect,
    showFilterBar:
      typeof settings.showFilterBar === 'boolean' ? settings.showFilterBar : DEFAULTS.showFilterBar,
    cacheTTLDays: clampTTL(
      typeof settings.cacheTTLDays === 'number' ? settings.cacheTTLDays : DEFAULTS.cacheTTLDays,
    ),
  };
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

  if (entry.expiresAt <= Date.now() || entry.version !== CACHE_SCHEMA_VERSION) {
    delete map[key];
    await writeMap(map);
    return null;
  }

  return entry.data;
}

export async function set(key: string, data: ProfessorData): Promise<void> {
  if (!isProfessorData(data)) throw new Error('Refusing to cache invalid professor data');
  const now = Date.now();
  const { cacheTTLDays } = await getSettings();
  const map = await readMap();

  map[key] = {
    key,
    data,
    expiresAt: now + cacheTTLDays * MS_PER_DAY,
    version: CACHE_SCHEMA_VERSION,
  };
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
