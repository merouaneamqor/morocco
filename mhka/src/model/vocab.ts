/**
 * The controlled vocabularies.
 *
 * These are transcribed from the live Notion select definitions, not from the
 * build brief. Where the two disagree, Notion is the corpus and wins — the
 * Archives database uses `Described by named scholar` and `Reported`, which the
 * brief's Sources list does not contain, and the two databases genuinely differ.
 *
 * R01 fails on any value not listed here, so an omission here is a false
 * positive and an over-broad list is a missed detection. Both are bugs.
 */

export const PHASES = [
  'I pre-1830',
  'II 1830-1900',
  'III 1900-1912',
  'IV 1912-1921',
  'V 1921-1934',
  'VI 1934-1944',
  'VII 1944-1956',
  'VIII 1956-1961',
  'IX 1961-1999',
  'X 1999-present',
] as const;

export const CATEGORIES = [
  'Sultan / monarch',
  'Makhzen official',
  'Tribal leader',
  'Religious leader',
  'Armed resistance',
  'Nationalist',
  'French military',
  'French civil',
  'Spanish military',
  'Spanish civil',
  'Collaborating notable',
  'Diplomat',
  'Other foreign',
] as const;

export const REGIONS = [
  'Fez / Saiss',
  'Marrakech / Haouz',
  'Middle Atlas',
  'High Atlas',
  'Rif',
  'Jebala / Tangier',
  'Sahara / Saguia el-Hamra',
  'Sous / Anti-Atlas',
  'Atlantic plains',
  'Oriental / Oujda',
  'Metropole France',
  'Spain',
] as const;

export const DOSSIER_STATUS = [
  'Full dossier',
  'Substantial',
  'Stub',
  'Identified - not yet researched',
] as const;

export const EVIDENCE_BASE = [
  'Strong - archival + academic',
  'Moderate - academic',
  'Thin - encyclopedic leads only',
  'Contested',
] as const;

export const IMPACT = [
  'Decisive - events turn on them',
  'Major - reshaped a region or institution',
  'Significant - materially changed outcomes',
  'Local or sectoral',
  'Marginal in effect',
  'Contested - impact itself disputed',
] as const;

/** Ordinal, strongest first. Position drives R12's monotonicity check. */
export const TIERS = [
  'PRIMARY_ARCHIVAL',
  'PRIMARY_CONTEMPORARY',
  'OFFICIAL',
  'ACADEMIC',
  'SECONDARY',
  'ENCYCLOPEDIC',
  'JOURNALISTIC',
  'UNSOURCED',
] as const;

/** Sources use the four-value ladder. Ordinal, strongest first. */
export const SOURCE_VERIFICATION = [
  'Consulted directly',
  'Catalogue verified',
  'Cited by named scholar',
  'NOT YET VERIFIED',
] as const;

/** Archives use a wider set — see the note at the top of this file. */
export const ARCHIVE_VERIFICATION = [
  'Consulted directly',
  'Catalogue verified',
  'Cited by named scholar',
  'Described by named scholar',
  'Reported',
  'NOT YET VERIFIED',
] as const;

export const EVENT_TYPES = [
  'Battle',
  'Campaign',
  'Treaty / agreement',
  'Uprising',
  'Diplomatic crisis',
  'Political',
  'Repression',
  'Economic',
] as const;

export const RELATION_VERBS = [
  'appointed by',
  'appointed',
  'allied with',
  'opposed',
  'fought',
  'negotiated with',
  'succeeded',
  'family of',
  'patron of',
  'client of',
  'commanded',
  'served under',
  'defected from',
  'corresponded with',
  'imprisoned or exiled',
  'assessed in intelligence reports',
] as const;

/** Ordinal, strongest first. */
export const EVIDENCE_STRENGTH = [
  'Documented',
  'Well-attested in scholarship',
  'Single source assertion',
  'Traditional / oral',
  'Disputed',
] as const;

export const COUNTRIES = [
  'France',
  'Spain',
  'Morocco',
  'United Kingdom',
  'United States',
  'Germany',
  'Turkey / Ottoman',
  'Italy',
  'International',
  'Other',
] as const;

