import type {
  ExtensionSettings,
  ProfessorData,
  RecentProfessor,
  RecentProfessorInput,
  UsageStats,
} from './types';

// Content Script / Popup -> Service Worker
export type OutgoingMessage =
  /** `fuzzy` is for the popup's typed search only; badge lookups must stay strict. */
  | { type: 'LOOKUP_PROFESSOR'; name: string; fuzzy?: boolean }
  | { type: 'GET_CACHE_STATS' }
  | { type: 'CLEAR_CACHE' }
  | { type: 'REFRESH_PROFESSOR'; name: string }
  | { type: 'GET_SETTINGS' }
  | { type: 'SAVE_SETTINGS'; settings: Partial<ExtensionSettings> }
  | { type: 'GET_USAGE' }
  | { type: 'RECORD_VIEW'; data: RecentProfessorInput }
  | { type: 'BADGES_SHOWN'; count: number }
  | { type: 'CLEAR_USAGE' };

// Service Worker -> Content Script / Popup
export type IncomingMessage =
  | { type: 'PROFESSOR_RESULT'; name: string; data: ProfessorData | null }
  | { type: 'CACHE_STATS'; stats: { count: number; oldestAge: number } }
  | { type: 'CACHE_CLEARED' }
  | { type: 'SETTINGS'; settings: ExtensionSettings }
  | { type: 'USAGE'; stats: UsageStats; recents: RecentProfessor[] }
  | { type: 'ERROR'; message: string };

/** e.g. `MessageOfType<IncomingMessage, 'CACHE_CLEARED'>` -> `{ type: 'CACHE_CLEARED' }`. */
export type MessageOfType<M extends { type: string }, T extends M['type']> = M & { type: T };
