import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DETECT_DEBOUNCE_MS, detectProfessors, startDetector } from '@content/detector';
import type { DetectedProfessor } from '@content/detector';

const CLASSIC = `
  <table id="CLASS_SRCH_WRK2_STRM$scroll$0">
    <tr><th id="CLASS_SRCH_WRK2_STRM_INSTRUCTOR$0">Instructor</th></tr>
    <tr><td id="MTG_INSTR$0">Mercer, Richard</td></tr>
  </table>`;

const NEW = `
  <div class="resultPanel">
    <div class="classInstructors"><div class="instructor">Debray, Saumya</div></div>
  </div>`;

/** Real timers: MutationObserver delivers on a microtask that fake timers don't drive. */
const settle = () => new Promise((r) => setTimeout(r, DETECT_DEBOUNCE_MS + 80));

let stop: (() => void) | null = null;

beforeEach(() => {
  document.body.innerHTML = '';
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  stop?.();
  stop = null;
  vi.restoreAllMocks();
});

describe('detectProfessors', () => {
  it('finds classic results', () => {
    document.body.innerHTML = CLASSIC;
    expect(detectProfessors(document).map((p) => p.name)).toEqual(['Richard Mercer']);
  });

  it('finds new Student Center results', () => {
    document.body.innerHTML = NEW;
    expect(detectProfessors(document).map((p) => p.name)).toEqual(['Saumya Debray']);
  });

  it('covers a page containing both layouts', () => {
    document.body.innerHTML = CLASSIC + NEW;
    expect(detectProfessors(document).map((p) => p.name)).toEqual([
      'Richard Mercer',
      'Saumya Debray',
    ]);
  });

  it('returns nothing on an unrelated page', () => {
    document.body.innerHTML = '<main><h1>UAccess Home</h1></main>';
    expect(detectProfessors(document)).toEqual([]);
  });
});

describe('startDetector', () => {
  it('reports professors already on the page, synchronously', () => {
    document.body.innerHTML = CLASSIC;
    const onDetect = vi.fn();

    stop = startDetector(document, onDetect);

    expect(onDetect).toHaveBeenCalledTimes(1);
    expect(onDetect.mock.calls[0]?.[0].map((p: DetectedProfessor) => p.name)).toEqual([
      'Richard Mercer',
    ]);
  });

  it('re-detects when results are added later', async () => {
    const onDetect = vi.fn();
    stop = startDetector(document, onDetect);
    expect(onDetect).toHaveBeenCalledTimes(1);

    document.body.innerHTML = CLASSIC;
    await settle();

    expect(onDetect).toHaveBeenCalledTimes(2);
    expect(onDetect.mock.lastCall?.[0].map((p: DetectedProfessor) => p.name)).toEqual([
      'Richard Mercer',
    ]);
  });

  it('debounces a burst of mutations into a single pass', async () => {
    const onDetect = vi.fn();
    stop = startDetector(document, onDetect);
    onDetect.mockClear();

    for (let i = 0; i < 10; i++) {
      document.body.appendChild(document.createElement('div'));
    }
    await settle();

    expect(onDetect).toHaveBeenCalledTimes(1);
  });

  it('picks up a second search replacing the first', async () => {
    document.body.innerHTML = CLASSIC;
    const onDetect = vi.fn();
    stop = startDetector(document, onDetect);

    document.body.innerHTML = NEW;
    await settle();

    expect(onDetect.mock.lastCall?.[0].map((p: DetectedProfessor) => p.name)).toEqual([
      'Saumya Debray',
    ]);
  });

  it('ignores mutations that only add our own badges', async () => {
    document.body.innerHTML = CLASSIC;
    const onDetect = vi.fn();
    stop = startDetector(document, onDetect);
    onDetect.mockClear();

    // Simulates the injector: without the self-mutation guard this would
    // retrigger detection, which would inject again, forever.
    document.querySelector('#MTG_INSTR\\$0')?.appendChild(document.createElement('upi-badge'));
    await settle();

    expect(onDetect).not.toHaveBeenCalled();
  });

  it('stops reporting once the disposer runs', async () => {
    const onDetect = vi.fn();
    stop = startDetector(document, onDetect);
    onDetect.mockClear();

    stop();
    stop = null;
    document.body.innerHTML = CLASSIC;
    await settle();

    expect(onDetect).not.toHaveBeenCalled();
  });

  it('survives a callback that throws', async () => {
    const onDetect = vi.fn(() => {
      throw new Error('boom');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      stop = startDetector(document, onDetect);
    }).not.toThrow();

    document.body.innerHTML = CLASSIC;
    await settle();

    // Still observing after the throw.
    expect(onDetect).toHaveBeenCalledTimes(2);
  });
});
