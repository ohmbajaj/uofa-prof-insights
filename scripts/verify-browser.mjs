/**
 * Runs the real built content script in real Chrome against mock UAccess markup.
 *
 * jsdom has no layout engine, so the unit and integration suites cannot answer
 * the questions that actually matter for an in-page extension: does the custom
 * element upgrade, does the badge fit inside the table cell, does anything
 * overflow. This drives headless Chrome, collects measurements from the live
 * page, and writes a screenshot for a human to glance at.
 *
 * Usage: node scripts/verify-browser.mjs   (run `npm run build` first)
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'release', 'verify');

const CHROME_CANDIDATES = [
  join(process.env.ProgramFiles ?? '', 'Google/Chrome/Application/chrome.exe'),
  join(process.env['ProgramFiles(x86)'] ?? '', 'Google/Chrome/Application/chrome.exe'),
  join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
};

function findChrome() {
  const found = CHROME_CANDIDATES.find((p) => p && existsSync(p));
  if (!found) {
    console.error('Chrome not found. Checked:\n  ' + CHROME_CANDIDATES.join('\n  '));
    process.exit(1);
  }
  return found;
}

/**
 * The real content script bundle.
 *
 * NOT the file named in the manifest: CRXJS points `content_scripts.js` at a
 * tiny loader that dynamic-imports the actual bundle through
 * `chrome.runtime.getURL`, which only resolves inside a real extension. The
 * harness loads the bundle the loader would have fetched.
 */
function findContentBundle() {
  const assets = readdirSync(join(DIST, 'assets'));
  const bundle = assets.find(
    (f) => f.startsWith('index.ts-') && !f.includes('loader') && f.endsWith('.js'),
  );
  if (!bundle) {
    console.error('Could not locate the content script bundle in dist/assets.');
    process.exit(1);
  }
  return `assets/${bundle}`;
}

/** The popup's React bundle and stylesheet. */
function findPopupAssets() {
  const assets = readdirSync(join(DIST, 'assets'));
  const js = assets.find((f) => f.startsWith('index.html-') && f.endsWith('.js'));
  const css = assets.find((f) => f.endsWith('.css'));
  if (!js) {
    console.error('Could not locate the popup bundle in dist/assets.');
    process.exit(1);
  }
  return { js: `assets/${js}`, css: css ? `assets/${css}` : null };
}

// ------------------------------------------------------------ the mock page

const CLASSIC_ROWS = [
  ['CSC 110', '001', '71613', 'Harvill Bldg, Rm 101', 'Mercer, Richard'],
  ['CSC 210', '002', '71614', 'Gould-Simpson, Rm 906', 'Debray, Saumya'],
  ['CSC 245', '001', '71615', 'Social Sciences, Rm 100', 'Staff'],
  ['CSC 335', '001', '71616', 'Gould-Simpson, Rm 701', "O'Brien, Sean"],
]
  .map(
    ([code, sec, nbr, room, instr], i) => `
  <tr id="trCLASS_SRCH_WRK2_STRM$0_row${i + 1}" valign="center">
    <td align="left">${code}</td>
    <td align="left">${sec}</td>
    <td align="right">${nbr}</td>
    <td align="left">Regular Academic Session</td>
    <td align="left" colspan="2">08/21/2026 - 12/06/2026<br>MWF 9:00AM - 9:50AM</td>
    <td align="left">${room}</td>
    <td align="right">4.000</td>
    <td align="left" id="MTG_INSTR$${i}">${instr}</td>
  </tr>`,
  )
  .join('');

