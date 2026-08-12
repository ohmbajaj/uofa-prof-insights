import { NON_INSTRUCTOR_NAMES } from '@shared/constants';
import { normalizeNaturalNameForRMP, parseInstructorField } from '@shared/utils';
import type { DetectedProfessor } from './detector';

/**
 * Last-resort detector for UAccess layouts we have not seen.
 *
 * UAccess ships several class views, including the classic search grid,
 * Student Center result panels, and the card-based Class Schedule. The first
 * two have dedicated detectors keyed on real
 * ids and classes. This one runs only when both find nothing, and infers
 * instructors from structure instead.
 *
 * It is deliberately hard to satisfy, because a wrong badge is worse than no
 * badge. A candidate must clear every one of these:
 *
 *   - live inside a block that also contains a course code ("ECE 201"), which
 *     keeps it away from nav bars, headers and account menus
 *   - be the entire text of its own element, not a fragment of a sentence
 *   - look like a person's name: 2-4 capitalised words, no digits
 *   - not be a known placeholder ("Staff", "To be Announced")
 *
 * Even then the lookup can still return nothing, in which case the badge shows
 * a grey N/A rather than a wrong rating.
 */

/** A subject code followed by a number, such as "ECE 201" or "CSC 110". */
const COURSE_CODE = /\b[A-Z]{2,5}\s?\d{3}[A-Z]?\b/;

/**
 * A plausible person name: two to four capitalised words.
 *
 * Allows internal apostrophes and hyphens ("O'Brien", "Smith-Jones") and
 * accented letters, and permits a lowercase particle ("van", "de") in the
 * middle of a surname.
 */
