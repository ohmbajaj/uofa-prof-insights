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
});