function harnessHtml(bundlePath) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>UAccess mock — verification harness</title>
<style>
  /* Approximates PeopleSoft's own styling, including a couple of aggressive
     global rules that a naive badge implementation would inherit. */
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; margin: 16px; background: #fff; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 24px; }
  th { background: #4a6a8a; color: #fff; text-align: left; padding: 6px 8px; font-size: 11px; }
  td { border-bottom: 1px solid #dcdcdc; padding: 6px 8px; vertical-align: top; }
  span { color: inherit; }
  div { box-sizing: content-box; }
  .resultPanel { border: 1px solid #ccc; margin-bottom: 12px; }
  .courseTitle { background: #eef1f5; padding: 8px; display: flex; gap: 8px; }
  .courseCode { font-weight: bold; }
  .panel-body { padding: 8px; }
  .classSection { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 6px 0; border-top: 1px solid #eee; }
  .instructor { font-weight: 600; }
  #verify { white-space: pre-wrap; font-family: Consolas, monospace; font-size: 11px; background: #f6f6f6; padding: 8px; }
</style>
</head>
<body>

<h2>Classic UAccess</h2>
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
  ${CLASSIC_ROWS}
</table>

<h2>New Student Center</h2>
<div id="CSCResult1" class="resultPanel collapsible">
  <div class="courseTitle">
    <div class="courseCode">CSC 110</div>
    <div class="courseName">Principles of Programming with Python</div>
  </div>
  <div class="panel-body">
    <div class="sectionDetails">
      <div class="classSection">
        <div class="sectionData"><div class="classNbr">71613</div></div>
        <div class="meetingData"><div class="days">MoWeFr</div></div>
        <div class="locationData"><div class="room">Harvill 101</div></div>
        <div class="classInstructors"><div class="instructor">Mercer, Richard</div></div>
      </div>
      <div class="classSection">
        <div class="sectionData"><div class="classNbr">71620</div></div>
        <div class="meetingData"><div class="days">TuTh</div></div>
        <div class="locationData"><div class="room">Gould-Simpson 906</div></div>
        <div class="classInstructors"><div class="instructor">Debray, Saumya</div></div>
      </div>
    </div>
  </div>
</div>

<h2>Measurements</h2>
<pre id="verify">running…</pre>

<script>
  // Row heights BEFORE the extension touches anything, for a layout diff.
  window.__baseline = [...document.querySelectorAll('#CLASS_SRCH_WRK2_STRM\\\\$scroll\\\\$0 tr')]
    .map((r) => Math.round(r.getBoundingClientRect().height));
  window.__baselineScrollWidth = document.documentElement.scrollWidth;

  const DB = {
    'Richard Mercer': { rating: 2.9, difficulty: 2.9, wta: 48.6, n: 164, tags: ['Lecture heavy', 'Tough grader'] },
    'Saumya Debray': { rating: 3.4, difficulty: 4.3, wta: 60, n: 21, tags: ['Get ready to read'] },
    "Sean O'Brien": { rating: 4.6, difficulty: 2.1, wta: 92, n: 8, tags: ['Caring'] },
  };

  // Minimal chrome.runtime stand-in — the service worker is not under test here.
  window.chrome = {
    runtime: {
      sendMessage: (message) => new Promise((resolve) => {
        setTimeout(() => {
          if (message.type === 'GET_SETTINGS') {
            return resolve({ type: 'SETTINGS', settings: { autoDetect: true, showComparison: true, cacheTTLDays: 7 } });
          }
          const hit = DB[message.name];
          resolve({
            type: 'PROFESSOR_RESULT',
            name: message.name,
            data: hit ? {
              id: 'VGVhY2hlci0x', name: message.name,
              department: 'Computer Science', university: 'University of Arizona',
              overallRating: hit.rating, difficulty: hit.difficulty,
              wouldTakeAgain: hit.wta, numRatings: hit.n, topTags: hit.tags,
              rmpUrl: 'https://www.ratemyprofessors.com/professor/12302',
              cachedAt: Date.now() - 3 * 86400000,
            } : null,
          });
        }, 60);
      }),
    },
  };
</script>

<script type="module" src="./${bundlePath}"></script>

<script type="module">
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(1200);

  const badges = [...document.querySelectorAll('upi-badge')];
  const table = document.querySelector('#CLASS_SRCH_WRK2_STRM\\\\$scroll\\\\$0');
  const rows = [...table.querySelectorAll('tr')];

  // Open a card so its real, laid-out position can be measured.
  const first = badges.find((b) => b.closest('td'));
  if (first) first.click();
  await sleep(250);

  const card = document.querySelector('upi-card');
  const cardRect = card ? card.getBoundingClientRect() : null;
  const anchorRect = first ? first.getBoundingClientRect() : null;
  const sidebar = document.querySelector('upi-sidebar');

  const report = {
    badgeCount: badges.length,
    upgraded: badges.filter((b) => b.shadowRoot !== null).length,
    constructorName: badges[0] ? badges[0].constructor.name : null,
    rendered: badges.map((b) => (b.shadowRoot?.querySelector('.badge')?.textContent ?? '').trim()),
    // A fixed-position sidebar silently covers the right-hand columns unless
    // the page reserves room for it. That is the Instructor column here — the
    // one the badges hang off — so nothing may sit underneath the panel.
    instructorCellsVisible: (() => {
      const panel = document.querySelector('upi-sidebar');
      if (!panel) return null;
      const left = panel.getBoundingClientRect().left;
      const cells = [
        ...document.querySelectorAll('[id^="MTG_INSTR"], .instructor'),
      ];
      return cells.every((c) => c.getBoundingClientRect().right <= left + 1);
    })(),
    // Did any badge escape its cell? (a <tr>-parented badge would.)
    badgesInsideCell: badges.every((b) => b.closest('td') !== null || b.closest('.instructor') !== null),
    badgeFitsCell: badges.every((b) => {
      const host = b.closest('td') ?? b.closest('.instructor');
      if (!host) return false;
      const hb = host.getBoundingClientRect(), bb = b.getBoundingClientRect();
      return bb.left >= hb.left - 1 && bb.right <= hb.right + 1 && bb.bottom <= hb.bottom + 1;
    }),
    rowHeightsBefore: window.__baseline,
    rowHeightsAfter: rows.map((r) => Math.round(r.getBoundingClientRect().height)),
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
    scrollWidthBefore: window.__baselineScrollWidth,
    scrollWidthAfter: document.documentElement.scrollWidth,
    card: cardRect ? {
      opened: true,
      width: Math.round(cardRect.width),
      height: Math.round(cardRect.height),
      belowAnchor: Math.round(cardRect.top) >= Math.round(anchorRect.bottom),
      withinViewport: cardRect.left >= 0 && cardRect.right <= window.innerWidth,
      clearOfSidebar: sidebar ? cardRect.right <= sidebar.getBoundingClientRect().left + 1 : true,
      text: (card.shadowRoot?.querySelector('.card')?.textContent ?? '').replace(/\\s+/g, ' ').trim(),
    } : { opened: false },
    sidebar: sidebar ? {
      mounted: true,
      width: Math.round(sidebar.getBoundingClientRect().width),
      rows: [...sidebar.shadowRoot.querySelectorAll('.meta .name')].map((n) => n.textContent),
      scores: [...sidebar.shadowRoot.querySelectorAll('.score')].map((n) => n.textContent),
    } : { mounted: false },
  };

  document.getElementById('verify').textContent = JSON.stringify(report, null, 2);
  document.title = 'done';

  // POSTing beats scraping --dump-dom: no HTML-entity round-tripping, and the
  // driver learns exactly when the measurements are ready.
  await fetch('/report', { method: 'POST', body: JSON.stringify(report) });
</script>
</body>
</html>`;
}

/** Renders the real popup bundle with a stubbed service worker. */
function popupHtml({ js, css }, tab = 'status') {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Popup harness</title>
${css ? `<link rel="stylesheet" href="./${css}">` : ''}
<style>
  body { background: #e9ecef; }
  .frame { width: 360px; margin: 16px; border: 1px solid #c9c9c9; box-shadow: 0 2px 10px rgba(0,0,0,.15); background: #fff; }
</style>
</head>
<body>
<div class="frame"><div id="root"></div></div>
<script>
  window.__APP_VERSION__ = '1.0.0';
  window.chrome = {
    runtime: {
      sendMessage: (m) => new Promise((resolve) => setTimeout(() => {
        if (m.type === 'GET_CACHE_STATS') return resolve({ type: 'CACHE_STATS', stats: { count: 37, oldestAge: 3 * 86400000 } });
        if (m.type === 'GET_SETTINGS') return resolve({ type: 'SETTINGS', settings: { autoDetect: true, showComparison: true, cacheTTLDays: 7 } });
        if (m.type === 'SAVE_SETTINGS') return resolve({ type: 'SETTINGS', settings: { autoDetect: true, showComparison: true, cacheTTLDays: 7, ...m.settings } });
        if (m.type === 'CLEAR_CACHE') return resolve({ type: 'CACHE_CLEARED' });
        if (m.type === 'LOOKUP_PROFESSOR') return resolve({
          type: 'PROFESSOR_RESULT', name: m.name,
          data: { id: 'x', name: 'Richard Mercer', department: 'Computer Science',
            university: 'University of Arizona', overallRating: 2.9, difficulty: 2.9,
            wouldTakeAgain: 48.6, numRatings: 164, topTags: ['Lecture heavy', 'Tough grader'],
            rmpUrl: 'https://www.ratemyprofessors.com/professor/12302', cachedAt: Date.now() },
        });
        resolve({ type: 'ERROR', message: 'unhandled' });
      }, 40)),
    },
  };
</script>
<script type="module" src="./${js}"></script>
<script type="module">
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(600);

  const wantSettings = ${tab === 'settings'};
  if (wantSettings) {
    [...document.querySelectorAll('[role="tab"]')]
      .find((t) => t.textContent === 'Settings')?.click();
    await sleep(400);
  }

  // Drive a search so the result card is on screen for the screenshot.
  const box = wantSettings ? null : document.querySelector('#upi-search');
  if (box) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(box, 'Richard Mercer');
    box.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(60);
    document.querySelector('form.searchbar')?.requestSubmit();
    await sleep(400);
  }

  const text = document.body.innerText;
  await fetch('/report', { method: 'POST', body: JSON.stringify({
    page: wantSettings ? 'settings' : 'status',
    mounted: !!document.querySelector('.app'),
    tabs: [...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent),
    cacheCount: document.querySelector('.stat__value')?.textContent ?? null,
    searchRendered: text.includes('Richard Mercer'),
    showsDifficulty: /Difficulty 2\\.9/.test(text),
    showsTags: text.includes('Lecture heavy'),
    styled: getComputedStyle(document.querySelector('.app__header')).backgroundColor,
    width: Math.round(document.querySelector('.app')?.getBoundingClientRect().width ?? 0),
    settingsControls: [...document.querySelectorAll('.field label')].map((l) => l.textContent),
    autoDetectChecked: document.querySelector('#autoDetect')?.checked ?? null,
    ttlValue: document.querySelector('#cacheTTLDays')?.value ?? null,
  })});
  document.title = 'done';
</script>
</body>
</html>`;
}

// ------------------------------------------------------------------- driver

if (!existsSync(DIST)) {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(1);
}

const chrome = findChrome();
const bundle = findContentBundle();
console.log(`chrome:  ${chrome}`);
console.log(`bundle:  ${bundle}`);

mkdirSync(OUT, { recursive: true });

// The harness must never leave anything behind that would make dist/
// unloadable as an unpacked extension.
const reserved = readdirSync(DIST).filter((f) => f.startsWith('_'));
if (reserved.length > 0) {
  console.error(
    `dist/ contains reserved '_'-prefixed entries, which Chrome refuses to load:\n  ${reserved.join('\n  ')}\nRun \`npm run build\` to clear them.`,
  );
  process.exit(1);
}

/** Reports arrive by POST, one per harness page, keyed by route. */
const pending = new Map();
function awaitReport(key) {
  return new Promise((resolve) => pending.set(key, resolve));
}
let currentPage = null;

/**
 * Harness pages are served from memory, never written to disk.
 *
 * They used to be written into dist/ as `__harness.html` and friends, which
 * quietly made the whole directory unloadable: Chrome rejects an unpacked
 * extension containing any file whose name starts with `_`, since those are
 * reserved for `_locales` and `_metadata`. `npm run build` cleared them, so
 * the breakage only showed up when someone loaded dist/ without rebuilding.
 */
const virtualPages = new Map([
  ['/harness', harnessHtml(bundle)],
  ['/popup', popupHtml(findPopupAssets(), 'status')],
  ['/settings', popupHtml(findPopupAssets(), 'settings')],
]);

const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);

  if (req.method === 'POST' && path === '/report') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      res.writeHead(204).end();
      pending.get(currentPage)?.(JSON.parse(body));
    });
    return;
  }

  // Harness pages come from memory; everything else is a real built asset.
  const page = virtualPages.get(path);
  if (page) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(page);
    return;
  }

  const file = join(DIST, path);
  if (!existsSync(file)) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/`;
console.log(`serving: ${url}\n`);

const shot = join(OUT, 'uaccess-mock.png');
const popupShot = join(OUT, 'popup.png');
const settingsShot = join(OUT, 'popup-settings.png');

/** Loads one harness page in a fresh headless Chrome and returns its report. */
async function runPage(page, screenshot, viewport) {
  // A throwaway profile is essential: without it Chrome hands the URL to the
  // already-running browser and the launched process exits (or hangs).
  const profile = mkdtempSync(join(tmpdir(), 'upi-verify-'));
  currentPage = `/${page}`;
  const waiting = awaitReport(currentPage);

  const child = spawn(
    chrome,
    [
      '--headless=new',
      `--user-data-dir=${profile}`,
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-default-apps',
      '--hide-scrollbars',
      `--window-size=${viewport}`,
      `--screenshot=${screenshot}`,
      '--virtual-time-budget=8000',
      `${url}${page}`,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  const exited = new Promise((resolve) => child.on('exit', resolve));
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`timed out waiting for ${page}`)), 60_000),
  );

  try {
    const result = await Promise.race([waiting, timeout]);
    await Promise.race([exited, new Promise((r) => setTimeout(r, 15_000))]);
    return result;
  } finally {
    if (child.exitCode === null) child.kill();
    rmSync(profile, { recursive: true, force: true });
  }
}

let report;
let popup;
let settings;
try {
  report = await runPage('harness', shot, '1280,1000');
  popup = await runPage('popup', popupShot, '420,640');
  settings = await runPage('settings', settingsShot, '420,560');
} catch (error) {
  console.error(`FAILED: ${error.message}`);
  console.error('The bundle most likely threw before reporting.');
  process.exitCode = 1;
} finally {
  server.close();
}

if (report) {
  console.log(JSON.stringify(report, null, 2));

  const rowsGrew = report.rowHeightsAfter.some((h, i) => h > (report.rowHeightsBefore[i] ?? 0));

  const checks = [
    ['badges injected on both layouts', report.badgeCount === 5],
    ['custom elements upgraded', report.upgraded === report.badgeCount && report.badgeCount > 0],
    ['"Staff" row was skipped', report.badgeCount === 5],
    ['badges stayed inside their cell', report.badgesInsideCell === true],
    ['badges fit within their cell box', report.badgeFitsCell === true],
    ['table row heights unchanged', rowsGrew === false],
    ['no horizontal overflow', report.horizontalOverflow === false],
    ['detail card opened', report.card.opened === true],
    ['card sits below its badge', report.card.belowAnchor === true],
    ['card stays within the viewport', report.card.withinViewport === true],
    ['card clears the sidebar', report.card.clearOfSidebar === true],
    ['sidebar mounted', report.sidebar.mounted === true],
    ['sidebar ranked best-first', report.sidebar.scores?.[0] === '4.6'],
    ['sidebar does not cover instructor names', report.instructorCellsVisible === true],

    ['popup mounted', popup?.mounted === true],
    ['popup shows both tabs', popup?.tabs?.join(',') === 'Status,Settings'],
    ['popup stylesheet applied', popup?.styled === 'rgb(12, 35, 75)'],
    ['popup shows cache stats', popup?.cacheCount === '37'],
    ['popup search renders a result', popup?.searchRendered === true],
    ['popup result shows difficulty', popup?.showsDifficulty === true],
    ['popup result shows tags', popup?.showsTags === true],

    ['settings tab renders all three controls', settings?.settingsControls?.length === 3],
    ['settings reflects stored autoDetect', settings?.autoDetectChecked === true],
    ['settings reflects stored TTL', settings?.ttlValue === '7'],
  ];

  console.log('');
  let failed = 0;
  for (const [label, ok] of checks) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
    if (!ok) failed++;
  }

  console.log(`\nscreenshots:`);
  console.log(`  ${existsSync(shot) ? shot : '(uaccess mock not written)'}`);
  console.log(`  ${existsSync(popupShot) ? popupShot : '(popup not written)'}`);
  console.log(`  ${existsSync(settingsShot) ? settingsShot : '(settings not written)'}`);
  if (failed > 0) {
    console.error(`\n${failed} browser check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log('\nAll browser checks passed.');
  }
}
