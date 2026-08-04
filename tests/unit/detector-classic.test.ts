import { beforeEach, describe, expect, it, vi } from 'vitest';
import { detectProfessorsClassic, extractNameLines } from '@content/detector-classic';

const HEADER = `
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
  </tr>`;

/** Body row matching the real UAccess markup: date + times share a colspan=2 cell. */
function row(instructorCell: string, index = 0): string {
  return `
  <tr id="trCLASS_SRCH_WRK2_STRM$0_row${index + 1}" valign="center">
    <td align="left">CSC 110</td>
    <td align="left">001</td>
    <td align="right">71613</td>
    <td align="left">Regular Academic Session</td>
    <td align="left" colspan="2">08/21/2023 - 12/06/2023<br>MWF 9:00AM - 9:50AM</td>
    <td align="left">Harvill Bldg, Rm 101</td>
    <td align="right">4.000</td>
    ${instructorCell}
  </tr>`;
}

function build(rows: string, tableIndex = 0): Document {
  document.body.innerHTML = `
    <table id="CLASS_SRCH_WRK2_STRM$scroll$${tableIndex}">
      ${HEADER}
      ${rows}
    </table>`;
  return document;
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

describe('detectProfessorsClassic', () => {
  it('finds the instructor in a standard results row', () => {
    const doc = build(row('<td align="left" id="MTG_INSTR$0">Mercer, Richard</td>'));
    const found = detectProfessorsClassic(doc);

    expect(found).toHaveLength(1);
    expect(found[0]?.name).toBe('Richard Mercer');
    expect(found[0]?.rawName).toBe('Mercer, Richard');
    expect(found[0]?.element.id).toBe('MTG_INSTR$0');
  });

  it('finds instructors across several rows', () => {
    const doc = build(
      [
        row('<td align="left" id="MTG_INSTR$0">Mercer, Richard</td>', 0),
        row('<td align="left" id="MTG_INSTR$1">Debray, Saumya</td>', 1),
        row('<td align="left" id="MTG_INSTR$2">O\'Brien, Sean</td>', 2),
      ].join(''),
    );

    expect(detectProfessorsClassic(doc).map((p) => p.name)).toEqual([
      'Richard Mercer',
      'Saumya Debray',
      "Sean O'Brien",
    ]);
  });

  it('finds instructors across multiple course tables', () => {
    document.body.innerHTML = `
      <table id="CLASS_SRCH_WRK2_STRM$scroll$0">${HEADER}
        ${row('<td id="MTG_INSTR$0">Mercer, Richard</td>')}
      </table>
      <table id="CLASS_SRCH_WRK2_STRM$scroll$1">${HEADER}
        ${row('<td id="MTG_INSTR$1">Debray, Saumya</td>')}
      </table>`;

    expect(detectProfessorsClassic(document).map((p) => p.name)).toEqual([
      'Richard Mercer',
      'Saumya Debray',
    ]);
  });

  it('skips Staff', () => {
    const doc = build(row('<td align="left" id="MTG_INSTR$0">Staff</td>'));
    expect(detectProfessorsClassic(doc)).toEqual([]);
  });

  it.each(['TBA', 'TBD', 'To Be Announced', 'staff', '  Staff  '])('skips %s', (placeholder) => {
    const doc = build(row(`<td align="left" id="MTG_INSTR$0">${placeholder}</td>`));
    expect(detectProfessorsClassic(doc)).toEqual([]);
  });

  it('skips an empty instructor cell', () => {
    const doc = build(row('<td align="left" id="MTG_INSTR$0"></td>'));
    expect(detectProfessorsClassic(doc)).toEqual([]);
  });

  it('keeps real instructors while dropping Staff in the same table', () => {
    const doc = build(
      [
        row('<td id="MTG_INSTR$0">Mercer, Richard</td>', 0),
        row('<td id="MTG_INSTR$1">Staff</td>', 1),
        row('<td id="MTG_INSTR$2">Debray, Saumya</td>', 2),
      ].join(''),
    );
    expect(detectProfessorsClassic(doc).map((p) => p.name)).toEqual([
      'Richard Mercer',
      'Saumya Debray',
    ]);
  });

  it('returns an empty array when the results table is absent', () => {
    document.body.innerHTML = '<div>No results</div>';
    expect(detectProfessorsClassic(document)).toEqual([]);
  });

  it('ignores tables that are not class search results', () => {
    document.body.innerHTML = `<table id="SOME_OTHER_TABLE">${HEADER}
      ${row('<td id="MTG_INSTR$0">Mercer, Richard</td>')}</table>`;
    expect(detectProfessorsClassic(document)).toEqual([]);
  });

  it('never treats the header row as data', () => {
    const doc = build('');
    expect(detectProfessorsClassic(doc)).toEqual([]);
  });
});

describe('detectProfessorsClassic — colspan handling', () => {
  it('resolves the instructor column by colspan when the id is missing', () => {
    // Real UAccess merges Start/End Date and Days & Times into one colspan=2
    // cell, so the instructor <td> is at child index 7 while the Instructor
    // <th> is at index 8. A naive index lookup would return "4.000" (Units).
    const doc = build(row('<td align="left">Mercer, Richard</td>'));
    const found = detectProfessorsClassic(doc);

    expect(found).toHaveLength(1);
    expect(found[0]?.rawName).toBe('Mercer, Richard');
    expect(found[0]?.rawName).not.toBe('4.000');
  });

  it('returns nothing when neither the id nor the header is present', () => {
    document.body.innerHTML = `
      <table id="CLASS_SRCH_WRK2_STRM$scroll$0">
        <tr><th>Class</th><th>Units</th></tr>
        <tr><td>CSC 110</td><td>4.000</td></tr>
      </table>`;
    expect(detectProfessorsClassic(document)).toEqual([]);
  });
});

describe('extractNameLines', () => {
  // A bare <td> in innerHTML is discarded by the HTML parser (foster
  // parenting), so the cell has to be built inside a real table.
  function cell(inner: string): HTMLElement {
    document.body.innerHTML = `<table><tr><td>${inner}</td></tr></table>`;
    return document.querySelector('td')!;
  }

  it('splits a cell listing two instructors on <br>', () => {
    expect(extractNameLines(cell('Mercer, Richard<br>Debray, Saumya'))).toEqual([
      'Mercer, Richard',
      'Debray, Saumya',
    ]);
  });

  it('collapses whitespace and drops blank lines', () => {
    expect(extractNameLines(cell('  Mercer,   Richard  <br><br> '))).toEqual(['Mercer, Richard']);
  });

  it('returns a single entry for a plain cell', () => {
    expect(extractNameLines(cell('Mercer, Richard'))).toEqual(['Mercer, Richard']);
  });

  it('returns nothing for an empty cell', () => {
    expect(extractNameLines(cell(''))).toEqual([]);
  });
});

describe('detectProfessorsClassic — multiple instructors per cell', () => {
  it('emits one entry per instructor', () => {
    const doc = build(row('<td id="MTG_INSTR$0">Mercer, Richard<br>Debray, Saumya</td>'));
    const found = detectProfessorsClassic(doc);

    expect(found.map((p) => p.name)).toEqual(['Richard Mercer', 'Saumya Debray']);
    // Both anchor to the same cell.
    expect(found[0]?.element).toBe(found[1]?.element);
  });

  it('drops only the placeholder when a cell mixes Staff with a real name', () => {
    const doc = build(row('<td id="MTG_INSTR$0">Staff<br>Mercer, Richard</td>'));
    expect(detectProfessorsClassic(doc).map((p) => p.name)).toEqual(['Richard Mercer']);
  });
});
