import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, OutgoingMessage } from '@shared/messages';
import type { ExtensionSettings, ProfessorData } from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/constants';
import type { UPIBadge } from '@content/components/Badge';

const EMPTY_USAGE = {
  lookups: 0,
  matches: 0,
  misses: 0,
  errors: 0,
  cacheHits: 0,
  badgesShown: 0,
  since: 0,
};

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
    matchConfidence: 'exact',
    alternateProfiles: [],
    courseRatings: [],
    reviewInsights: null,
    ...patch,
  };
}

/**
 * Installs a chrome.runtime whose sendMessage replies via `reply`.
 * GET_SETTINGS is answered with defaults unless `reply` handles it.
 */
function installRuntime(
  reply: (m: OutgoingMessage) => Promise<IncomingMessage | undefined>,
  settings: Partial<ExtensionSettings> = {},
) {
  const sendMessage = vi.fn(async (message: OutgoingMessage) => {
    if (message.type === 'GET_SETTINGS') {
      return { type: 'SETTINGS', settings: { ...DEFAULT_SETTINGS, ...settings } };
    }
    // Local-only bookkeeping; answered generically so tests can focus on lookups.
    if (
      message.type === 'BADGES_SHOWN' ||
      message.type === 'RECORD_VIEW' ||
      message.type === 'GET_USAGE' ||
      message.type === 'CLEAR_USAGE'
    ) {
      return { type: 'USAGE', stats: EMPTY_USAGE, recents: [] };
    }
    return reply(message);
  });
  vi.stubGlobal('chrome', {
    runtime: { sendMessage, onMessage: { addListener: vi.fn() } },
  });
  return sendMessage;
}

/** Loads the content script fresh so its top-level `main()` runs against the current DOM. */
/**
 * The Badge module the content script under test is actually using.
 *
 * `vi.resetModules()` hands the freshly imported content script a new module
 * graph, so the badge registry it populates is not the one a static import in
 * this file would see. Capturing the instance keeps lookups pointed at the
 * right registry.
 */
let badgeModule: typeof import('@content/components/Badge');

async function loadContentScript(): Promise<void> {
  vi.resetModules();
  const injector = await import('@content/injector');
  injector.resetInjectorState();
  const cards = await import('@content/card-controller');
  cards.resetCardState();
  const sidebar = await import('@content/sidebar-controller');
  sidebar.resetSidebarState();
  badgeModule = await import('@content/components/Badge');
  await import('@content/index');
  // main() is async now (it loads settings first).
  await flush();
}

/**
 * The badge wrapper for a host element.
 *
 * Badges are plain elements with a shadow root, not custom elements, so state
 * such as `data` lives on the wrapper rather than on the node itself.
 */
function badgeAt(selector = 'upi-badge'): UPIBadge {
  const found = badgeModule.badgeFromElement(document.querySelector(selector));
  if (!found) throw new Error(`no badge for selector ${selector}`);
  return found;
}

/** Every badge on the page, as wrappers. */
function allBadges(): UPIBadge[] {
  return badgeModule.badgesIn(document);
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

    const badge = badgeAt('#MTG_INSTR\\$0 upi-badge');
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

    const badge = badgeAt();
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

    const badge = badgeAt('.instructor upi-badge');
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

    const badge = badgeAt();
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

    expect(badgeAt().data).toBe('error');
  });

  it('shows the error state when the service worker never replies', async () => {
    document.body.innerHTML = CLASSIC_HTML;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    installRuntime(async () => undefined);

    await loadContentScript();
    await flush();

    expect(badgeAt().data).toBe('error');
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

    const badge = badgeAt();
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

    const badges = allBadges();
    expect(badges[0]?.data).toBe('error');
    expect(badges[1]?.data).not.toBe('error');
  });

  it('stays inert on a page with no class results', async () => {
    document.body.innerHTML = '<main><h1>UAccess Student Center</h1></main>';
    const send = installRuntime(async () => undefined);

    await loadContentScript();
    await flush();

    expect(document.querySelectorAll('upi-badge')).toHaveLength(0);
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'LOOKUP_PROFESSOR' }));
  });

  it('falls back to defaults when settings cannot be loaded', async () => {
    document.body.innerHTML = CLASSIC_HTML;
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const sendMessage = vi.fn(async (message: OutgoingMessage) => {
      if (message.type === 'GET_SETTINGS') throw new Error('worker asleep');
      return { type: 'PROFESSOR_RESULT', name: 'x', data: professor() };
    });
    vi.stubGlobal('chrome', {
      runtime: { sendMessage, onMessage: { addListener: vi.fn() } },
    });

    await loadContentScript();
    await flush();

    // autoDetect defaults to true, so badging still happens.
    expect(document.querySelectorAll('upi-badge')).toHaveLength(1);
  });
});

