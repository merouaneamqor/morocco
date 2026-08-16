/**
 * The inline conventions the corpus uses, in one place.
 *
 * Both the remark plugin (which renders them) and the claims extractor (which
 * indexes them) import from here, so the rendered DOM and the Evidence Index
 * can never disagree about what counts as a claim.
 */

/** Bold lead-ins that open a graded claim. */
export const CLAIM_LEAD_INS = [
  'Established',
  'Highly probable',
  'Disputed',
  'Unknown',
  'Contested',
  'Status',
];

/**
 * Map a lead-in word to a ClaimStatus. `Contested` and `Status:` are corpus
 * conventions that are not themselves statuses:
 *   - `Contested:` introduces a dispute → Disputed.
 *   - `Status:` introduces a stated status; the value follows in the text, so
 *     it is captured but left ungraded until the value is read.
 */
export const LEAD_IN_TO_STATUS = {
  Established: 'Established',
  'Highly probable': 'Highly probable',
  Disputed: 'Disputed',
  Unknown: 'Unknown',
  Contested: 'Disputed',
  Status: null,
};

/**
 * Prose variants the long-form pages use in place of the bare lead-in.
 *
 * This is an explicit table rather than a fuzzy "starts with a status word"
 * match, because fuzzy matching would silently grade sentences the corpus
 * never intended as claim markers — and a wrongly graded claim is worse than
 * an ungraded one. Every entry here was read in the source before being added.
 *
 * `withheldFlag` marks phrasings that assert withholding rather than a
 * confidence level; those set the flag and leave the status alone.
 */
export const CLAIM_LEAD_IN_ALIASES = {
  'Well established': 'Established',
  'Established but contested in interpretation': 'Established',
  'Genuinely unknown': 'Unknown',
  'Systematically reliable on': 'Established',
  'Reliable on': 'Established',
  'Systematically unreliable on': 'Disputed',
  'Unreliable on': 'Disputed',
  // A court finding is documented and is graded as such. What the finding
  // establishes is that the court found it — not that the underlying account
  // is settled, which the dossier prose states separately.
  'Judicial finding': 'Established',
  // Competing attributions in circulation, none demonstrated. This is the
  // corpus's own phrasing for a dispute, so it grades as Disputed rather than
  // Unknown: the versions exist and are recorded.
  'Alleged and unproven': 'Disputed',
  Alleged: 'Disputed',
};

/** Phrasings that raise the Withheld flag rather than grading confidence. */
export const WITHHELD_LEAD_INS = [
  'Withheld rather than unknown — a different category',
  'Withheld rather than unknown',
  'Withheld',
];

/** Every recognised lead-in, canonical and aliased, longest first so that
 *  "Established but contested in interpretation" wins over "Established". */
export const ALL_LEAD_INS = [
  ...WITHHELD_LEAD_INS,
  ...Object.keys(CLAIM_LEAD_IN_ALIASES),
  ...CLAIM_LEAD_INS,
].sort((a, b) => b.length - a.length);

/** Resolve any recognised lead-in to { status, withheld }. */
export function resolveLeadIn(raw) {
  const text = String(raw).trim().replace(/[.:]$/, '').trim();
  const hit = (list) => list.find((k) => k.toLowerCase() === text.toLowerCase());

  const w = hit(WITHHELD_LEAD_INS);
  if (w) return { canonical: w, status: null, withheld: true };

  const alias = hit(Object.keys(CLAIM_LEAD_IN_ALIASES));
  if (alias) {
    return { canonical: alias, status: CLAIM_LEAD_IN_ALIASES[alias], withheld: false };
  }

  const exact = hit(CLAIM_LEAD_INS);
  if (exact) return { canonical: exact, status: LEAD_IN_TO_STATUS[exact], withheld: false };

  return null;
}

/** Matches `**Established:**` and friends at the start of a paragraph. */
export const CLAIM_LEAD_IN_RE = new RegExp(
  `^(${ALL_LEAD_INS.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*[.:]?\\s*$`,
  'i'
);

/** The literal unverified-reference token, as inline code. */
export const NOT_YET_VERIFIED = 'ARCHIVAL REFERENCE NOT YET VERIFIED';

export const VERIFICATION_TOKENS = [
  'Consulted directly',
  'Catalogue verified',
  'Cited by named scholar',
  'Described by named scholar',
  'Reported',
  'NOT YET VERIFIED',
  NOT_YET_VERIFIED,
];

export const TIER_TOKENS = [
  'PRIMARY_ARCHIVAL',
  'PRIMARY_CONTEMPORARY',
  'OFFICIAL',
  'ACADEMIC',
  'SECONDARY',
  'ENCYCLOPEDIC',
  'JOURNALISTIC',
  'UNSOURCED',
];

/** Blockquote callout openers. */
export const CALLOUT_OPENERS = {
  'Terminology warning.': 'terminology',
  'Terminology warning:': 'terminology',
  // The dossiers shorten it; the treatment is the same.
  'Terminology.': 'terminology',
  'Terminology:': 'terminology',
  'Evidence note.': 'evidence',
  'Evidence note:': 'evidence',
};

export const STATUS_KEYS = {
  Established: 'established',
  'Highly probable': 'probable',
  Disputed: 'disputed',
  Unknown: 'unknown',
};

export const STATUS_ICONS = {
  Established: '●',
  'Highly probable': '◐',
  Disputed: '⇄',
  Unknown: '○',
};

/** Withheld is a flag, not a status — it may co-occur with any of the above. */
export const WITHHELD_ICON = '⊘';

/**
 * Language that marks a claim as withheld rather than merely unknown.
 * Deliberately narrow: only phrasings the corpus actually uses to mean
 * "someone holds this and will not release it".
 */
export const WITHHELD_PATTERNS = [
  /\bwithheld\b/i,
  /\bremain(?:s)? (?:classified|undisclosed|sealed)\b/i,
  /\bstill (?:classified|withholding|undisclosed)\b/i,
  /\backnowledged .{0,40}\bundisclosed\b/i,
  /\bfiles? remain classified\b/i,
  /\brefused by parliamentary vote\b/i,
];

export function looksWithheld(text) {
  return WITHHELD_PATTERNS.some((re) => re.test(text));
}

/** Stable anchor id from a claim's text. */
export function claimAnchor(prefix, index) {
  return `claim-${prefix}-${index}`;
}
