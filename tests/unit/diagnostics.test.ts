import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectDiagnostics } from '@content/diagnostics';

const CLASSIC = `
  <table id="CLASS_SRCH_WRK2_STRM$scroll$0">
    <tr><th id="CLASS_SRCH_WRK2_STRM_INSTRUCTOR$0">Instructor</th></tr>
    <tr><td>CSC 110</td><td id="MTG_INSTR$0">Mercer, Richard</td></tr>
  </table>`;

const SCHEDULE = `
  <div class="card">
    <h2>ECE 201 - Programming 2</h2>
    <span class="who"><i></i>Ratchaneekorn Thamvichai, Na Liu</span>
  </div>`;

beforeEach(() => {
  document.body.innerHTML = '';
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

describe('collectDiagnostics', () => {
  it('reports which detector matched', () => {
    document.body.innerHTML = CLASSIC;
    const report = collectDiagnostics(document);

    expect(report.classicCount).toBe(1);
    expect(report.newCount).toBe(0);
    expect(report.genericCount).toBe(0);
    expect(report.names).toEqual(['Richard Mercer']);
  });

  it('reports the generic detector when it is the one that fired', () => {
    document.body.innerHTML = SCHEDULE;
    const report = collectDiagnostics(document);

    expect(report.genericCount).toBe(2);
    expect(report.names).toEqual(['Ratchaneekorn Thamvichai', 'Na Liu']);
  });

  it('includes a DOM path so a selector can be written from the report', () => {
    document.body.innerHTML = SCHEDULE;
    const [sample] = collectDiagnostics(document).samples;

    expect(sample?.path).toContain('span.who');
    expect(sample?.text).toContain('Ratchaneekorn Thamvichai');
  });

  /** The whole point: when nothing matched, show what was almost a name. */
  it('lists name-shaped text that was rejected', () => {
    document.body.innerHTML = `
      <div class="mystery"><span class="x">Jane Q Roe</span></div>`;
    const report = collectDiagnostics(document);

    expect(report.classicCount + report.newCount + report.genericCount).toBe(0);
    expect(report.nearMisses.map((m) => m.text)).toContain('Jane Q Roe');
    expect(report.nearMisses[0]?.path).toContain('span.x');
  });

  it('omits near misses once something was detected', () => {
    document.body.innerHTML = CLASSIC;
    expect(collectDiagnostics(document).nearMisses).toEqual([]);
  });

  it('distinguishes an empty page from an unrecognised one', () => {
    document.body.innerHTML = '';
    const report = collectDiagnostics(document);

    expect(report.textRuns).toBe(0);
    expect(report.names).toEqual([]);
  });

  it('counts badges already in the page', () => {
    document.body.innerHTML = `${CLASSIC}<upi-badge></upi-badge><upi-badge></upi-badge>`;
    expect(collectDiagnostics(document).badgesInPage).toBe(2);
  });

  it('reports the page identity', () => {
    document.body.innerHTML = CLASSIC;
    const report = collectDiagnostics(document);

    expect(report.url).toContain('http');
    expect(typeof report.inFrame).toBe('boolean');
  });
});