describe('content script — settings', () => {
  it('does not touch the page when autoDetect is off', async () => {
    document.body.innerHTML = CLASSIC_HTML;
    const send = installRuntime(
      async (m) => ({
        type: 'PROFESSOR_RESULT',
        name: (m as { name: string }).name,
        data: professor(),
      }),
      { autoDetect: false },
    );

    await loadContentScript();
    await flush();

    expect(document.querySelectorAll('upi-badge')).toHaveLength(0);
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'LOOKUP_PROFESSOR' }));
  });

  it('shows the comparison sidebar for two or more instructors', async () => {
    document.body.innerHTML = `
      <table id="CLASS_SRCH_WRK2_STRM$scroll$0">
        <tr><th id="CLASS_SRCH_WRK2_STRM_INSTRUCTOR$0">Instructor</th></tr>
        <tr><td id="MTG_INSTR$0">Mercer, Richard</td></tr>
        <tr><td id="MTG_INSTR$1">Debray, Saumya</td></tr>
      </table>`;
    installRuntime(async (m) => {
      const { name } = m as { name: string };
      return { type: 'PROFESSOR_RESULT', name, data: professor({ name }) };
    });

    await loadContentScript();
    await flush();

    expect(document.querySelectorAll('upi-sidebar')).toHaveLength(1);
  });

  it('hides the sidebar for a single instructor', async () => {
    document.body.innerHTML = CLASSIC_HTML;
    installRuntime(async (m) => ({
      type: 'PROFESSOR_RESULT',
      name: (m as { name: string }).name,
      data: professor(),
    }));

    await loadContentScript();
    await flush();

    expect(document.querySelectorAll('upi-sidebar')).toHaveLength(0);
  });

  it('hides the sidebar when showComparison is off', async () => {
    document.body.innerHTML = `
      <table id="CLASS_SRCH_WRK2_STRM$scroll$0">
        <tr><th id="CLASS_SRCH_WRK2_STRM_INSTRUCTOR$0">Instructor</th></tr>
        <tr><td id="MTG_INSTR$0">Mercer, Richard</td></tr>
        <tr><td id="MTG_INSTR$1">Debray, Saumya</td></tr>
      </table>`;
    installRuntime(
      async (m) => {
        const { name } = m as { name: string };
        return { type: 'PROFESSOR_RESULT', name, data: professor({ name }) };
      },
      { showComparison: false },
    );

    await loadContentScript();
    await flush();

    expect(document.querySelectorAll('upi-sidebar')).toHaveLength(0);
  });
});

