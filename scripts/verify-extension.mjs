/**
 * Loads dist/ into Chrome as a real unpacked extension and checks that badges
 * actually appear on a page.
 *
 * This exists because verify-browser.mjs does NOT test this. That harness
 * imports the content bundle directly as a module, which bypasses everything
 * that makes an extension an extension: the CRXJS loader shim, the
 * `chrome.runtime.getURL` dynamic import of the real chunk, web-accessible
 * resource resolution, and Chrome's own script injection. All of those can
 * fail while every existing check still passes — which is precisely what
 * happened on studentcenter.arizona.edu, where the extension reported "not
 * running on this tab".
 *
 * The extension only matches UAccess hosts, so the manifest is copied to a
 * temporary directory and patched to also match 127.0.0.1. Nothing in dist/ is
 * modified.
 *
 * Usage: node scripts/verify-extension.mjs   (run `npm run build` first)
 */
import { createServer } from 'node:http';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

/**
 * Browsers that can still side-load an unpacked extension, best first.
 *
 * Branded Google Chrome cannot: it now refuses `--disable-extensions-except`
 * ("not allowed in Google Chrome, ignoring") and no longer honours
 * `--load-extension`, an anti-malware change. The extension simply never
 * loads, which is indistinguishable from a broken content script — this
 * harness was reporting exactly that for half an hour.
 *
 * Edge and Chromium run the same engine and still allow it, so they are tried
 * first and Chrome is kept only as a last resort.
 */
const CHROME_CANDIDATES = [
  join(process.env['ProgramFiles(x86)'] ?? '', 'Microsoft/Edge/Application/msedge.exe'),
  join(process.env.ProgramFiles ?? '', 'Microsoft/Edge/Application/msedge.exe'),
  join(process.env.ProgramFiles ?? '', 'Chromium/Application/chrome.exe'),
  join(process.env.LOCALAPPDATA ?? '', 'Chromium/Application/chrome.exe'),
  join(process.env.ProgramFiles ?? '', 'Google/Chrome/Application/chrome.exe'),
  join(process.env['ProgramFiles(x86)'] ?? '', 'Google/Chrome/Application/chrome.exe'),
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
};

function findChrome() {
  const found = CHROME_CANDIDATES.find((p) => p && existsSync(p));
  if (!found) {
    console.error('Chrome not found.');
    process.exit(1);
  }
  return found;
}

/**
 * A UAccess class-search page, using instructors who really exist at UofA so
 * the lookup goes all the way to RateMyProfessors and back.
 */
