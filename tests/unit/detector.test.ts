import { describe, it } from 'vitest';

// TODO(Phase 1): drive these off saved UAccess HTML fixtures once selectors are
// captured from a logged-in session.
describe('detector', () => {
  it.todo('finds instructor names in a class search results table');
  it.todo('ignores "Staff" and "To be Announced" placeholders');
  it.todo('re-detects when PeopleSoft re-renders the results list');
  it.todo('does not double-detect an already-badged cell');
});
