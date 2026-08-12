import {
  MAX_PROFESSOR_NAME_LENGTH,
  MAX_RECENT_PROFESSORS,
  MAX_TAG_LENGTH,
  MAX_TOP_TAGS,
  RMP_PROFESSOR_URL_BASE,
  TAG_SAMPLE_SIZE,
} from './constants';
import type { OutgoingMessage } from './messages';
import type {
  ExtensionSettings,
  ProfessorData,
  RecentProfessor,
  RecentProfessorInput,
} from './types';

type UnknownRecord = Record<string, unknown>;

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const RMP_PROFESSOR_ORIGIN = new URL(RMP_PROFESSOR_URL_BASE).origin;

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: UnknownRecord, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

export function isBoundedString(
  value: unknown,
  maxLength: number,
  allowEmpty = true,
): value is string {
  return (
    typeof value === 'string' &&
    value.length <= maxLength &&
    (allowEmpty || value.trim().length > 0) &&
    !CONTROL_CHARACTERS.test(value)
  );
}

export function parseProfessorName(value: unknown): string | null {
  if (!isBoundedString(value, MAX_PROFESSOR_NAME_LENGTH, false)) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
}

function isNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isNullableNumberInRange(value: unknown, min: number, max: number): boolean {
  return value === null || isNumberInRange(value, min, max);
}

export function isRmpProfessorUrl(value: unknown): value is string {
  if (!isBoundedString(value, 300, false)) return false;
  try {
    const url = new URL(value);
    return (
      url.origin === RMP_PROFESSOR_ORIGIN &&
      /^\/professor\/\d+\/?$/u.test(url.pathname) &&
      url.search === '' &&
      url.hash === ''
    );
  } catch {
    return false;
  }
}

function parseRecentProfessorInput(value: unknown): RecentProfessorInput | null {
  if (!isRecord(value)) return null;
  const name = parseProfessorName(value.name);
  if (
    !hasOnlyKeys(value, ['name', 'department', 'overallRating', 'numRatings', 'rmpUrl']) ||
    !name ||
    !isBoundedString(value.department, 200) ||
    !isNullableNumberInRange(value.overallRating, 1, 5) ||
    !isIntegerInRange(value.numRatings, 0, 10_000_000) ||
    !isRmpProfessorUrl(value.rmpUrl)
  ) {
    return null;
  }

  return {
    name,
    department: value.department,
    overallRating: value.overallRating as number | null,
    numRatings: value.numRatings,
    rmpUrl: value.rmpUrl,
  };
}

export function isRecentProfessor(value: unknown): value is RecentProfessor {
  if (!isRecord(value) || !isIntegerInRange(value.viewedAt, 0, Number.MAX_SAFE_INTEGER)) {
    return false;
  }
  const { viewedAt: _viewedAt, ...input } = value;
  return parseRecentProfessorInput(input) !== null;
}

function isSettingsPatch(value: unknown): value is Partial<ExtensionSettings> {
  if (!isRecord(value) || !hasOnlyKeys(value, ['autoDetect', 'showFilterBar', 'cacheTTLDays'])) {
    return false;
  }
  if ('autoDetect' in value && typeof value.autoDetect !== 'boolean') return false;
  if ('showFilterBar' in value && typeof value.showFilterBar !== 'boolean') return false;
  return !('cacheTTLDays' in value) || isNumberInRange(value.cacheTTLDays, -10_000, 10_000);
}

/** Parses a structured-clone value into the only messages the worker accepts. */
export function parseOutgoingMessage(value: unknown): OutgoingMessage | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;

  switch (value.type) {
    case 'GET_CACHE_STATS':
    case 'CLEAR_CACHE':
    case 'GET_SETTINGS':
    case 'GET_USAGE':
    case 'CLEAR_USAGE':
      return hasOnlyKeys(value, ['type']) ? { type: value.type } : null;

    case 'LOOKUP_PROFESSOR': {
      const name = parseProfessorName(value.name);
      if (
        !name ||
        !hasOnlyKeys(value, ['type', 'name', 'fuzzy']) ||
        ('fuzzy' in value && typeof value.fuzzy !== 'boolean')
      ) {
        return null;
      }
      return {
        type: value.type,
        name,
        ...('fuzzy' in value ? { fuzzy: value.fuzzy as boolean } : {}),
      };
    }

    case 'REFRESH_PROFESSOR': {
      const name = parseProfessorName(value.name);
      return name && hasOnlyKeys(value, ['type', 'name']) ? { type: value.type, name } : null;
    }

    case 'SAVE_SETTINGS':
      return isSettingsPatch(value.settings) && hasOnlyKeys(value, ['type', 'settings'])
        ? { type: value.type, settings: { ...value.settings } }
        : null;

    case 'RECORD_VIEW': {
      const data = parseRecentProfessorInput(value.data);
      return data && hasOnlyKeys(value, ['type', 'data']) ? { type: value.type, data } : null;
    }

    case 'BADGES_SHOWN':
      return isIntegerInRange(value.count, 0, 1_000) && hasOnlyKeys(value, ['type', 'count'])
        ? { type: value.type, count: value.count }
        : null;

    default:
      return null;
  }
}