const PAGE = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>UAccess mock (extension test)</title>
<style>
  body { font-family: Arial, sans-serif; margin: 0; }
  .content { padding: 16px; }
  table { border-collapse: collapse; width: 100%; }
  th { background: #4a6a8a; color: #fff; text-align: left; padding: 6px 8px; }
  td { border-bottom: 1px solid #ddd; padding: 6px 8px; }

  /*
   * The Student Center's header and hero banner are sized against the viewport,
   * not their parent, so they do not shrink when something narrows the body.
   * Kept here as a tripwire: anything that reflows the page around a pinned
   * element shows up as sideways scrolling on a layout shaped like this one.
   */
  .bleed { width: 100vw; height: 34px; background: #ab0532; }
  .hero  { width: 100vw; height: 60px; background: #0c234b; }
</style>
</head>
<body>
<div class="bleed"></div>
<div class="hero"></div>
<!--
  Two real studentcenter.arizona.edu layouts, rebuilt from screenshots and
  nested as deeply as the SPA nests them. Deliberately no classic results
  table: the generic detector runs only when the classic and Student Center
  detectors both find nothing, so including one means this path is never
  exercised — which is why an earlier version of this harness passed while
  the real pages stayed empty.
-->
<div id="app"><div class="page"><div class="content">

  <!-- /academics/class-search/results -->
  <div class="results">
    <h2>Search Results</h2>
    <p>1 class(es) found, 13 class section(s) found</p>
    <div class="accordion">
      <div class="panel">
        <div class="panel-header"><span>CHEM 151 - Chemical Thinking I</span></div>
        <div class="panel-body">
          <div class="section-row">
            <div class="section-head">Section 001 &nbsp; Lecture &nbsp; (29212)</div>
            <div class="session-box">
              <div><div class="label">Session</div><div>Regular Academic Session</div></div>
              <div><div class="label">Instruction Mode</div><div>In Person</div></div>
            </div>
            <div class="meeting">
              <div class="meeting-title">Meeting Information</div>
              <div class="cols">
                <div class="col">
                  <div class="line"><i class="ico"></i>MoWeFr 8:00AM - 8:50AM</div>
                  <div class="line"><i class="ico"></i>Weaver Sci-Engr Lbry, Rm 200SW</div>
                </div>
                <div class="col">
                  <div class="line"><i class="ico"></i>Amy Graham</div>
                  <div class="line"><i class="ico"></i>8/24/26 - 12/9/26</div>
                </div>
              </div>
            </div>
            <div class="tags">
              <span>Gen Ed: Exploring Perspectives, Natural Scientist</span>
              <span>SUN# CHM 1151 - General Chemistry I</span>
            </div>
            <button>CLASS DETAILS</button><button>SELECT</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- /academics/class-schedule -->
  <div class="results">
    <div class="course-card">
      <div class="card-head">
        <h2><span class="code">ECE 201 - Programming 2</span> <span class="pill">Enrolled</span></h2>
      </div>
      <div class="card-body">
        <div class="meta-row">
          <span class="meta"><i class="ico"></i>TuTh 11:00AM - 12:15PM</span>
          <span class="meta"><i class="ico"></i>Gittings Bldg, Rm 201</span>
          <span class="meta"><i class="ico"></i>Ratchaneekorn Thamvichai, Na Liu</span>
        </div>
      </div>
    </div>
  </div>

</div></div></div>

<pre id="out">waiting…</pre>
<script>
  // Give the content script time to inject and resolve lookups against the
  // real API. This page does not stub chrome.* — the extension is real here.
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Capture anything the extension logs or throws, so a silent injection
  // failure leaves evidence instead of just an empty page.
  const log = [];
  for (const level of ['log', 'info', 'warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      log.push(level + ': ' + args.map((a) => String(a)).join(' ').slice(0, 200));
      original(...args);
    };
  }
  window.addEventListener('error', (e) => log.push('window.error: ' + e.message));
  window.addEventListener('unhandledrejection', (e) => log.push('rejection: ' + String(e.reason)));

  /*
   * The pill's own text, NOT shadowRoot.textContent.
   *
   * The shadow root also contains the <style> element, whose CSS is full of
   * digits — so a "has this resolved yet" test against the whole root matched
   * on the very first poll, every time. This harness was reporting three
   * resolved badges roughly 400ms after load and then clicking one that was
   * still showing its loading skeleton.
   */
  const pillText = (b) => {
    const pill = b.shadowRoot && b.shadowRoot.querySelector('.badge');
    return pill ? pill.textContent : '';
  };

  // Width of an element that actually rendered, or 0 if it is inert. An
  // unregistered custom element has no shadow root and no box.
  const box = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return { present: false, shadow: false, width: 0 };
    return {
      present: true,
      shadow: el.shadowRoot !== null,
      width: Math.round(el.getBoundingClientRect().width),
    };
  };

  (async () => {
    let report = null;
    for (let attempt = 0; attempt < 24; attempt++) {
      await sleep(500);
      const badges = [...document.querySelectorAll('upi-badge')];
      const resolved = badges.filter((b) => {
        const text = pillText(b);
        return /\\d/.test(text) || text.includes('N/A');
      });
      report = {
        badges: badges.length,
        upgraded: badges.filter((b) => b.shadowRoot !== null).length,
        resolved: resolved.length,
        rendered: badges.map((b) => pillText(b).replace(/\\s+/g, ' ').trim()),
        anchors: badges.map((b) => (b.parentElement ? b.parentElement.id || b.parentElement.className || b.parentElement.tagName : '?')),
        log: log.slice(0, 25),
        loader: document.documentElement.getAttribute('data-upi-loader'),
        chunkUrl: document.documentElement.getAttribute('data-upi-url'),
        importResult: document.documentElement.getAttribute('data-upi-import'),
        importStack: document.documentElement.getAttribute('data-upi-stack'),
        serviceWorker: document.documentElement.getAttribute('data-upi-sw'),
      };
      // Stop early once every badge has finished loading.
      if (badges.length > 0 && resolved.length === badges.length) break;
    }

    // Measured after the lookups settle, so any late mutation is included.
    await sleep(700);
    const root = document.documentElement;
    report.layout = {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      // The symptom the user reported: the whole page scrolling sideways.
      horizontalOverflow: root.scrollWidth - root.clientWidth > 2,
      bodyPaddingRight: document.body.style.paddingRight || '(none)',
    };
    report.panelsPinnedToEdge = document.querySelectorAll('upi-sidebar').length;

    // A badge that opens nothing is the same failure as a badge that never
    // appeared, so drive the click the way a student would.
    const first = document.querySelector('upi-badge');
    if (first) first.click();
    await sleep(400);
    report.card = box('upi-card');
    // Scoped to the card body for the same reason as pillText: the shadow
    // root's own textContent is mostly the stylesheet.
    report.cardText = (() => {
      const body = document.querySelector('upi-card')?.shadowRoot?.querySelector('.card');
      return body ? body.textContent.replace(/\\s+/g, ' ').trim().slice(0, 90) : '';
    })();

    document.getElementById('out').textContent = JSON.stringify(report, null, 2);
    await fetch('/report', { method: 'POST', body: JSON.stringify(report) });
  })();
</script>
</body></html>`;

// ------------------------------------------------------------------- driver

if (!existsSync(DIST)) {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(1);
}

const chrome = findChrome();

/**
 * Copy dist/ and widen the manifest to the loopback host.
 *
 * Both `content_scripts.matches` and `web_accessible_resources.matches` need
 * it: the loader is injected by the first, and the chunk it imports is only
 * fetchable because of the second. Missing either produces the same silent
 * "nothing happened" this script is here to catch.
 */
const stage = mkdtempSync(join(tmpdir(), 'upi-ext-'));
cpSync(DIST, stage, { recursive: true });

const manifestPath = join(stage, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
/*
 * `<all_urls>` rather than a loopback pattern. Match-pattern subtleties (ports,
 * scheme, trailing path) are their own failure mode, and this harness is here
 * to test the injection pipeline, not pattern syntax. Widening removes that
 * variable; the shipped manifest is untouched.
 */
const ANY = '<all_urls>';
// `<all_urls>` is rejected inside web_accessible_resources — Chrome requires a
// concrete pattern there, and an invalid manifest makes the whole extension
// fail to load silently, which looks exactly like a broken content script.
const LOOPBACK = 'http://127.0.0.1/*';

manifest.content_scripts[0].matches = [ANY];
manifest.host_permissions.push(ANY);
for (const entry of manifest.web_accessible_resources ?? []) {
  entry.matches = [...new Set([...entry.matches, LOOPBACK])];
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

/*
 * Replace the staged loader with an instrumented copy.
 *
 * "No badges" has three possible causes that look identical: the content
 * script was never injected, the loader ran but its dynamic import failed, or
 * the bundle ran and the detectors found nothing. Markers on <html> — readable
 * from the page, since the DOM is shared — tell them apart.
 */
const loaderName = manifest.content_scripts[0].js[0];
const loaderPath = join(stage, loaderName);
const loaderSource = readFileSync(loaderPath, 'utf8');
const chunk = /getURL\(\s*"([^"]+)"\s*\)/.exec(loaderSource)?.[1];

if (!chunk) {
  console.error(`Could not find the chunk reference inside ${loaderName}`);
  process.exit(1);
}

writeFileSync(
  loaderPath,
  `(function () {
  'use strict';
  const mark = (k, v) => document.documentElement.setAttribute('data-upi-' + k, String(v).slice(0, 1200));
  mark('loader', 'ran');
  try {
    mark('url', chrome.runtime.getURL(${JSON.stringify(chunk)}));
  } catch (e) {
    mark('url', 'threw: ' + e);
  }
  (async () => {
    try {
      await import(chrome.runtime.getURL(${JSON.stringify(chunk)}));
      mark('import', 'ok');
    } catch (e) {
      mark('import', 'failed: ' + e);
      mark('stack', (e && e.stack ? e.stack : '(no stack)').replace(/\\n/g, ' | '));
    }
  })();

  // Does the service worker answer at all? The content script's very first act
  // is to await GET_SETTINGS, so a worker that never replies stalls everything
  // downstream while leaving no error behind.
  setTimeout(() => {
    if (!document.documentElement.hasAttribute('data-upi-sw')) mark('sw', 'HUNG (no reply)');
  }, 8000);
  try {
    chrome.runtime
      .sendMessage({ type: 'GET_SETTINGS' })
      .then((r) => mark('sw', 'replied: ' + JSON.stringify(r)))
      .catch((e) => mark('sw', 'rejected: ' + e));
  } catch (e) {
    mark('sw', 'threw: ' + e);
  }
})();
`,
);
console.log(`instrumented loader ${loaderName} -> ${chunk}`);

let onReport;
const reported = new Promise((resolve) => (onReport = resolve));

const server = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0];

  if (req.method === 'POST' && path === '/report') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.writeHead(204).end();
      onReport(JSON.parse(body || 'null'));
    });
    return;
  }
  if (path === '/' || path === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(PAGE);
    return;
  }

  const file = join(stage, path);
  if (!existsSync(file)) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;

console.log(`chrome:    ${chrome}`);
console.log(`extension: ${stage}`);
console.log(`page:      ${url}\n`);

/*
 * Headless Chrome has historically been unreliable at loading unpacked
 * extensions. `HEADED=1` runs a real browser window, which distinguishes "the
 * extension is broken" from "the harness cannot load extensions" — opposite
 * conclusions from the same empty result.
 */
/*
 * Headed by default. MV3 service workers do not start reliably under
 * `--headless=new`: the worker never boots, so the content script's first
 * `await sendMessage(...)` hangs forever and the page looks broken for reasons
 * that have nothing to do with the extension. `HEADLESS=1` opts back in.
 */
const headed = process.env.HEADLESS !== '1';
const profile = mkdtempSync(join(tmpdir(), 'upi-ext-profile-'));
const child = spawn(
  chrome,
  [
    ...(headed ? [] : ['--headless=new']),
    `--user-data-dir=${profile}`,
    `--load-extension=${stage}`,
    `--disable-extensions-except=${stage}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    // Chrome reports manifest rejections and load failures here.
    '--enable-logging=stderr',
    '--log-level=0',
    '--window-size=1280,900',
    '--virtual-time-budget=20000',
    url,
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);

let stderr = '';
child.stderr.on('data', (d) => (stderr += d.toString()));

const timeout = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('timed out waiting for the page report')), 60_000),
);