export const DIGITISED = [
  'Substantially online',
  'Partly online',
  'Catalogue online only',
  'On-site only',
  'Unknown',
] as const;

export const PRIORITY = [
  '1 - decisive',
  '2 - structural',
  '3 - supporting',
  '4 - background',
] as const;

export const ZONES = [
  'French zone',
  'Spanish zone',
  'Tangier international',
  'Southern protectorate (Spanish)',
  'Outside protectorate control',
] as const;

export const GROUP_TYPES = [
  'Tribal confederation',
  'Tribe',
  'Clan / fraction',
  'Sufi order / zawiya',
  'Political party',
  'Religious lineage',
  'Military formation',
] as const;

export const SOURCE_LANGUAGES = [
  'French',
  'Spanish',
  'Arabic',
  'Tamazight',
  'English',
  'German',
  'Other',
] as const;

export const GROUP_LANGUAGES = [
  'Tamazight (Central Atlas)',
  'Tarifit',
  'Tashelhit',
  'Hassaniya',
  'Moroccan Arabic',
  'Judeo-Arabic',
] as const;

/**
 * Ordinal ladders, used by R12. `rank` returns a position where LOWER is
 * STRONGER; a decrease in rank between snapshots is a strengthening.
 */
export const LADDERS = {
  tier: TIERS,
  sourceVerification: SOURCE_VERIFICATION,
  archiveVerification: ARCHIVE_VERIFICATION,
  evidenceStrength: EVIDENCE_STRENGTH,
  // Evidence base is ordinal for strengthening purposes, but `Contested` is
  // not a rung — it sits outside the ladder, so it is excluded here and a move
  // into or out of it is never read as a strengthening.
  evidenceBase: [
    'Strong - archival + academic',
    'Moderate - academic',
    'Thin - encyclopedic leads only',
  ],
} as const;

export function rank(ladder: readonly string[], value: string | null): number | null {
  if (value == null) return null;
  const i = ladder.indexOf(value);
  return i === -1 ? null : i;
}

/**
 * Claim-status markers used inside dossier prose. `Withheld` is deliberately
 * absent: it is an independent flag, not a rung, and treating it as a status
 * would let a "Withheld → Established" transition read as an ordinary
 * strengthening when it is something else entirely.
 */
export const CLAIM_STATUSES = ['Established', 'Highly probable', 'Disputed', 'Unknown'] as const;

/** R04 watchlist. Extended past the brief with the two multi-word entries. */
export const COLONIAL_WATCHLIST = [
  'dissident',
  'insoumis',
  'rebelle',
  'prétendant',
  'fanatique',
  'agitateur',
  'bandit',
  'rogui',
  'cabecilla',
  'el Roghi',
  'pacification',
  'Rif riots',
] as const;

/** R08 opinion markers, and the fields that must stay free of them. */
export const OPINION_MARKERS = [
  'I think',
  'I judge',
  'I believe',
  'I suspect',
  'in my view',
  'my assessment',
  'my reading',
  'probably a story',
  'it seems to me',
  'I would say',
] as const;

export const EVIDENCE_FIELDS = [
  'oneLine',
  'summary',
  'evidence',
  'covers',
  'holdings',
  'biasNotes',
] as const;

/**
 * R08 falsifiers. An assessment that cannot name what would change its mind is
 * not a judgement, and the corpus's standing rule says so.
 */
export const FALSIFIER_MARKERS = [
  'would change',
  'would revise',
  'would overturn',
  'unless',
  'if evidence showed',
  'if it turned out',
  'falsifi',
  'would be wrong if',
  'I would abandon',
] as const;

/** Hedges whose removal beside a number is suspicious (§7). */
export const HEDGES = [
  'approximately',
  'approx',
  'about',
  'around',
  'c.',
  'circa',
  'at least',
  'estimate',
  'estimated',
  'reported',
  'reportedly',
  'alleged',
  'allegedly',
  'said to',
  'up to',
] as const;

export type Phase = (typeof PHASES)[number];
export type Tier = (typeof TIERS)[number];
export type SourceVerification = (typeof SOURCE_VERIFICATION)[number];