const PERSON_NAME =
  /^\p{Lu}[\p{L}'’-]+(?:\s+(?:van|von|de|del|della|di|da|du|la|le|of|bin|al)\s+|\s+)(?:\p{Lu}[\p{L}'’-]+)(?:\s+\p{Lu}[\p{L}'’-]+){0,2}$/u;

/**
 * Vocabulary that appears in UAccess chrome rather than in names.
 *
 * A shape test alone is not enough: "Class Nbr", "Digital Logic" and
 * "Academic Deadlines" are all two capitalised words with no digits, exactly
 * like "Rick Mercer". A candidate is rejected when *every* one of its words is
 * drawn from this list, which keeps labels and course titles out while leaving
 * real names intact because surnames are rarely common interface words.
 */
const UI_VOCABULARY = new Set(
  `academic add advanced advising aerospace aid algebra algorithms american analysis ancient
   application applied architecture array art artificial basic biology biomedical bldg building
   business calculus calendar campus capacity career catalog center chemical chemistry civil
   class classes closed cloud communication comparative compiler compilers component composition
   computer computing concepts contemporary course courses credit credits data database databases
   day days deadlines degree description design details differential digital discrete discussion
   distributed drop dropped earth economics edit education electrical elementary end engineering
   enroll enrolled enrollment environment exam experimental fall field film filter final financial
   freshman fundamentals general global grade grades grading graduate graphics hardware help
   history home honors hours human independent industrial information inorganic instruction
   instructor intelligence interaction interface international internship introduction junior lab
   laboratory law learning lecture library life linear list literature location logic machine
   main management materials mathematics mechanical media medicine medieval meeting mobile modern
   more music my natural nbr network networks none number numerical nursing online open operating
   options organic parallel personal pharmacy philosophy physical physics planning points
   practicum prerequisites principles print programming psychology qualitative quantitative quiz
   record records regular requirements research results room schedule science search seat seats
   second section security selected seminar senior session showing social sociology software
   sophomore space special spring staff start statistics status structure structures student
   studies subject summer sustainability swap syllabus systems term textbook theater theatre
   theoretical theory thesis third time times title to topics total transcript undergraduate
   units update view vision waitlist waitlisted web weekly winter withdraw world writing year
   in person mode instruction meeting information session component career campus hybrid remote
   asynchronous synchronous lab lecture discussion open closed full reserved consent permission
   required optional cart shopping select details expand collapse modify results found sections`
    .split(/\s+/)
    .filter(Boolean),
);

/** True when the text is made entirely of interface words. */
function isInterfaceText(text: string): boolean {
  const words = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return true;
  return words.every((w) => UI_VOCABULARY.has(w));
}

/** Regions that never contain a section's instructor. */
const EXCLUDED_ANCESTORS =
  'nav, header, footer, [role="navigation"], [role="banner"], upi-card, upi-filter';

/**
 * How far up to look for a course code before giving up.
 *
 * Generous, because this runs against single-page apps: studentcenter's class
 * cards nest the instructor a dozen levels below the heading that carries the
 * course code, through layout wrappers that contribute nothing but depth. Six
 * hops is plenty for hand-written markup and far too few for a framework's.
 * The stop-at-BODY guard is what actually bounds the search.
 */
const MAX_ANCESTOR_HOPS = 15;

function looksLikePerson(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 5 || trimmed.length > 60) return false;
  if (/\d/.test(trimmed)) return false;
  if (NON_INSTRUCTOR_NAMES.has(trimmed.toLowerCase())) return false;
  if (isInterfaceText(trimmed)) return false;
  if (PERSON_NAME.test(trimmed)) return true;

  // Responsive UAccess can lead with a formal initial: "C. Douglas Haessig".
  // The established expression intentionally rejects punctuation, so handle
  // this registrar-specific shape explicitly without widening every candidate.
  const normalized = normalizeNaturalNameForRMP(trimmed);
  return normalized !== trimmed && PERSON_NAME.test(normalized);
}

/** True when some ancestor within reach also mentions a course code. */
function sitsBesideACourseCode(element: HTMLElement): boolean {
  let current: HTMLElement | null = element.parentElement;

  for (let hop = 0; current && hop < MAX_ANCESTOR_HOPS; hop++) {
    // Guard against scanning the entire page body.
    if (current.tagName === 'BODY') return false;
    if (COURSE_CODE.test(current.textContent ?? '')) return true;
    current = current.parentElement;
  }
  return false;
}

/**
 * Text runs that could be an instructor field, with the element holding them.
 *
 * Scans text nodes rather than elements. Modern UAccess renders an instructor
 * as an icon followed by a bare text node:
 * `<span><i class="icon-person"></i>Ratchaneekorn Thamvichai, Na Liu</span>`.
 * so reading whole elements works only when the name happens to sit in a
 * dedicated wrapper. A text node is the actual unit either way.
 */
export interface TextCandidate {
  element: HTMLElement;
  text: string;
}

export function candidateTextRuns(doc: Document): TextCandidate[] {
  const out: TextCandidate[] = [];
  const walker = doc.createTreeWalker(doc.body ?? doc, NodeFilter.SHOW_TEXT);

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.textContent ?? '').trim().replace(/\s+/g, ' ');
    if (!text || text.length < 5 || text.length > 120) continue;

    const element = node.parentElement;
    if (!element) continue;
    if (element.closest(EXCLUDED_ANCESTORS)) continue;
    // Script and style content is text too.
    if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE') continue;

    out.push({ element, text });
  }

  return out;
}

export function detectProfessorsGeneric(doc: Document): DetectedProfessor[] {
  const found: DetectedProfessor[] = [];
  const claimed = new Set<HTMLElement>();

  for (const { element, text } of candidateTextRuns(doc)) {
    if (claimed.has(element)) continue;

    // Modern UAccess views write names in natural order, several to a field.
    const names = parseInstructorField(text, 'natural-list');
    if (names.length === 0) continue;
    if (!names.every(looksLikePerson)) continue;
    if (!sitsBesideACourseCode(element)) continue;

    claimed.add(element);
    const courseCode = courseCodeNear(element);

    for (const rawName of names) {
      const name = normalizeNaturalNameForRMP(rawName);
      found.push({
        element,
        name,
        rawName: text,
        // Inferred from structure, so the badge is withdrawn if nobody matches.
        speculative: true,
        ...(courseCode ? { courseCode } : {}),
      });
    }
  }

  if (found.length > 0) {
    console.info(
      `[UPI] generic detector found ${found.length} instructor(s):`,
      found.map((p) => p.name),
    );
  }
  return found;
}

/** The nearest course code above this element, normalized for RMP comparison. */
function courseCodeNear(element: HTMLElement): string | undefined {
  let current: HTMLElement | null = element.parentElement;

  for (let hop = 0; current && hop < MAX_ANCESTOR_HOPS; hop++) {
    if (current.tagName === 'BODY') break;
    const hit = COURSE_CODE.exec(current.textContent ?? '');
    if (hit) return hit[0].replace(/\s+/g, '').toUpperCase();
    current = current.parentElement;
  }
  return undefined;
}
