/**
 * Renders Chrome Web Store screenshots at the exact size the store accepts.
 *
 * The store takes 1280x800 or 640x400 and nothing else; the verification
 * screenshots are neither. It also rejects marketing graphics that do not show
 * the product working, so these are real renders of the real built bundle
 * against mock UAccess markup — the same pipeline verify-browser.mjs uses.
 *
 * Usage: node scripts/store-assets.mjs   (run `npm run build` first)
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'release', 'store');

const WIDTH = 1280;
const HEIGHT = 800;

const BROWSERS = [
  join(process.env.ProgramFiles ?? '', 'Google/Chrome/Application/chrome.exe'),
  join(process.env['ProgramFiles(x86)'] ?? '', 'Microsoft/Edge/Application/msedge.exe'),
  '/usr/bin/google-chrome',
];

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
};

if (!existsSync(DIST)) {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(1);
}

const browser = BROWSERS.find((p) => p && existsSync(p));
if (!browser) {
  console.error('No Chrome or Edge found.');
  process.exit(1);
}

const assets = readdirSync(join(DIST, 'assets'));
const contentBundle = assets.find(
  (f) => f.startsWith('index.ts-') && !f.includes('loader') && f.endsWith('.js'),
);
const popupBundle = assets.find((f) => f.startsWith('index.html-') && f.endsWith('.js'));
const popupCss = assets.find((f) => f.endsWith('.css'));

/** Ratings for the mock, chosen to show green, amber and red together. */
const DB = `{
  'Amy Graham': { dept: 'Chemistry', rating: 4.3, difficulty: 3.3, wta: 88, n: 271, tags: ['Amazing lectures', 'Caring', 'Respected'] },
  'Rick Mercer': { dept: 'Computer Science', rating: 2.9, difficulty: 2.9, wta: 48.6, n: 164, tags: ['Lecture heavy', 'Tough grader'],
    courses: [{ course: 'CSC110', rating: 3.6, difficulty: 2.2, numRatings: 12 },
              { course: 'CSC335', rating: 2.3, difficulty: 4.1, numRatings: 8 }],
    reviews: { attendanceMandatoryPct: 69, textbookUsedPct: 45, onlinePct: 23, gradesReported: 24,
               topGrade: 'A+', reviewsRead: 40,
               phrases: [{ phrase: 'lots of homework', mentions: 7 }, { phrase: 'engaging lectures', mentions: 4 }] } },
  'Saumya Debray': { dept: 'Computer Science', rating: 3.4, difficulty: 4.3, wta: 60, n: 21, tags: ['Get ready to read'] }
}`;

const CHROME_STUB = `
  window.chrome = {
    runtime: {
      sendMessage: (m) => new Promise((resolve) => setTimeout(() => {
        if (m.type === 'GET_SETTINGS') return resolve({ type: 'SETTINGS', settings: { autoDetect: true, showFilterBar: true, cacheTTLDays: 7 } });
        if (m.type === 'GET_CACHE_STATS') return resolve({ type: 'CACHE_STATS', stats: { count: 37, oldestAge: 3 * 86400000 } });
        if (m.type === 'GET_USAGE' || m.type === 'CLEAR_USAGE' || m.type === 'RECORD_VIEW' || m.type === 'BADGES_SHOWN') return resolve({
          type: 'USAGE',
          stats: { lookups: 41, matches: 33, misses: 6, errors: 0, cacheHits: 18, badgesShown: 41, since: Date.now() },
          recents: [
            { name: 'Amy Graham', department: 'Chemistry', overallRating: 4.3, numRatings: 271, rmpUrl: '#', viewedAt: Date.now() - 240000 },
            { name: 'Rick Mercer', department: 'Computer Science', overallRating: 2.9, numRatings: 164, rmpUrl: '#', viewedAt: Date.now() - 10800000 },
          ],
        });
        const hit = (${DB})[m.name];
        resolve({ type: 'PROFESSOR_RESULT', name: m.name, data: hit ? {
          id: 'x', name: m.name, department: hit.dept, university: 'University of Arizona',
          overallRating: hit.rating, difficulty: hit.difficulty, wouldTakeAgain: hit.wta,
          numRatings: hit.n, topTags: hit.tags, rmpUrl: 'https://www.ratemyprofessors.com/professor/12302',
          cachedAt: Date.now() - 3 * 86400000, matchConfidence: 'exact', alternateProfiles: [],
          courseRatings: hit.courses ?? [], reviewInsights: hit.reviews ?? null,
        } : null });
      }, 40)),
      onMessage: { addListener: () => {} },
    },
  };
`;

