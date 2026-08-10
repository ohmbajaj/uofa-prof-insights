import { beforeEach, describe, expect, it, vi } from 'vitest';
import { detectProfessorsGeneric } from '@content/detector-generic';
import { detectProfessors } from '@content/detector';

/**
 * Rebuilt from a real UAccess "Class Schedule" page — the card layout that
 * matches neither the classic grid nor the Student Center result panels.
 * Note the instructor field: two names, natural order, comma separated.
 */
const CLASS_SCHEDULE = `
  <div class="course-card">
    <h2>ECE 201 - Programming 2 <span class="pill">Enrolled</span></h2>
    <div class="units">3.00 Units - Academic Deadlines</div>
    <div class="detail-grid">
      <div><span class="label">Class Nbr</span><span class="value">42741</span></div>
      <div><span class="label">Section</span><span class="value">001</span></div>
      <div><span class="label">Component</span><span class="value">Lecture</span></div>
    </div>
    <div class="meta-row">
      <span class="meta"><i class="icon-date"></i>8/24/26 - 12/9/26</span>
      <span class="meta"><i class="icon-time"></i>TuTh 11:00AM - 12:15PM</span>
      <span class="meta"><i class="icon-place"></i>Gittings Bldg, Rm 201</span>
      <span class="meta"><i class="icon-person"></i><span class="instructors">Ratchaneekorn Thamvichai, Na Liu</span></span>
    </div>
    <button>VIEW MORE DETAILS</button>
  </div>
  <div class="course-card">
    <h2>ECE 274A - Digital Logic <span class="pill">Enrolled</span></h2>
    <div class="detail-grid">
      <div><span class="label">Class Nbr</span><span class="value">30295</span></div>
    </div>
    <div class="meta-row">
      <span class="meta"><i class="icon-place"></i>M Pacheco ILC, Rm 130</span>
      <span class="meta"><i class="icon-person"></i><span class="instructors">Ratchaneekorn Thamvichai</span></span>
    </div>
  </div>`;

