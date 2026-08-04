/**
 * Given-name equivalence, used to reconcile UAccess's formal roster names with
 * the informal names professors are rated under on RateMyProfessors.
 *
 * This exists because of a case found in real data: UAccess lists
 * "Mercer, Richard", but the RMP profile carrying 164 ratings is "Rick Mercer".
 * There is also a separate "Richard Mercer" profile in the same department with
 * a single 1.0 rating. Exact matching alone therefore lands on the noise
 * profile and reports 1.0 for a professor whose actual standing is 2.9.
 */

/** Canonical given name -> the informal forms seen in the wild. */
const NICKNAMES: Record<string, readonly string[]> = {
  albert: ['al', 'bert'],
  alexander: ['alex', 'al', 'xander'],
  andrew: ['andy', 'drew'],
  anthony: ['tony'],
  barbara: ['barb', 'babs'],
  benjamin: ['ben', 'benny'],
  bradley: ['brad'],
  catherine: ['cathy', 'cate', 'katie', 'kate'],
  charles: ['charlie', 'chuck', 'chas'],
  christopher: ['chris', 'topher'],
  cynthia: ['cindy'],
  daniel: ['dan', 'danny'],
  david: ['dave', 'davey'],
  deborah: ['deb', 'debbie', 'debby'],
  donald: ['don', 'donnie'],
  douglas: ['doug'],
  edward: ['ed', 'eddie', 'ted', 'ned'],
  elizabeth: ['liz', 'beth', 'betsy', 'eliza', 'lizzie'],
  eugene: ['gene'],
  frederick: ['fred', 'freddy', 'rick'],
  gregory: ['greg'],
  jacqueline: ['jackie'],
  james: ['jim', 'jimmy', 'jamie'],
  jeffrey: ['jeff'],
  jennifer: ['jen', 'jenny', 'jenn'],
  jonathan: ['jon', 'jonny'],
  joseph: ['joe', 'joey'],
  joshua: ['josh'],
  katherine: ['kathy', 'kate', 'katie', 'kat', 'kay'],
  kenneth: ['ken', 'kenny'],
  kimberly: ['kim'],
  lawrence: ['larry', 'laurie'],
  leonard: ['leo', 'len', 'lenny'],
  margaret: ['maggie', 'meg', 'peggy', 'marge'],
  matthew: ['matt'],
  melissa: ['mel', 'missy'],
  michael: ['mike', 'mikey', 'mick'],
  nicholas: ['nick', 'nicky'],
  pamela: ['pam'],
  patricia: ['pat', 'patty', 'tricia', 'trish'],
  patrick: ['pat', 'paddy'],
  peter: ['pete'],
  philip: ['phil'],
  phillip: ['phil'],
  raymond: ['ray'],
  rebecca: ['becky', 'becca', 'bec'],
  richard: ['rick', 'rich', 'ricky', 'dick', 'richie'],
  robert: ['bob', 'rob', 'bobby', 'robbie'],
  ronald: ['ron', 'ronnie'],
  russell: ['russ'],
  samuel: ['sam', 'sammy'],
  sandra: ['sandy'],
  stephanie: ['steph'],
  stephen: ['steve', 'stevie'],
  steven: ['steve', 'stevie'],
  susan: ['sue', 'susie', 'suzy'],
  theodore: ['ted', 'teddy', 'theo'],
  thomas: ['tom', 'tommy'],
  timothy: ['tim', 'timmy'],
  veronica: ['ronnie'],
  victoria: ['vicky', 'vicki', 'tori'],
  vincent: ['vince', 'vinny'],
  virginia: ['ginny', 'ginger'],
  william: ['will', 'bill', 'billy', 'willie'],
  zachary: ['zach', 'zack'],
};

/**
 * Every known form mapped to the *set* of formal names it can stand for.
 *
 * A set rather than one canonical winner, because short forms are genuinely
 * ambiguous: "Rick" is usually Richard but sometimes Frederick, "Pat" is
 * Patricia or Patrick, "Steve" is Stephen or Steven. An earlier version kept
 * only the first binding, which mapped "Rick" to Frederick purely because it
 * sorted earlier — so Rick never matched Richard, the exact case this module
 * exists to solve.
 */
const FORMS: ReadonlyMap<string, ReadonlySet<string>> = (() => {
  const map = new Map<string, Set<string>>();
  const add = (form: string, canonical: string) => {
    const existing = map.get(form) ?? new Set<string>();
    existing.add(canonical);
    map.set(form, existing);
  };

  for (const [full, nicknames] of Object.entries(NICKNAMES)) {
    add(full, full);
    for (const nickname of nicknames) add(nickname, full);
  }
  return map;
})();

/**
 * Lowercased, accent-free, punctuation-free form used for all name comparisons.
 *
 * Accents are folded so that a roster "Muller" still matches an RMP "Müller",
 * and "O'Brien" matches "OBrien" — both routine differences between a
 * registrar's records and student-entered profiles.
 */
export function comparableName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The formal names a given name could stand for.
 * "rick" -> {richard, frederick}; an unknown name stands only for itself.
 */
export function givenNameForms(first: string): ReadonlySet<string> {
  const key = comparableName(first);
  return FORMS.get(key) ?? new Set([key]);
}

/**
 * True when two given names plausibly belong to the same person.
 *
 * Also treats a bare initial as compatible with a matching full name, since
 * some RMP profiles are created as "R. Mercer".
 *
 * Note that this is deliberately not transitive: "Pat" matches both "Patrick"
 * and "Patricia", but those two never match each other.
 */
export function givenNamesMatch(a: string, b: string): boolean {
  const left = comparableName(a);
  const right = comparableName(b);
  if (!left || !right) return false;
  if (left === right) return true;

  if (left.length === 1 || right.length === 1) {
    return left[0] === right[0];
  }

  const leftForms = givenNameForms(left);
  for (const form of givenNameForms(right)) {
    if (leftForms.has(form)) return true;
  }
  return false;
}

/** Splits a natural-order name into given name and the rest ("Van Horn" stays whole). */
export function splitName(name: string): { first: string; last: string } {
  const parts = comparableName(name).split(' ').filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: '', last: parts[0]! };
  return { first: parts[0]!, last: parts.slice(1).join(' ') };
}
