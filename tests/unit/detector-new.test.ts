import { beforeEach, describe, expect, it, vi } from 'vitest';
import { detectProfessorsNew } from '@content/detector-new';

/** Mirrors the real Student Center markup. */
function panel(instructorBlocks: string, id = 'CSCResult1'): string {
  return `
  <div id="${id}" class="resultPanel collapsible">
    <div class="courseTitle">
      <div class="courseCode">CSC 110</div>
      <div class="courseName">Principles of Programming with Python</div>
    </div>
    <div class="panel-body">
      <div id="${id}_couReqDesc" class="courseDesc">Description: ...</div>
      <div class="sectionHeading" id="${id}_SECTIONINFO">
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
          ${instructorBlocks}
        </div>
      </div>
    </div>
  </div>`;
}

function instructors(...names: string[]): string {
  return `<div class="classInstructors">${names
    .map((n) => `<div class="instructor">${n}</div>`)
    .join('')}</div>`;
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

describe('detectProfessorsNew', () => {
  it('finds the instructor in a result panel', () => {
    document.body.innerHTML = panel(instructors('Mercer, Richard'));
    const found = detectProfessorsNew(document);

    expect(found).toHaveLength(1);
    expect(found[0]?.name).toBe('Richard Mercer');
    expect(found[0]?.rawName).toBe('Mercer, Richard');
    expect(found[0]?.element.className).toBe('instructor');
  });

  it('finds several instructors within one panel', () => {
    document.body.innerHTML = panel(instructors('Mercer, Richard', 'Debray, Saumya'));

    expect(detectProfessorsNew(document).map((p) => p.name)).toEqual([
      'Richard Mercer',
      'Saumya Debray',
    ]);
  });

  it('finds instructors across several panels', () => {
    document.body.innerHTML =
      panel(instructors('Mercer, Richard'), 'CSCResult1') +
      panel(instructors('Debray, Saumya'), 'CSCResult2');

    expect(detectProfessorsNew(document).map((p) => p.name)).toEqual([
      'Richard Mercer',
      'Saumya Debray',
    ]);
  });

  it('anchors each professor to its own instructor div', () => {
    document.body.innerHTML = panel(instructors('Mercer, Richard', 'Debray, Saumya'));
    const found = detectProfessorsNew(document);

    expect(found[0]?.element).not.toBe(found[1]?.element);
  });

  it('skips Staff', () => {
    document.body.innerHTML = panel(instructors('Staff'));
    expect(detectProfessorsNew(document)).toEqual([]);
  });

  it.each(['TBA', 'TBD', 'To Be Announced', 'Not Available'])('skips %s', (placeholder) => {
    document.body.innerHTML = panel(instructors(placeholder));
    expect(detectProfessorsNew(document)).toEqual([]);
  });

  it('keeps a real instructor listed alongside Staff', () => {
    document.body.innerHTML = panel(instructors('Staff', 'Mercer, Richard'));
    expect(detectProfessorsNew(document).map((p) => p.name)).toEqual(['Richard Mercer']);
  });

  it('skips an empty instructor div', () => {
    document.body.innerHTML = panel(instructors(''));
    expect(detectProfessorsNew(document)).toEqual([]);
  });

  it('trims surrounding whitespace', () => {
    document.body.innerHTML = panel(
      '<div class="classInstructors"><div class="instructor">\n   Mercer,  Richard \n </div></div>',
    );
    expect(detectProfessorsNew(document)[0]?.name).toBe('Richard Mercer');
  });

  it('returns an empty array when no result panels exist', () => {
    document.body.innerHTML = '<div class="somethingElse">No results</div>';
    expect(detectProfessorsNew(document)).toEqual([]);
  });

  it('ignores instructor divs outside a result panel', () => {
    document.body.innerHTML = '<div class="instructor">Mercer, Richard</div>';
    expect(detectProfessorsNew(document)).toEqual([]);
  });

  it('handles a panel with no instructor block at all', () => {
    document.body.innerHTML = panel('');
    expect(detectProfessorsNew(document)).toEqual([]);
  });
});