beforeEach(() => {
  document.body.innerHTML = '';
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

describe('detectProfessorsGeneric — Class Schedule cards', () => {
  it('finds both instructors in a shared field', () => {
    document.body.innerHTML = CLASS_SCHEDULE;
    const found = detectProfessorsGeneric(document);

    expect(found.map((p) => p.name)).toContain('Ratchaneekorn Thamvichai');
    expect(found.map((p) => p.name)).toContain('Na Liu');
  });

  /** The bug this whole format flag exists to prevent. */
  it('never invents "Na Thamvichai" from the comma', () => {
    document.body.innerHTML = CLASS_SCHEDULE;
    expect(detectProfessorsGeneric(document).map((p) => p.name)).not.toContain('Na Thamvichai');
  });

  it('attributes each instructor to its own course', () => {
    document.body.innerHTML = CLASS_SCHEDULE;
    const found = detectProfessorsGeneric(document);

    expect(found.find((p) => p.name === 'Na Liu')?.courseCode).toBe('ECE201');
    const second = found.filter((p) => p.courseCode === 'ECE274A');
    expect(second).toHaveLength(1);
  });

  it('does not badge the room, the dates or the button', () => {
    document.body.innerHTML = CLASS_SCHEDULE;
    const names = detectProfessorsGeneric(document).map((p) => p.name);

    expect(names).not.toContain('Gittings Bldg');
    expect(names).not.toContain('VIEW MORE DETAILS');
    expect(names.some((n) => /\d/.test(n))).toBe(false);
  });
});

describe('detectProfessorsGeneric — real Student Center markup shapes', () => {
  /**
   * The shape actually used by studentcenter.arizona.edu: an icon element
   * followed by a bare text node, with no wrapper around the name. Scanning
   * whole elements misses this, which is why detection walks text nodes.
   */
  it('finds a name sitting as a bare text node beside an icon', () => {
    document.body.innerHTML = `
      <div class="card">
        <h2>ECE 201 - Programming 2</h2>
        <div class="meta">
          <span><i class="icon-place"></i>Gittings Bldg, Rm 201</span>
          <span><i class="icon-person"></i>Ratchaneekorn Thamvichai, Na Liu</span>
        </div>
      </div>`;

    const names = detectProfessorsGeneric(document).map((p) => p.name);
    expect(names).toEqual(['Ratchaneekorn Thamvichai', 'Na Liu']);
  });

  it('anchors the badge on the element holding the text', () => {
    document.body.innerHTML = `
      <div class="card">ECE 201
        <span class="who"><i></i>Ratchaneekorn Thamvichai</span>
      </div>`;

    expect(detectProfessorsGeneric(document)[0]?.element.className).toBe('who');
  });

  it('is not fooled by the room, which also follows an icon', () => {
    document.body.innerHTML = `
      <div class="card">ECE 201
        <span><i></i>M Pacheco ILC, Rm 130</span>
      </div>`;

    expect(detectProfessorsGeneric(document)).toEqual([]);
  });

  it('ignores the meeting pattern beside its icon', () => {
    document.body.innerHTML = `
      <div class="card">ECE 274A
        <span><i></i>MoWeFr 12:00PM - 12:50PM</span>
      </div>`;

    expect(detectProfessorsGeneric(document)).toEqual([]);
  });
});

describe('detectProfessorsGeneric — restraint', () => {
  it('ignores names with no course code nearby', () => {
    document.body.innerHTML = `
      <div class="profile"><span>Ohm Bajaj</span></div>
      <div class="advisor"><span>Jane Roe</span></div>`;
    expect(detectProfessorsGeneric(document)).toEqual([]);
  });

  it('ignores navigation and headers even beside a course code', () => {
    document.body.innerHTML = `
      <nav><span>Academic Record</span><span>Financial Aid</span></nav>
      <header><span>Student Center</span></header>
      <div>ECE 201</div>`;
    expect(detectProfessorsGeneric(document)).toEqual([]);
  });

  it('ignores our own injected UI', () => {
    document.body.innerHTML = `
      <div class="card">ECE 201
        <upi-card><span>Rick Mercer</span></upi-card>
      </div>`;
    expect(detectProfessorsGeneric(document)).toEqual([]);
  });

  it('skips placeholders', () => {
    document.body.innerHTML = `
      <div class="card">CSC 110
        <div class="meta"><span class="instructors">To Be Announced</span></div>
      </div>`;
    expect(detectProfessorsGeneric(document)).toEqual([]);
  });

  /**
   * "Class Nbr" is two capitalised words with no digits — structurally
   * identical to "Rick Mercer". Shape alone cannot separate them.
   */
  it.each([
    'Class Nbr',
    'Digital Logic',
    'Academic Deadlines',
    'Financial Aid',
    'Academic Record',
    'Weekly View',
    'Student Center',
    'Meeting Information',
    'Applied Mathematics',
  ])('rejects the interface label %s', (label) => {
    document.body.innerHTML = `
      <div class="card">ECE 201
        <div class="meta"><span>${label}</span></div>
      </div>`;
    expect(detectProfessorsGeneric(document)).toEqual([]);
  });

  it('still accepts a real name made of uncommon words', () => {
    document.body.innerHTML = `
      <div class="card">ECE 201
        <div class="meta"><span>Ratchaneekorn Thamvichai</span></div>
      </div>`;
    expect(detectProfessorsGeneric(document).map((p) => p.name)).toEqual([
      'Ratchaneekorn Thamvichai',
    ]);
  });

  it('rejects sentences that merely contain capitalised words', () => {
    document.body.innerHTML = `
      <div class="card">CSC 110
        <p>This course provides students with a general introduction to programming.</p>
      </div>`;
    expect(detectProfessorsGeneric(document)).toEqual([]);
  });

  it('does not claim both a wrapper and its inner element', () => {
    document.body.innerHTML = `
      <div class="card">ECE 201
        <div class="outer"><span class="inner">Ratchaneekorn Thamvichai</span></div>
      </div>`;
    expect(detectProfessorsGeneric(document)).toHaveLength(1);
  });

  it('accepts particles and apostrophes in surnames', () => {
    document.body.innerHTML = `
      <div class="card">CSC 110
        <div class="meta"><span>Elizabeth van Horn</span></div>
        <div class="meta"><span>Sean O'Brien</span></div>
      </div>`;
    const names = detectProfessorsGeneric(document).map((p) => p.name);

    expect(names).toContain('Elizabeth van Horn');
    expect(names).toContain("Sean O'Brien");
  });
});

describe('detector dispatch', () => {
  const CLASSIC = `
    <table id="CLASS_SRCH_WRK2_STRM$scroll$0">
      <tr><th id="CLASS_SRCH_WRK2_STRM_INSTRUCTOR$0">Instructor</th></tr>
      <tr><td>CSC 110</td><td id="MTG_INSTR$0">Mercer, Richard</td></tr>
    </table>`;

  it('prefers the classic detector and never falls through', () => {
    document.body.innerHTML = CLASSIC;
    const found = detectProfessors(document);

    // Surname-first parsing, not the generic path's natural-order reading.
    expect(found.map((p) => p.name)).toEqual(['Richard Mercer']);
  });

  it('falls back to generic when no known layout matches', () => {
    document.body.innerHTML = CLASS_SCHEDULE;
    expect(detectProfessors(document).length).toBeGreaterThan(0);
  });

  it('finds nothing on a page with no classes at all', () => {
    document.body.innerHTML = '<main><h1>UAccess Student Center</h1></main>';
    expect(detectProfessors(document)).toEqual([]);
  });
});
