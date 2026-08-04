import { NON_INSTRUCTOR_NAMES } from '@shared/constants';
import { normalizeCourseCode, normalizeNameForRMP } from '@shared/utils';
import type { DetectedProfessor } from './detector';

/**
 * Detection for the classic (PeopleSoft "Classic") UAccess class search.
 *
 * A search returns one results table per course, so the ids are suffixed with
 * an instance index — `CLASS_SRCH_WRK2_STRM$scroll$0`, `$scroll$1`, and so on.
 * We match on the prefix rather than the literal `$0` so a multi-course search
 * is fully covered rather than only the first course.
 */
const TABLE_ID_PREFIX = 'CLASS_SRCH_WRK2_STRM$scroll$';
const INSTRUCTOR_TH_PREFIX = 'CLASS_SRCH_WRK2_STRM_INSTRUCTOR$';
const INSTRUCTOR_TD_PREFIX = 'MTG_INSTR$';

function colSpanOf(cell: Element): number {
  const raw = Number.parseInt(cell.getAttribute('colspan') ?? '1', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

/**
 * Grid column occupied by the Instructor header, counting colspans.
 *
 * This is not the same as the header's position among its siblings: UAccess
 * merges "Start/End Date" and "Days & Times" into a single `colspan="2"` cell
 * in the body rows, so the instructor's `<td>` sits one index to the left of
 * its `<th>`. Walking raw child indexes would land on the Units column and
 * badge every row with "4.000".
 */
function instructorColumn(table: HTMLTableElement): number | null {
  const th = table.querySelector(`th[id^="${INSTRUCTOR_TH_PREFIX}"]`);
  const headerRow = th?.parentElement;
  if (!th || !headerRow) return null;

  let column = 0;
  for (const cell of headerRow.children) {
    if (cell === th) return column;
    column += colSpanOf(cell);
  }
  return null;
}

/**
 * Body cell covering `targetColumn`, accounting for colspans.
 *
 * Only `<td>` is eligible: a `<th>` at that position means we are looking at a
 * header row, and returning it would badge the literal text "Instructor".
 */
function cellAtColumn(row: HTMLTableRowElement, targetColumn: number): HTMLElement | null {
  let column = 0;
  for (const cell of row.children) {
    const span = colSpanOf(cell);
    if (targetColumn >= column && targetColumn < column + span) {
      return cell.tagName === 'TD' ? (cell as HTMLElement) : null;
    }
    column += span;
  }
  return null;
}

/**
 * Text content split on `<br>` boundaries.
 *
 * A cell listing two instructors renders as `Mercer, Richard<br>Debray, Saumya`;
 * reading `textContent` alone would yield the single mangled string
 * "Mercer, RichardDebray, Saumya".
 */
export function extractNameLines(element: Element): string[] {
  // `Node.ELEMENT_NODE` by value — the global `Node` is not reliably the same
  // object across realms (iframe documents in particular).
  const ELEMENT_NODE = 1;
  const lines: string[] = [];
  let current = '';

  for (const node of element.childNodes) {
    if (node.nodeType === ELEMENT_NODE && (node as Element).tagName === 'BR') {
      lines.push(current);
      current = '';
    } else {
      current += node.textContent ?? '';
    }
  }
  lines.push(current);

  return lines.map((line) => line.trim().replace(/\s+/g, ' ')).filter(Boolean);
}

export function isRealInstructor(rawName: string): boolean {
  return !NON_INSTRUCTOR_NAMES.has(rawName.trim().toLowerCase());
}

/**
 * Course code for a results row.
 *
 * The classic grid puts it in the first data cell ("CSC 110"). Falls back to
 * the table's own heading, since PeopleSoft repeats the course above each
 * scroll area.
 */
function courseCodeForRow(row: HTMLTableRowElement, table: HTMLTableElement): string | undefined {
  const firstCell = row.querySelector('td');
  const fromCell = normalizeCourseCode(firstCell?.textContent ?? null);
  if (fromCell) return fromCell;

  const heading = table.previousElementSibling?.textContent ?? '';
  return normalizeCourseCode(heading.split(/[-–—]/)[0] ?? null) ?? undefined;
}

function detectInTable(table: HTMLTableElement): DetectedProfessor[] {
  const found: DetectedProfessor[] = [];
  const column = instructorColumn(table);

  for (const row of table.rows) {
    // `row.cells` counts <th> as well as <td>, so it is not a header test.
    // A row with no <td> at all is a header row.
    if (!row.querySelector('td')) continue;

    // The `MTG_INSTR$n` id is the most reliable signal; the colspan-aware
    // column walk is the fallback for rows that lack it.
    const cell =
      row.querySelector<HTMLElement>(`td[id^="${INSTRUCTOR_TD_PREFIX}"]`) ??
      (column === null ? null : cellAtColumn(row, column));
    if (!cell) continue;

    const courseCode = courseCodeForRow(row, table);

    for (const rawName of extractNameLines(cell)) {
      if (!isRealInstructor(rawName)) continue;
      found.push({
        element: cell,
        name: normalizeNameForRMP(rawName),
        rawName,
        ...(courseCode ? { courseCode } : {}),
      });
    }
  }

  return found;
}

export function detectProfessorsClassic(doc: Document): DetectedProfessor[] {
  const tables = doc.querySelectorAll<HTMLTableElement>(`table[id^="${TABLE_ID_PREFIX}"]`);

  const found: DetectedProfessor[] = [];
  for (const table of tables) found.push(...detectInTable(table));

  if (found.length > 0) {
    console.info(
      `[UPI] classic detector found ${found.length} instructor(s) across ${tables.length} table(s):`,
      found.map((p) => p.name),
    );
  }
  return found;
}