describe('content script — retry and refresh', () => {
  it('refetches when an errored badge is clicked', async () => {
    document.body.innerHTML = CLASSIC_HTML;
    vi.spyOn(console, 'error').mockImplementation(() => {});

    let attempt = 0;
    const send = installRuntime(async (m) => {
      attempt += 1;
      if (attempt === 1) return { type: 'ERROR', message: 'network down' };
      return {
        type: 'PROFESSOR_RESULT',
        name: (m as { name: string }).name,
        data: professor(),
      };
    });

    await loadContentScript();
    await flush();

    const badge = badgeAt();
    expect(badge.data).toBe('error');

    badge.click();
    await flush();

    expect(badge.data).not.toBe('error');
    expect(badge.shadowRoot?.textContent).toContain('2.9');
    // The retry must bypass the cache, since failures are never cached.
    expect(send).toHaveBeenCalledWith({
      type: 'REFRESH_PROFESSOR',
      name: 'Richard Mercer',
    });
  });

  it('shows the loading state while retrying', async () => {
    document.body.innerHTML = CLASSIC_HTML;
    vi.spyOn(console, 'error').mockImplementation(() => {});

    let attempt = 0;
    installRuntime(async () => {
      attempt += 1;
      if (attempt === 1) return { type: 'ERROR', message: 'down' };
      return new Promise(() => {}) as never; // second call never resolves
    });

    await loadContentScript();
    await flush();

    const badge = badgeAt();
    badge.click();

    expect(badge.data).toBe('loading');
  });

  it('stays in the error state when the retry also fails', async () => {
    document.body.innerHTML = CLASSIC_HTML;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    installRuntime(async () => ({ type: 'ERROR', message: 'still down' }));

    await loadContentScript();
    await flush();

    const badge = badgeAt();
    badge.click();
    await flush();

    expect(badge.data).toBe('error');
  });

  it('does not retry a badge that resolved successfully', async () => {
    document.body.innerHTML = CLASSIC_HTML;
    const send = installRuntime(async (m) => ({
      type: 'PROFESSOR_RESULT',
      name: (m as { name: string }).name,
      data: professor(),
    }));

    await loadContentScript();
    await flush();
    send.mockClear();

    badgeAt().click();
    await flush();

    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'REFRESH_PROFESSOR' }));
  });

  it('refreshes from the card footer and updates both card and badge', async () => {
    document.body.innerHTML = CLASSIC_HTML;
    let call = 0;
    const send = installRuntime(async (m) => {
      call += 1;
      return {
        type: 'PROFESSOR_RESULT',
        name: (m as { name: string }).name,
        data: professor({ overallRating: call === 1 ? 2.9 : 4.4, numRatings: 200 }),
      };
    });

    await loadContentScript();
    await flush();

    const badge = badgeAt();
    badge.click();
    const card = document.querySelector('upi-card') as HTMLElement;
    expect(card.shadowRoot?.textContent).toContain('2.9');

    (card.shadowRoot?.querySelector('.refresh') as HTMLButtonElement).click();
    await flush();

    expect(send).toHaveBeenCalledWith({ type: 'REFRESH_PROFESSOR', name: 'Richard Mercer' });
    expect(card.shadowRoot?.textContent).toContain('4.4');
    expect(badge.shadowRoot?.textContent).toContain('4.4');
  });

  it('closes the card when a refresh finds no match', async () => {
    document.body.innerHTML = CLASSIC_HTML;
    let call = 0;
    installRuntime(async (m) => {
      call += 1;
      return {
        type: 'PROFESSOR_RESULT',
        name: (m as { name: string }).name,
        data: call === 1 ? professor() : null,
      };
    });

    await loadContentScript();
    await flush();

    badgeAt().click();
    const card = document.querySelector('upi-card') as HTMLElement;
    (card.shadowRoot?.querySelector('.refresh') as HTMLButtonElement).click();
    await flush();

    expect(document.querySelectorAll('upi-card')).toHaveLength(0);
  });

  it('does not fire two retries after a repeat injection', async () => {
    document.body.innerHTML = CLASSIC_HTML;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const send = installRuntime(async () => ({ type: 'ERROR', message: 'down' }));

    await loadContentScript();
    await flush();
    // Chrome re-injecting the content script into the same page. Each load gets
    // its own module graph, so badges from the first are strangers to the
    // second — click one the current instance actually owns.
    await loadContentScript();
    await flush();
    send.mockClear();

    const live = allBadges();
    expect(live.length).toBeGreaterThan(0);
    live[0]!.click();
    await flush();

    const retries = send.mock.calls.filter(
      ([m]) => (m as OutgoingMessage).type === 'REFRESH_PROFESSOR',
    );
    expect(retries).toHaveLength(1);
  });
});

describe('content script — detail card', () => {
  it('opens a card when a resolved badge is clicked', async () => {
    document.body.innerHTML = CLASSIC_HTML;
    installRuntime(async (m) => ({
      type: 'PROFESSOR_RESULT',
      name: (m as { name: string }).name,
      data: professor({ name: 'Richard Mercer' }),
    }));

    await loadContentScript();
    await flush();

    badgeAt().click();

    const card = document.querySelector('upi-card');
    expect(card).not.toBeNull();
    expect(card?.shadowRoot?.querySelector('.card')?.textContent).toContain('Richard Mercer');
  });

  it('does not open a card for an errored badge', async () => {
    document.body.innerHTML = CLASSIC_HTML;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    installRuntime(async () => ({ type: 'ERROR', message: 'down' }));

    await loadContentScript();
    await flush();

    badgeAt().click();
    expect(document.querySelectorAll('upi-card')).toHaveLength(0);
  });

  it('does not open a card when RMP had no match', async () => {
    document.body.innerHTML = CLASSIC_HTML;
    installRuntime(async (m) => ({
      type: 'PROFESSOR_RESULT',
      name: (m as { name: string }).name,
      data: null,
    }));

    await loadContentScript();
    await flush();

    badgeAt().click();
    expect(document.querySelectorAll('upi-card')).toHaveLength(0);
  });
});
