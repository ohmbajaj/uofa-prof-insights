import { normalizeCourseCode, normalizeNameForRMP } from '@shared/utils';
import { extractNameLines, isRealInstructor } from './detector-classic';
import type { DetectedProfessor } from './detector';

/**
 * Detection for the new UAccess Student Center class search.
 *
 * Markup is class-based rather than id-based here, and each `.resultPanel`
 * holds one course with any number of sections beneath it.
 */
const RESULT_PANEL_SELECTOR = 'div.resultPanel';
const INSTRUCTOR_SELECTOR = 'div.instructor';

export function detectProfessorsNew(doc: Document): DetectedProfessor[] {
  const panels = doc.querySelectorAll<HTMLElement>(RESULT_PANEL_SELECTOR);
  const found: DetectedProfessor[] = [];

  for (const panel of panels) {
    // Every section inside a result panel belongs to the panel's course.
    const courseCode =
      normalizeCourseCode(panel.querySelector('.courseCode')?.textContent ?? null) ?? undefined;

    for (const element of panel.querySelectorAll<HTMLElement>(INSTRUCTOR_SELECTOR)) {
      // Apply the classic table's placeholder filtering. A "Staff" section is
      // just as unsearchable here.
      for (const rawName of extractNameLines(element)) {
        if (!isRealInstructor(rawName)) continue;
        found.push({
          element,
          name: normalizeNameForRMP(rawName),
          rawName,
          ...(courseCode ? { courseCode } : {}),
        });
      }
    }
  }

  if (found.length > 0) {
    console.info(
      `[UPI] new detector found ${found.length} instructor(s) across ${panels.length} panel(s):`,
      found.map((p) => p.name),
    );
  }
  return found;
}
