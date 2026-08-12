import { describe, expect, it } from 'vitest';
import {
  isProfessorData,
  isRmpProfessorUrl,
  isTrustedRuntimeSender,
  parseOutgoingMessage,
} from '@shared/validation';
import { MAX_PROFESSOR_NAME_LENGTH } from '@shared/constants';
import { makeProfessor } from '../helpers/chrome-mock';

describe('runtime message validation', () => {
  it('accepts and trims a valid lookup', () => {
    expect(parseOutgoingMessage({ type: 'LOOKUP_PROFESSOR', name: '  Mercer, Richard  ' })).toEqual(
      { type: 'LOOKUP_PROFESSOR', name: 'Mercer, Richard' },
    );
  });

  it.each([
    null,
    { type: 'NOPE' },
    { type: 'LOOKUP_PROFESSOR', name: '' },
    { type: 'LOOKUP_PROFESSOR', name: 'Rick\nMercer' },
    { type: 'LOOKUP_PROFESSOR', name: 'x'.repeat(MAX_PROFESSOR_NAME_LENGTH + 1) },
    { type: 'LOOKUP_PROFESSOR', name: 'Rick Mercer', fuzzy: 'yes' },
    { type: 'GET_USAGE', injected: true },
    { type: 'BADGES_SHOWN', count: -1 },
    { type: 'SAVE_SETTINGS', settings: { unknown: true } },
  ])('rejects invalid payload %#', (payload) => {
    expect(parseOutgoingMessage(payload)).toBeNull();
  });

  it('copies only the minimal, safe recent-professor record', () => {
    const professor = makeProfessor();
    const reply = parseOutgoingMessage({
      type: 'RECORD_VIEW',
      data: {
        name: professor.name,
        department: professor.department,
        overallRating: professor.overallRating,
        numRatings: professor.numRatings,
        rmpUrl: professor.rmpUrl,
      },
    });

    expect(reply).toEqual({
      type: 'RECORD_VIEW',
      data: {
        name: professor.name,
        department: professor.department,
        overallRating: professor.overallRating,
        numRatings: professor.numRatings,
        rmpUrl: professor.rmpUrl,
      },
    });
  });

  it('rejects a recent-professor link outside RateMyProfessors', () => {
    const professor = makeProfessor();
    expect(
      parseOutgoingMessage({
        type: 'RECORD_VIEW',
        data: {
          name: professor.name,
          department: professor.department,
          overallRating: professor.overallRating,
          numRatings: professor.numRatings,
          rmpUrl: 'https://attacker.example/phish',
        },
      }),
    ).toBeNull();
  });
});

describe('trusted data validation', () => {
  it('accepts normalized professor data and exact RMP professor URLs', () => {
    const professor = makeProfessor();
    expect(isProfessorData(professor)).toBe(true);
    expect(isRmpProfessorUrl(professor.rmpUrl)).toBe(true);
  });

  it.each([
    'http://www.ratemyprofessors.com/professor/1',
    'https://evil.example/professor/1',
    'https://www.ratemyprofessors.com/professor/1?redirect=evil',
    'javascript:alert(1)',
  ])('rejects unsafe professor URL %s', (url) => {
    expect(isRmpProfessorUrl(url)).toBe(false);
    expect(isProfessorData(makeProfessor({ rmpUrl: url }))).toBe(false);
  });

  it('accepts only messages from the current extension id', () => {
    expect(isTrustedRuntimeSender({ id: 'extension-id' }, 'extension-id')).toBe(true);
    expect(isTrustedRuntimeSender({ id: 'attacker-id' }, 'extension-id')).toBe(false);
    expect(isTrustedRuntimeSender({}, 'extension-id')).toBe(false);
  });
});
