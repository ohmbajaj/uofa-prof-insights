import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, OutgoingMessage } from '@shared/messages';
import type { ProfessorData } from '@shared/types';

/**
 * End-to-end exercise of the content script against the exact UAccess markup
 * supplied for Phase 1: detect -> inject -> message the service worker ->
 * update the badge.
 *
 * This is the automated stand-in for the manual browser pass in Step 7. It
 * covers everything except real rendering: jsdom applies no layout or CSS, so
 * "the badge doesn't break the results grid" still needs human eyes in Chrome.
 */

const CLASSIC_HTML = `
<table id="CLASS_SRCH_WRK2_STRM$scroll$0">
  <tr>
    <th scope="col" id="CLASS_SRCH_WRK2_STRM_SUBJ_CATALOG_NBR$0">Class</th>
    <th scope="col" id="CLASS_SRCH_WRK2_STRM_CRSE_OFFER_NBR$0">Section</th>
    <th scope="col" id="CLASS_SRCH_WRK2_STRM_CLASS_SECTION$0">Class Nbr</th>
    <th scope="col" id="CLASS_SRCH_WRK2_STRM_SESSION_CODE$0">Session</th>
    <th scope="col" id="CLASS_SRCH_WRK2_STRM_CLASS_START_DT$0">Start/End Date</th>
    <th scope="col" id="CLASS_SRCH_WRK2_STRM_DAY$0">Days &amp; Times</th>
    <th scope="col" id="CLASS_SRCH_WRK2_STRM_LOCATION$0">Room</th>
    <th scope="col" id="CLASS_SRCH_WRK2_STRM_UNITS_RANGE$0">Units</th>
    <th scope="col" id="CLASS_SRCH_WRK2_STRM_INSTRUCTOR$0">Instructor</th>
  </tr>
  <tr id="trCLASS_SRCH_WRK2_STRM$0_row1" valign="center">
    <td align="left">CSC 110</td>
    <td align="left">001</td>
    <td align="right">71613</td>
    <td align="left">Regular Academic Session</td>
    <td align="left" colspan="2">08/21/2023 - 12/06/2023<br>MWF 9:00AM - 9:50AM</td>
    <td align="left">Harvill Bldg, Rm 101</td>
    <td align="right">4.000</td>
    <td align="left" id="MTG_INSTR$0">Mercer, Richard</td>
  </tr>
</table>`;

const NEW_HTML = `
<div id="CSCResult1" class="resultPanel collapsible">
  <div class="courseTitle">
    <div class="courseCode">CSC 110</div>
    <div class="courseName">Principles of Programming with Python</div>
  </div>
  <div class="panel-body">
    <div id="CSCResult1_couReqDesc" class="courseDesc">Description: ...</div>
    <div class="sectionHeading" id="CSCResult1_SECTIONINFO">
      <div class="sectionTitle">Lecture</div>
    </div>
    <div class="sectionDetails">
      <div class="classSection">
        <div class="sectionData">
          <div class="classNbr">71613</div>
          <div class="sectionNbr">001</div>
        </div>
        <div class="meetingData">
          <div class="days">MoWeFr</div>
          <div class="times">9:00AM - 9:50AM</div>
        </div>
        <div class="locationData">
          <div class="room">Harvill Bldg, Rm 101</div>
        </div>
        <div class="classInstructors">
          <div class="instructor">Mercer, Richard</div>
        </div>
      </div>
    </div>
  </div>
</div>`;

function professor(patch: Partial<ProfessorData> = {}): ProfessorData {
  return {
    id: 'VGVhY2hlci0xMjMwMg==',
    name: 'Richard Mercer',
    department: 'Computer Science',
    university: 'University of Arizona',
    overallRating: 2.9,
    difficulty: 2.9,
    wouldTakeAgain: 48.6,
    numRatings: 164,
    topTags: ['Lecture heavy'],
    rmpUrl: 'https://www.ratemyprofessors.com/professor/12302',
    cachedAt: Date.now(),
    ...patch,
  };
}