export function isTrustedRuntimeSender(
  sender: Pick<chrome.runtime.MessageSender, 'id'>,
  runtimeId: string,
): boolean {
  return runtimeId.length > 0 && sender.id === runtimeId;
}

function isAlternateProfile(value: unknown): boolean {
  return (
    isRecord(value) &&
    !!parseProfessorName(value.name) &&
    isNullableNumberInRange(value.overallRating, 1, 5) &&
    isIntegerInRange(value.numRatings, 0, 10_000_000) &&
    isRmpProfessorUrl(value.rmpUrl)
  );
}

function isCourseRating(value: unknown): boolean {
  return (
    isRecord(value) &&
    isBoundedString(value.course, 40, false) &&
    isNullableNumberInRange(value.rating, 1, 5) &&
    isNullableNumberInRange(value.difficulty, 1, 5) &&
    isIntegerInRange(value.numRatings, 0, TAG_SAMPLE_SIZE)
  );
}

function isReviewInsights(value: unknown): boolean {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  return (
    isNullableNumberInRange(value.attendanceMandatoryPct, 0, 100) &&
    isNullableNumberInRange(value.textbookUsedPct, 0, 100) &&
    isNullableNumberInRange(value.onlinePct, 0, 100) &&
    isIntegerInRange(value.gradesReported, 0, TAG_SAMPLE_SIZE) &&
    (value.topGrade === null || isBoundedString(value.topGrade, 40, false)) &&
    Array.isArray(value.phrases) &&
    value.phrases.length <= 20 &&
    value.phrases.every(
      (phrase) =>
        isRecord(phrase) &&
        isBoundedString(phrase.phrase, 200, false) &&
        isIntegerInRange(phrase.mentions, 1, TAG_SAMPLE_SIZE),
    ) &&
    isIntegerInRange(value.reviewsRead, 0, TAG_SAMPLE_SIZE)
  );
}

/** Validates cached normalized data before it is trusted by extension UI. */
export function isProfessorData(value: unknown): value is ProfessorData {
  return (
    isRecord(value) &&
    isBoundedString(value.id, 512, false) &&
    !!parseProfessorName(value.name) &&
    isBoundedString(value.department, 200) &&
    isBoundedString(value.university, 200, false) &&
    isNullableNumberInRange(value.overallRating, 1, 5) &&
    isNullableNumberInRange(value.difficulty, 1, 5) &&
    isNullableNumberInRange(value.wouldTakeAgain, 0, 100) &&
    isIntegerInRange(value.numRatings, 0, 10_000_000) &&
    Array.isArray(value.topTags) &&
    value.topTags.length <= MAX_TOP_TAGS &&
    value.topTags.every((tag) => isBoundedString(tag, MAX_TAG_LENGTH, false)) &&
    isRmpProfessorUrl(value.rmpUrl) &&
    isIntegerInRange(value.cachedAt, 0, Number.MAX_SAFE_INTEGER) &&
    (value.matchConfidence === 'exact' || value.matchConfidence === 'nickname') &&
    Array.isArray(value.alternateProfiles) &&
    value.alternateProfiles.length <= 20 &&
    value.alternateProfiles.every(isAlternateProfile) &&
    Array.isArray(value.courseRatings) &&
    value.courseRatings.length <= TAG_SAMPLE_SIZE &&
    value.courseRatings.every(isCourseRating) &&
    isReviewInsights(value.reviewInsights)
  );
}

/** Defense-in-depth bound for a corrupted local recents array. */
export function sanitizeRecents(value: unknown): RecentProfessor[] {
  return Array.isArray(value)
    ? value.filter(isRecentProfessor).slice(0, MAX_RECENT_PROFESSORS)
    : [];
}