/** UAccess class search, styled close to the real page. */
const SEARCH_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Class Search</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; background: #fff; color: #1a1a1a; }
  .bar { background: #0c234b; color: #fff; padding: 14px 28px; font-size: 20px; font-weight: 600; }
  .wrap { padding: 20px 28px; }
  h1 { font-size: 19px; margin: 0 0 4px; }
  .sub { color: #666; font-size: 13px; margin-bottom: 14px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th { background: #4a6a8a; color: #fff; text-align: left; padding: 7px 10px; font-size: 12px; }
  td { border-bottom: 1px solid #e2e2e2; padding: 9px 10px; }
</style></head><body>
<div class="bar">UAccess · Class Search</div>
<div class="wrap">
  <h1>Search Results</h1>
  <div class="sub">3 classes found · Subject: Computer Science · Fall 2026</div>
  <table id="CLASS_SRCH_WRK2_STRM$scroll$0">
    <tr>
      <th id="CLASS_SRCH_WRK2_STRM_SUBJ_CATALOG_NBR$0">Class</th>
      <th>Section</th>
      <th id="CLASS_SRCH_WRK2_STRM_CLASS_SECTION$0">Class Nbr</th>
      <th id="CLASS_SRCH_WRK2_STRM_DAY$0">Days &amp; Times</th>
      <th id="CLASS_SRCH_WRK2_STRM_LOCATION$0">Room</th>
      <th id="CLASS_SRCH_WRK2_STRM_INSTRUCTOR$0">Instructor</th>
    </tr>
    <tr><td>CHEM 151</td><td>001</td><td>29212</td><td>MoWeFr 8:00AM - 8:50AM</td><td>Weaver Sci-Engr, Rm 200SW</td><td id="MTG_INSTR$0">Graham, Amy</td></tr>
    <tr><td>CSC 110</td><td>001</td><td>71613</td><td>MWF 9:00AM - 9:50AM</td><td>Harvill Bldg, Rm 101</td><td id="MTG_INSTR$1">Mercer, Rick</td></tr>
    <tr><td>CSC 245</td><td>002</td><td>71615</td><td>TuTh 11:00AM - 12:15PM</td><td>Gould-Simpson, Rm 906</td><td id="MTG_INSTR$2">Debray, Saumya</td></tr>
  </table>
</div>
<script>${CHROME_STUB}</script>
<script type="module" src="./assets/${contentBundle}"></script>
<script type="module">
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(1400);
  // Open a card so the screenshot shows the detail view too.
  document.querySelector('#MTG_INSTR\\\\$1 upi-badge')?.click();
  await sleep(400);
  await fetch('/ready', { method: 'POST' });
</script>
</body></html>`;

const POPUP_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Popup</title>
${popupCss ? `<link rel="stylesheet" href="./assets/${popupCss}">` : ''}
<style>
  /* The popup stylesheet pins body to 360px, which would pin the frame to the
     left edge of a 1280px screenshot. Override it for the capture only. */
  body {
    width: 100% !important;
    background: #eef1f5;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    margin: 0;
  }
  .frame { width: 360px; border: 1px solid #cfd4da; border-radius: 8px; overflow: hidden; box-shadow: 0 8px 28px rgba(0,0,0,.18); background: #fff; }
</style></head><body>
<div class="frame"><div id="root"></div></div>
<script>window.__APP_VERSION__ = '1.0.0';${CHROME_STUB}</script>
<script type="module" src="./assets/${popupBundle}"></script>
<script type="module">
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(900);
  await fetch('/ready', { method: 'POST' });
</script>
</body></html>`;

const pages = new Map([
  ['/search', SEARCH_PAGE],
  ['/popup', POPUP_PAGE],
]);

let ready;
const server = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0];

  if (req.method === 'POST' && path === '/ready') {
    res.writeHead(204).end();
    ready?.();
    return;
  }
  const page = pages.get(path);
  if (page) {
    res.writeHead(200, { 'Content-Type': 'text/html' }).end(page);
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

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
mkdirSync(OUT, { recursive: true });

async function shoot(path, name) {
  const profile = mkdtempSync(join(tmpdir(), 'upi-store-'));
  const file = join(OUT, name);
  const waited = new Promise((resolve) => (ready = resolve));

  const child = spawn(
    browser,
    [
      '--headless=new',
      `--user-data-dir=${profile}`,
      '--disable-gpu',
      '--no-first-run',
      '--disable-background-networking',
      '--hide-scrollbars',
      `--window-size=${WIDTH},${HEIGHT}`,
      `--screenshot=${file}`,
      '--virtual-time-budget=6000',
      base + path,
    ],
    { stdio: 'ignore' },
  );

  await Promise.race([waited, new Promise((r) => setTimeout(r, 20_000))]);
  await new Promise((r) => child.on('exit', r).unref?.());
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  } catch {
    /* Chrome still holds the profile briefly; harmless. */
  }
  console.log(`${existsSync(file) ? 'wrote' : 'FAILED'} ${file}`);
}

await shoot('/search', 'screenshot-1-class-search.png');
await shoot('/popup', 'screenshot-2-popup.png');
server.close();

console.log(`\nStore screenshots are ${WIDTH}x${HEIGHT}, which is what the listing accepts.`);
