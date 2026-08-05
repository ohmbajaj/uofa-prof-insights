import { describe, expect, it } from 'vitest';
import { extractPhrases, summarizeReviews } from '@background/reviews';
import type { ReviewRow } from '@background/reviews';

function row(patch: Partial<ReviewRow> = {}): ReviewRow {
  return {
    comment: null,
    attendanceMandatory: null,
    textbookIsUsed: null,
    grade: null,
    isForOnlineClass: null,
    ...patch,
  };
}

describe('extractPhrases', () => {
  it('surfaces a phrase repeated across reviews', () => {
    const phrases = extractPhrases([
      'Lots of homework but fair grading',
      'There is lots of homework every week',
      'Expect lots of homework in this class',
    ]);

    expect(phrases.map((p) => p.phrase)).toContain('lots of homework');
    expect(phrases.find((p) => p.phrase === 'lots of homework')?.mentions).toBe(3);
  });

  /** One student's turn of phrase is not a theme. */
  it('ignores a phrase said only once or twice', () => {
    const phrases = extractPhrases([
      'His handwriting is unreadable',
      'Something completely different here',
    ]);
    expect(phrases).toEqual([]);
  });

  it('counts a phrase once per review, so one rant cannot manufacture a theme', () => {
    const ranting = 'tough grader tough grader tough grader tough grader';
    expect(extractPhrases([ranting, ranting])).toEqual([]);

    const genuine = extractPhrases([ranting, 'tough grader indeed', 'a tough grader overall']);
    expect(genuine.find((p) => p.phrase === 'tough grader')?.mentions).toBe(3);
  });

  it('drops phrases made only of filler words', () => {
    const phrases = extractPhrases([
      'you have to be in the class',
      'you have to be in the class',
      'you have to be in the class',
    ]);
    expect(phrases.every((p) => p.phrase !== 'have to be')).toBe(true);
  });

  /**
   * One sentence yields many overlapping slices. The list is five long, so it
   * should hold five distinct observations, not five rephrasings of one.
   */
  it('reports a sentence once, keeping the phrase with the most context', () => {
    const phrases = extractPhrases([
      'lots of homework assigned weekly',
      'lots of homework assigned weekly',
      'lots of homework assigned weekly',
    ]);

    expect(phrases.map((p) => p.phrase)).toEqual(['homework assigned weekly']);
  });

  it('keeps genuinely separate observations', () => {
    const phrases = extractPhrases([
      'tough grader but engaging lectures',
      'tough grader with engaging lectures',
      'a tough grader, though engaging lectures',
    ]);

    expect(phrases.length).toBeGreaterThanOrEqual(2);
    expect(phrases.map((p) => p.phrase).join(' ')).toContain('tough grader');
    expect(phrases.map((p) => p.phrase).join(' ')).toContain('engaging lectures');
  });

  it('ignores boilerplate from the rating form', () => {
    const phrases = extractPhrases([
      'rather not say anything else',
      'rather not say anything else',
      'rather not say anything else',
    ]);
    expect(phrases.every((p) => !p.phrase.includes('rather not say'))).toBe(true);
  });

  it('handles empty input', () => {
    expect(extractPhrases([])).toEqual([]);
    expect(extractPhrases(['', '  '])).toEqual([]);
  });
});

describe('summarizeReviews', () => {
  it('reports attendance as a share of those who answered', () => {
    const result = summarizeReviews([
      row({ attendanceMandatory: 'mandatory' }),
      row({ attendanceMandatory: 'mandatory' }),
      row({ attendanceMandatory: 'non mandatory' }),
      row({ attendanceMandatory: '' }), // no answer, excluded
    ]);

    expect(result.attendanceMandatoryPct).toBe(67);
  });

  it('returns null when nobody answered, rather than implying zero', () => {
    const result = summarizeReviews([row(), row()]);

    expect(result.attendanceMandatoryPct).toBeNull();
    expect(result.textbookUsedPct).toBeNull();
    expect(result.onlinePct).toBeNull();
  });

  it('summarizes textbook use and online delivery', () => {
    const result = summarizeReviews([
      row({ textbookIsUsed: true, isForOnlineClass: true }),
      row({ textbookIsUsed: true, isForOnlineClass: false }),
      row({ textbookIsUsed: false, isForOnlineClass: false }),
      row({ textbookIsUsed: false, isForOnlineClass: false }),
    ]);

    expect(result.textbookUsedPct).toBe(50);
    expect(result.onlinePct).toBe(25);
  });

  it('counts only real letter grades', () => {
    const result = summarizeReviews([
      row({ grade: 'A' }),
      row({ grade: 'A' }),
      row({ grade: 'B+' }),
      row({ grade: 'Rather not say' }),
      row({ grade: '' }),
      row({ grade: 'Not sure yet' }),
    ]);

    expect(result.gradesReported).toBe(3);
    expect(result.topGrade).toBe('A');
  });

  it('reports how many reviews the summary rests on', () => {
    const result = summarizeReviews([row(), row(), row()]);
    expect(result.reviewsRead).toBe(3);
  });

  it('carries phrase mention counts through', () => {
    const comment = 'clear grading criteria throughout';
    const result = summarizeReviews([row({ comment }), row({ comment }), row({ comment })]);

    expect(result.phrases.length).toBeGreaterThan(0);
    expect(result.phrases[0]?.mentions).toBe(3);
  });
});