let report = null;
try {
  report = await Promise.race([reported, timeout]);
} catch (error) {
  console.error(`FAILED: ${error.message}`);
} finally {
  if (child.exitCode === null) child.kill();
  server.close();

  // Chrome holds its profile open briefly after SIGTERM; a failed cleanup of a
  // temp directory must never mask the result we came here for.
  await new Promise((r) => setTimeout(r, 600));
  for (const dir of [profile, stage]) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      console.warn(`(left behind ${dir})`);
    }
  }
}

if (!report) {
  console.error('\nNo report. Chrome stderr:\n' + stderr.split('\n').slice(0, 20).join('\n'));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));

const checks = [
  ['content script survived module evaluation', report.importResult === 'ok'],
  ['service worker answered the first message', /^replied/.test(report.serviceWorker ?? '')],
  ['content script injected badges', report.badges > 0],
  ['every badge has a shadow root', report.badges > 0 && report.upgraded === report.badges],
  ['badges resolved against the live API', report.resolved === report.badges && report.badges > 0],
  /*
   * Amy Graham from class search and Ratchaneekorn Thamvichai from class
   * schedule — one from each layout. The third name the generic detector finds,
   * Na Liu, has no RateMyProfessors profile, and a speculative name that
   * matches nobody is withdrawn rather than left printing "N/A" on the page.
   */
  ['an instructor from each layout is badged', report.badges === 2],
  ['every surviving badge shows a real rating', report.rendered.every((t) => /★ \d/.test(t))],

  /*
   * The detail card used to register itself as a custom element, which is
   * impossible in the isolated world: it was present in the DOM, zero pixels
   * wide, with no shadow root, so clicking a badge did nothing at all.
   */
  ['clicking a badge opens the detail card', report.card.shadow && report.card.width > 0],
  ['the card shows the professor it was opened for', report.cardText.includes('Amy Graham')],

  /*
   * The page must look exactly as it did before the extension touched it. The
   * comparison panel was pinned to the right edge and the body was narrowed to
   * make room for it; both are gone, and nothing else may take their place.
   */
  ['no panel pinned to the page edge', report.panelsPinnedToEdge === 0],
  ['the extension did not reflow the page', report.layout.bodyPaddingRight === '(none)'],
  ['the extension did not make the page scroll sideways', !report.layout.horizontalOverflow],
];

console.log('');
let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed++;
}

if (failed > 0) {
  console.error(
    `\n${failed} check(s) failed — the extension does not work when loaded as an extension.`,
  );

  const relevant = stderr
    .split('\n')
    .filter((l) => /CONSOLE|anifest|CSP|Content Security|Refused|Denied|not allowed/i.test(l))
    .map((l) => l.replace(/^\[[^\]]+\]\s*/, ''));
  if (relevant.length > 0) {
    console.error('\nChrome said:\n' + relevant.slice(0, 25).join('\n'));
  } else if (stderr.trim()) {
    console.error(
      '\nChrome stderr (first 25 lines):\n' + stderr.split('\n').slice(0, 25).join('\n'),
    );
  }
  process.exit(1);
}
console.log('\nExtension works when loaded as a real extension.');
