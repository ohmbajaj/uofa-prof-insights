// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { searchProfessor } from '@background/rmp-api';

/**
 * Hits the real RateMyProfessors API. Skipped unless Vitest is started in
 * `live` mode, so `npm test` stays offline and deterministic. Run deliberately:
 *
 *   npm run test:live
 *
 * Worth re-running whenever RMP ships a schema change — this is the suite that
 * catches "the extension silently returns nothing" in the wild.
 */
const live = import.meta.env.MODE === 'live';

describe.skipIf(!live)('rmp-api (live)', () => {
  it('finds a known UofA professor', async () => {
    const prof = await searchProfessor('Rick Mercer');

    expect(prof).not.toBeNull();
    expect(prof?.name).toBe('Rick Mercer');
    expect(prof?.university).toBe('University of Arizona');
    expect(prof?.department).toBe('Computer Science');
    expect(prof?.numRatings).toBeGreaterThan(50);
    expect(prof?.overallRating).toBeGreaterThan(0);
    expect(prof?.rmpUrl).toMatch(/^https:\/\/www\.ratemyprofessors\.com\/professor\/\d+$/);
    expect(prof?.topTags.length).toBeGreaterThan(0);

    console.log('[live] resolved:', JSON.stringify(prof, null, 2));
  }, 30_000);

  it('finds a second known UofA professor', async () => {
    const prof = await searchProfessor('Saumya Debray');
    expect(prof?.name).toBe('Saumya Debray');
    expect(prof?.university).toBe('University of Arizona');
  }, 30_000);

  it('returns null for a name that does not exist', async () => {
    await expect(searchProfessor('Zzzznotarealprof Xyzzy')).resolves.toBeNull();
  }, 30_000);

  it('does not leak a UCLA professor through the school filter', async () => {
    // "Rick Miller" is the UCLA hit that the wrong school id (School-1075)
    // used to return. Scoped to UofA he must not appear.
    const prof = await searchProfessor('Rick Miller');
    expect(prof?.university ?? 'University of Arizona').toBe('University of Arizona');
  }, 30_000);

  /**
   * The duplicate-profile case, against production data.
   *
   * UAccess lists this instructor as "Mercer, Richard". RMP carries two UofA
   * Computer Science profiles: "Richard Mercer" with a single 1.0 review, and
   * "Rick Mercer" with 160+ reviews averaging ~2.9. Exact-name matching picked
   * the one-review profile and reported 1.0.
   */
  it('resolves the UAccess roster name to the well-evidenced profile', async () => {
    const prof = await searchProfessor('Richard Mercer');

    expect(prof).not.toBeNull();
    expect(prof?.numRatings).toBeGreaterThan(50);
    expect(prof?.matchConfidence).toBe('nickname');
    expect(prof?.alternateProfiles.length).toBeGreaterThan(0);

    console.log(
      '[live] "Richard Mercer" ->',
      `${prof?.name} (${prof?.overallRating}, ${prof?.numRatings} ratings)`,
      '| alternates:',
      prof?.alternateProfiles.map((a) => `${a.name} (${a.numRatings})`).join(', '),
    );
  }, 30_000);

  /**
   * A hand-typed query should survive a truncated or misspelled surname.
   * Badge lookups stay strict; only the popup's search box passes `fuzzy`.
   */
  it('tolerates a typo in a hand-typed search', async () => {
    const exact = await searchProfessor('Ratchaneekorn Thamvichai');
    expect(exact?.name).toBe('Ratchaneekorn Thamvichai');

    // Two letters dropped from the surname.
    const truncated = await searchProfessor('Ratchaneekorn Thamvich', { fuzzy: true });
    expect(truncated?.name).toBe('Ratchaneekorn Thamvichai');

    // A transposed letter.
    const typo = await searchProfessor('Ratchaneekorn Thmavichai', { fuzzy: true });
    expect(typo?.name).toBe('Ratchaneekorn Thamvichai');

    console.log('[live] fuzzy:', `truncated -> ${truncated?.name}, typo -> ${typo?.name}`);
  }, 45_000);

  it('does not guess when fuzzy matching is off', async () => {
    // The strict path must never resolve a misspelling.
    await expect(searchProfessor('Ratchaneekorn Thamvich')).resolves.toBeNull();
  }, 30_000);

  it('derives per-course ratings from real review data', async () => {
    const prof = await searchProfessor('Rick Mercer');

    expect(prof?.courseRatings.length).toBeGreaterThan(0);
    for (const course of prof?.courseRatings ?? []) {
      expect(course.course).toMatch(/^[A-Z]{2,5}\d{2,4}[A-Z]?$/);
      expect(course.numRatings).toBeGreaterThanOrEqual(3);
    }

    console.log(
      '[live] course breakdown:',
      prof?.courseRatings.map((c) => `${c.course}: ${c.rating} (${c.numRatings})`).join(', '),
    );
  }, 30_000);
});
