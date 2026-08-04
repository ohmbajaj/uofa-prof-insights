import type { ExtensionSettings, ProfessorData } from './types';

// Content Script / Popup -> Service Worker
export type OutgoingMessage =
  | { type: 'LOOKUP_PROFESSOR'; name: string }
  | { type: 'LOOKUP_BATCH'; names: string[] }
  | { type: 'GET_CACHE_STATS' }
  | { type: 'CLEAR_CACHE' }
  | { type: 'REFRESH_PROFESSOR'; name: string }
  | { type: 'GET_SETTINGS' }
  | { type: 'SAVE_SETTINGS'; settings: Partial<ExtensionSettings> };

// Service Worker -> Content Script / Popup
export type IncomingMessage =
  | { type: 'PROFESSOR_RESULT'; name: string; data: ProfessorData | null }
  | { type: 'BATCH_RESULTS'; results: Record<string, ProfessorData | null> }
  | { type: 'CACHE_STATS'; stats: { count: number; oldestAge: number } }
  | { type: 'CACHE_CLEARED' }
  | { type: 'SETTINGS'; settings: ExtensionSettings }
  | { type: 'ERROR'; message: string };

/** Narrowing helpers so handlers can switch exhaustively on `type`. */
export type OutgoingMessageType = OutgoingMessage['type'];
export type IncomingMessageType = IncomingMessage['type'];

/** e.g. `MessageOfType<OutgoingMessage, 'LOOKUP_BATCH'>` -> `{ type: ...; names: string[] }`. */
export type MessageOfType<M extends { type: string }, T extends M['type']> = M & { type: T };
