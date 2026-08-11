import { MAX_REVIEW_PHRASES, MIN_PHRASE_MENTIONS } from '@shared/constants';
import type { ReviewInsights } from '@shared/types';

/**
 * Derives practical course facts and recurring phrases from review text.
 *
 * Everything here comes from rows already downloaded for the tag tally, so it
 * costs no extra request. Two deliberate limits:
 *
 * - No sentiment scoring. Judging tone reliably needs a model we do not have,
 *   and a confidently mislabelled "positive" review is worse than none. RMP's
 *   own tags already carry the evaluative summary; this adds what the tags
 *   cannot: how often something is actually said.
 * - Phrases are reported with their mention counts, so a phrase said twice
 *   never reads like a consensus.
 */

/** Words carrying no signal when they appear in a phrase. */
const STOPWORDS = new Set(
  `a about after all also am an and any are as at be because been before being but by can cant
   could did do does doing dont down during each even every for from get got had has have having
   he her here hers him his how i if in into is it its just me might more most much must my no
   nor not of off on once only or other our out over own really same she should so some such than
   that the their them then there these they this those through to too very was we were what when
   where which while who whom why will with would you your youre`
    .split(/\s+/)
    .filter(Boolean),
);

/** Phrases that describe the rating process rather than the professor. */
const NOISE_PHRASES = [/rather not say/i, /would take again/i, /rate my professor/i];

function words(comment: string): string[] {
  return comment
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Two- and three-word phrases that recur across reviews.
 *
 * A phrase must be mentioned by at least MIN_PHRASE_MENTIONS separate reviews;
 * one student's turn of phrase is not a theme. Phrases made entirely of
 * stopwords are dropped, and a longer phrase suppresses the shorter one it
 * contains so "lots of homework" does not appear beside "of homework".
 */
export function extractPhrases(comments: string[]): { phrase: string; mentions: number }[] {
  const counts = new Map<string, number>();

  for (const comment of comments) {
    const tokens = words(comment ?? '');
    // Count each phrase once per review, so one rant cannot manufacture a theme.
    const seenHere = new Set<string>();

    for (let size = 3; size >= 2; size--) {
      for (let i = 0; i + size <= tokens.length; i++) {
        const slice = tokens.slice(i, i + size);
        if (slice.every((w) => STOPWORDS.has(w))) continue;
        // Require the phrase to start and end on a meaningful word.
        if (STOPWORDS.has(slice[0]!) || STOPWORDS.has(slice[slice.length - 1]!)) continue;

        const phrase = slice.join(' ');
        if (phrase.length < 8) continue;
        if (NOISE_PHRASES.some((re) => re.test(phrase))) continue;
        if (seenHere.has(phrase)) continue;

        seenHere.add(phrase);
        counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
      }
    }
  }

  const ranked = [...counts.entries()]
    .filter(([, n]) => n >= MIN_PHRASE_MENTIONS)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);

  /*
   * Keep one phrase per topic.
   *
   * A single sentence yields many overlapping slices. "Lots of homework
   * assigned weekly" produces both "lots of homework" and "homework assigned
   * weekly", which contain neither each other nor a shared word pair, yet say
   * the same thing. Claiming a phrase's content words prevents that: the list
   * is only five long, so five distinct observations beat five rephrasings of
   * one. The longest phrase wins, since it carries the most context.
   */
  const kept: { phrase: string; mentions: number }[] = [];
  const claimed = new Set<string>();

  for (const [phrase, mentions] of ranked) {
    const content = phrase.split(' ').filter((w) => !STOPWORDS.has(w));
    if (content.some((w) => claimed.has(w))) continue;

    kept.push({ phrase, mentions });
    for (const w of content) claimed.add(w);
    if (kept.length >= MAX_REVIEW_PHRASES) break;
  }

  return kept;
}

/** Share of rows answering `yes`, or null when nobody answered. */
function share(values: (boolean | null)[]): number | null {
  const answered = values.filter((v): v is boolean => typeof v === 'boolean');
  if (answered.length === 0) return null;
  return Math.round((answered.filter(Boolean).length / answered.length) * 100);
}

export interface ReviewRow {
  comment: string | null;
  attendanceMandatory: string | null;
  textbookIsUsed: boolean | null;
  grade: string | null;
  isForOnlineClass: boolean | null;
}

export function summarizeReviews(rows: ReviewRow[]): ReviewInsights {
  const attendance = rows.map((r) => {
    const value = (r.attendanceMandatory ?? '').trim().toLowerCase();
    if (value === 'mandatory') return true;
    if (value === 'non mandatory') return false;
    return null;
  });

  // "Rather not say" and blanks are not grades.
  const grades = rows.map((r) => (r.grade ?? '').trim()).filter((g) => /^[A-F][+-]?$/.test(g));

  return {
    attendanceMandatoryPct: share(attendance),
    textbookUsedPct: share(rows.map((r) => r.textbookIsUsed)),
    onlinePct: share(rows.map((r) => r.isForOnlineClass)),
    gradesReported: grades.length,
    topGrade: mostCommon(grades),
    phrases: extractPhrases(rows.map((r) => r.comment ?? '').filter(Boolean)),
    reviewsRead: rows.length,
  };
}

function mostCommon(values: string[]): string | null {
  if (values.length === 0) return null;
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);

  return (
    [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null
  );
}
