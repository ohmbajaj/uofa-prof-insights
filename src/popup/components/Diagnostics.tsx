import { useCallback, useState } from 'react';
import type { PageDiagnostics } from '@shared/types';

type State =
  | { status: 'idle' }
  | { status: 'busy' }
  | { status: 'done'; report: PageDiagnostics }
  | { status: 'unreachable' }
  | { status: 'failed'; message: string };

/** Human summary of what the report means, so the user is not reading raw counts. */
function verdict(report: PageDiagnostics): { ok: boolean; text: string } {
  const total = report.classicCount + report.newCount + report.genericCount;

  if (total > 0) {
    const which =
      report.classicCount > 0 ? 'classic' : report.newCount > 0 ? 'student center' : 'generic';
    return { ok: true, text: `Found ${total} instructor(s) using the ${which} detector.` };
  }
  if (report.textRuns === 0) {
    return {
      ok: false,
      text: 'The page had no readable text yet — try again once it finishes loading.',
    };
  }
  return {
    ok: false,
    text: 'The extension is running here but recognised no instructors on this page.',
  };
}

/**
 * "Diagnose this page", for when no badges appear.
 *
 * The two causes look identical from the outside — the content script not
 * running, versus its selectors not matching — and they need opposite fixes.
 * Reaching the content script at all already answers the first question.
 */
export default function Diagnostics() {
  const [state, setState] = useState<State>({ status: 'idle' });
  const [copied, setCopied] = useState(false);

  const run = useCallback(async () => {
    setState({ status: 'busy' });
    setCopied(false);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id === undefined) {
        setState({ status: 'unreachable' });
        return;
      }

      const reply = (await chrome.tabs.sendMessage(tab.id, { type: 'DIAGNOSE_PAGE' })) as
        | { type: 'DIAGNOSTICS'; diagnostics: PageDiagnostics }
        | { type: 'ERROR'; message: string }
        | undefined;

      if (!reply) {
        // No listener answered: the content script is not present on this page.
        setState({ status: 'unreachable' });
        return;
      }
      if (reply.type === 'ERROR') {
        setState({ status: 'failed', message: reply.message });
        return;
      }
      setState({ status: 'done', report: reply.diagnostics });
    } catch {
      // sendMessage throws when nothing is listening in the tab.
      setState({ status: 'unreachable' });
    }
  }, []);

  const copy = useCallback(async () => {
    if (state.status !== 'done') return;
    await navigator.clipboard.writeText(JSON.stringify(state.report, null, 2));
    setCopied(true);
  }, [state]);

  return (
    <>
      <h2 className="section-title">Troubleshooting</h2>
      <p className="field__hint" style={{ marginBottom: 8 }}>
        No badges on a class page? This reports what the extension can see there.
      </p>

      <button
        className="btn"
        type="button"
        onClick={() => void run()}
        disabled={state.status === 'busy'}
      >
        {state.status === 'busy' ? 'Checking…' : 'Diagnose this page'}
      </button>

      {state.status === 'unreachable' && (
        <p className="notice notice--error" style={{ marginTop: 8 }}>
          The extension isn’t running on this tab. Open a UAccess class page, reload it, then try
          again.
        </p>
      )}

      {state.status === 'failed' && (
        <p className="notice notice--error" style={{ marginTop: 8 }}>
          {state.message}
        </p>
      )}

      {state.status === 'done' && (
        <div style={{ marginTop: 8 }}>
          <p className={verdict(state.report).ok ? 'notice' : 'notice notice--error'}>
            {verdict(state.report).text}
          </p>

          <dl className="diag">
            <div>
              <dt>Detected</dt>
              <dd>
                {state.report.classicCount} classic · {state.report.newCount} panels ·{' '}
                {state.report.genericCount} generic
              </dd>
            </div>
            <div>
              <dt>Badges on page</dt>
              <dd>{state.report.badgesInPage}</dd>
            </div>
            <div>
              <dt>In a frame</dt>
              <dd>{state.report.inFrame ? 'yes' : 'no'}</dd>
            </div>
          </dl>

          {state.report.names.length > 0 && (
            <p className="field__hint">Names: {state.report.names.join(', ')}</p>
          )}

          {state.report.nearMisses.length > 0 && (
            <>
              <p className="field__hint" style={{ marginTop: 6 }}>
                Name-shaped text that was not used:
              </p>
              <ul className="diag-list">
                {state.report.nearMisses.slice(0, 6).map((m, i) => (
                  <li key={i}>{m.text}</li>
                ))}
              </ul>
            </>
          )}

          <button
            className="btn"
            type="button"
            onClick={() => void copy()}
            style={{ marginTop: 8 }}
          >
            {copied ? 'Copied' : 'Copy full report'}
          </button>
        </div>
      )}
    </>
  );
}