/** Installs a chrome.runtime whose sendMessage replies via `reply`. */
function installRuntime(reply: (m: OutgoingMessage) => Promise<IncomingMessage | undefined>) {
  const sendMessage = vi.fn(reply);
  vi.stubGlobal('chrome', { runtime: { sendMessage } });
  return sendMessage;
}

/** Loads the content script fresh so its top-level `main()` runs against the current DOM. */
async function loadContentScript(): Promise<void> {
  vi.resetModules();
  const injector = await import('@content/injector');
  injector.resetInjectorState();
  await import('@content/index');
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = () => new Promise((r) => setTimeout(r, 350));

beforeEach(() => {
  document.body.innerHTML = '';
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  // The content script owns its detector for the page's lifetime and exposes no
  // teardown. Swapping in a fresh <body> leaves the previous test's observer
  // watching a detached node, so it can never fire into the next test.
  document.documentElement.replaceChild(document.createElement('body'), document.body);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('content script — classic UAccess', () => {
  it('badges the instructor and resolves it to a rating', async () => {
    document.body.innerHTML = CLASSIC_HTML;
    const send = installRuntime(async (m) => ({
      type: 'PROFESSOR_RESULT',
      name: (m as { name: string }).name,
      data: professor(),
    }));

    await loadContentScript();
    await flush();

    const badge = document.querySelector('#MTG_INSTR\\$0 upi-badge') as HTMLElement & {
      data: unknown;
    };
    expect(badge).not.toBeNull();
    expect(send).toHaveBeenCalledWith({ type: 'LOOKUP_PROFESSOR', name: 'Richard Mercer' });
    expect(badge.shadowRoot?.textContent).toContain('2.9');
    expect(badge.title).toBe('Based on 164 ratings on RMP');
  });

  it('does not badge the Units column despite the colspan', async () => {
    document.body.innerHTML = CLASSIC_HTML;
    installRuntime(async (m) => ({
      type: 'PROFESSOR_RESULT',
      name: (m as { name: string }).name,
      data: null,
    }));

    await loadContentScript();
    await flush();

    expect(document.querySelectorAll('upi-badge')).toHaveLength(1);
    expect(document.querySelector('#MTG_INSTR\\$0 upi-badge')).not.toBeNull();
  });

  it('starts in the loading state before the reply arrives', async () => {
    document.body.innerHTML = CLASSIC_HTML;
    installRuntime(() => new Promise(() => {})); // never resolves

    await loadContentScript();

    const badge = document.querySelector('upi-badge') as HTMLElement & { data: unknown };
    expect(badge.data).toBe('loading');
    expect(badge.shadowRoot?.querySelector('.badge')?.classList.contains('is-loading')).toBe(true);
  });
});

describe('content script — new Student Center', () => {
  it('badges the instructor and resolves it', async () => {
    document.body.innerHTML = NEW_HTML;
    const send = installRuntime(async (m) => ({
      type: 'PROFESSOR_RESULT',
      name: (m as { name: string }).name,
      data: professor(),
    }));

    await loadContentScript();
    await flush();

    const badge = document.querySelector('.instructor upi-badge') as HTMLElement;
    expect(badge).not.toBeNull();
    expect(send).toHaveBeenCalledWith({ type: 'LOOKUP_PROFESSOR', name: 'Richard Mercer' });
    expect(badge.shadowRoot?.textContent).toContain('2.9');
  });

  it('leaves the surrounding course markup untouched', async () => {
    document.body.innerHTML = NEW_HTML;
    installRuntime(async () => ({ type: 'PROFESSOR_RESULT', name: 'x', data: professor() }));

    await loadContentScript();
    await flush();

    expect(document.querySelector('.courseCode')?.textContent).toBe('CSC 110');
    expect(document.querySelector('.classNbr')?.textContent).toBe('71613');
    expect(document.querySelector('.instructor')?.textContent).toContain('Mercer, Richard');
  });
});

describe('content script — re-search', () => {
  it('drops stale badges and badges the new results', async () => {
    document.body.innerHTML = CLASSIC_HTML;
    installRuntime(async (m) => ({
      type: 'PROFESSOR_RESULT',
      name: (m as { name: string }).name,
      data: professor(),
    }));

    await loadContentScript();
    await flush();
    expect(document.querySelectorAll('upi-badge')).toHaveLength(1);

    // PeopleSoft replaces the results wholesale on a new search.
    document.body.innerHTML = NEW_HTML;
    await settle();

    expect(document.querySelectorAll('upi-badge')).toHaveLength(1);
    expect(document.querySelector('.instructor upi-badge')).not.toBeNull();
  });

  it('does not accumulate duplicates when results re-render', async () => {
    document.body.innerHTML = CLASSIC_HTML;
    installRuntime(async (m) => ({
      type: 'PROFESSOR_RESULT',
      name: (m as { name: string }).name,
      data: professor(),
    }));

    await loadContentScript();
    await flush();

    // Same content re-rendered twice, as pagination does.
    document.body.innerHTML = CLASSIC_HTML;
    await settle();
    document.body.innerHTML = CLASSIC_HTML;
    await settle();

    expect(document.querySelectorAll('upi-badge')).toHaveLength(1);
  });
});

describe('content script — error handling', () => {
  it('shows the error state when the service worker returns ERROR', async () => {
    document.body.innerHTML = CLASSIC_HTML;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    installRuntime(async () => ({ type: 'ERROR', message: 'RMP unreachable' }));

    await loadContentScript();
    await flush();

    const badge = document.querySelector('upi-badge') as HTMLElement & { data: unknown };
    expect(badge.data).toBe('error');
    expect(badge.shadowRoot?.textContent).toContain('?');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('shows the error state when sendMessage rejects', async () => {
    document.body.innerHTML = CLASSIC_HTML;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    installRuntime(async () => {
      throw new Error('Extension context invalidated');
    });

    await loadContentScript();
    await flush();

    expect((document.querySelector('upi-badge') as HTMLElement & { data: unknown }).data).toBe(
      'error',
    );
  });

  it('shows the error state when the service worker never replies', async () => {
    document.body.innerHTML = CLASSIC_HTML;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    installRuntime(async () => undefined);

    await loadContentScript();
    await flush();

    expect((document.querySelector('upi-badge') as HTMLElement & { data: unknown }).data).toBe(
      'error',
    );
  });

  it('shows N/A when RMP has no match, without erroring', async () => {
    document.body.innerHTML = CLASSIC_HTML;
    installRuntime(async (m) => ({
      type: 'PROFESSOR_RESULT',
      name: (m as { name: string }).name,
      data: null,
    }));

    await loadContentScript();
    await flush();

    const badge = document.querySelector('upi-badge') as HTMLElement;
    expect(badge.shadowRoot?.textContent).toContain('N/A');
  });

  it('one failed lookup does not stop the others resolving', async () => {
    document.body.innerHTML = `
      <table id="CLASS_SRCH_WRK2_STRM$scroll$0">
        <tr><th id="CLASS_SRCH_WRK2_STRM_INSTRUCTOR$0">Instructor</th></tr>
        <tr><td id="MTG_INSTR$0">Mercer, Richard</td></tr>
        <tr><td id="MTG_INSTR$1">Debray, Saumya</td></tr>
      </table>`;
    vi.spyOn(console, 'error').mockImplementation(() => {});

    installRuntime(async (m) => {
      const { name } = m as { name: string };
      if (name === 'Richard Mercer') throw new Error('boom');
      return { type: 'PROFESSOR_RESULT', name, data: professor({ name }) };
    });

    await loadContentScript();
    await flush();

    const badges = [...document.querySelectorAll('upi-badge')] as (HTMLElement & {
      data: unknown;
    })[];
    expect(badges[0]?.data).toBe('error');
    expect(badges[1]?.data).not.toBe('error');
  });

  it('stays inert on a page with no class results', async () => {
    document.body.innerHTML = '<main><h1>UAccess Student Center</h1></main>';
    const send = installRuntime(async () => undefined);

    await loadContentScript();
    await flush();

    expect(document.querySelectorAll('upi-badge')).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
  });
});
