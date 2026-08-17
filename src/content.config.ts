import { defineCollection, z } from 'astro:content';
import { file, glob } from 'astro/loaders';

/**
 * Controlled vocabularies.
 *
 * These are transcribed from the Notion select definitions, not from the build
 * brief — where the two disagree, Notion is the corpus and wins. The Archives
 * database in particular uses `Described by named scholar` and `Reported`,
 * which the brief's four-value list does not contain.
 *
 * Every one of these is a strict enum on purpose. A select value the schema
 * does not know fails the build, because a silently dropped
 * `Verification: NOT YET VERIFIED` is the exact failure mode this site exists
 * to prevent.
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

/** Ordinal, darkest at PRIMARY_ARCHIVAL. Order here is the ramp order. */
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

/** Sources use the four-value ladder. */
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

/** Ordinal: thickest/solid → thin/dashed. */
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

export const LANGUAGES = [
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

export const CLAIM_STATUSES = ['Established', 'Highly probable', 'Disputed', 'Unknown'] as const;

/**
 * Impact — how much turned on this person.
 *
 * This is a judgement, not a finding, and the corpus treats it as one: it is
 * written by the same process that writes the signed assessment, and
 * `Contested - impact itself disputed` exists precisely so that the scale
 * cannot quietly resolve an argument about significance.
 */
export const IMPACT = [
  'Decisive - events turn on them',
  'Major - reshaped a region or institution',
  'Significant - materially changed outcomes',
  'Local or sectoral',
  'Marginal in effect',
  'Contested - impact itself disputed',
] as const;

/**
 * Confidence on a Claims record.
 *
 * `Withheld` is here and NOT in CLAIM_STATUSES on purpose. In prose it is a
 * separate flag — a claim can be Unknown *and* Withheld. On a Claims row the
 * corpus makes it a value of the Confidence select, because a withheld record
 * is a statement about access, not about degree of belief, and the database
 * has nowhere else to put it. The renderer keeps them visually distinct so a
 * reader never reads "Withheld" as the bottom rung of a confidence ladder.
 */
export const CLAIM_CONFIDENCE = [
  'Established',
  'Highly probable',
  'Disputed',
  'Unknown',
  'Withheld',
] as const;

/**
 * The three evidence layers, never blended: what a document says, what a
 * historian argues from it, and what this project concludes. This is a
 * separate axis from confidence and gets its own palette — a page mixes all
 * three in adjacent paragraphs and the reader must keep both systems apart.
 */
export const EVIDENCE_LAYERS = [
  'Primary source',
  'Secondary interpretation',
  'Project inference',
] as const;

/**
 * Status on a Disputes record — six-way, from unresolvable to resolved.
 * Transcribed from the Notion select, which is the corpus. Two of these were
 * guessed when the database was first ingested and guessed wrongly: the real
 * end states are `Moving toward resolution` and `Resolved by new evidence`,
 * which say how a dispute closed rather than merely that it did.
 */
export const DISPUTE_RECORD_STATUSES = [
  'Unresolvable on present evidence',
  'Disputed - definitional',
  'Disputed',
  'Settleable - request identified',
  'Moving toward resolution',
  'Resolved by new evidence',
] as const;

/** Why an open question is open. Not a ladder — these are different kinds. */
export const WHY_UNKNOWN = [
  'Destroyed',
  'Inaccessible',
  'Contradictory',
  'Never searched',
  'Classified or withheld',
  'Oral-only and undocumented',
  'Unclear',
] as const;

/**
 * Research status. `Closed - answer found` is a success state and is rendered
 * as one: establishing that no record exists is an answer, not a dead end.
 */
export const RESEARCH_STATUSES = [
  'Active investigation',
  'Paused',
  'Closed - answer found',
  'Closed - judged unanswerable',
] as const;

export const DISPUTE_STATUSES = [
  'Open',
  'Settleable',
  'Unresolvable',
  'Withheld',
  'Resolved',
  'Disputed',
  'Unknown',
] as const;

const aliasVariant = z.object({
  value: z.string(),
  tradition: z.string().nullable(),
  script: z.enum(['latin', 'arabic']),
  folded: z.string(),
  /** Prose caveat rather than a spelling — shown, but never indexed as a name. */
  isNote: z.boolean(),
});

const people = defineCollection({
  loader: file('src/content/data/people.json', { parser: (t) => JSON.parse(t) }),
  schema: z.object({
    slug: z.string(),
    notionId: z.string().nullable(),
    name: z.string(),
    aliasesRaw: z.string().nullable(),
    aliases: z.array(aliasVariant),
    // Verbatim strings. Never coerced to a date — many are disputed, and the
    // dispute is carried in the string itself.
    born: z.string().nullable(),
    died: z.string().nullable(),
    _derivedBornYear: z.number().nullable(),
    _derivedDiedYear: z.number().nullable(),
    category: z.array(z.enum(CATEGORIES)),
    region: z.array(z.enum(REGIONS)),
    phase: z.array(z.enum(PHASES)),
    dossierStatus: z.enum(DOSSIER_STATUS),
    evidenceBase: z.enum(EVIDENCE_BASE),
    impact: z.enum(IMPACT).nullable(),
    oneLine: z.string().nullable(),
    contestedPoints: z.string().nullable(),
    /**
     * Signed opinion, fenced. The corpus's rule is that judgement lives in
     * exactly two places and is never a source; the site keeps that fence by
     * rendering it in its own block, labelled as project inference, well
     * clear of the evidence record. Null means no judgement has been made —
     * which is different from a judgement that there is nothing to say.
     */
    assessment: z.string().nullable(),
    lastReviewed: z.string().nullable(),
    events: z.array(z.string()),
    relationships: z.array(z.string()),
    claims: z.array(z.string()),
    disputes: z.array(z.string()),
    archives: z.array(z.string()),
  }),
});

const events = defineCollection({
  loader: file('src/content/data/events.json', { parser: (t) => JSON.parse(t) }),
  schema: z.object({
    slug: z.string(),
    notionId: z.string().nullable(),
    event: z.string(),
    start: z.string().nullable(),
    end: z.string().nullable(),
    location: z.string().nullable(),
    phase: z.enum(PHASES).nullable(),
    type: z.array(z.enum(EVENT_TYPES)),
    dossierStatus: z.enum(DOSSIER_STATUS),
    summary: z.string().nullable(),
    mainDispute: z.string().nullable(),
    people: z.array(z.string()),
    claims: z.array(z.string()),
    disputes: z.array(z.string()),
    openQuestions: z.array(z.string()),
    archives: z.array(z.string()),
  }),
});

const sources = defineCollection({
  loader: file('src/content/data/sources.json', { parser: (t) => JSON.parse(t) }),
  schema: z.object({
    slug: z.string(),
    notionId: z.string().nullable(),
    title: z.string(),
    author: z.string().nullable(),
    date: z.string().nullable(),
    publisher: z.string().nullable(),
    language: z.array(z.enum(LANGUAGES)),
    tier: z.enum(TIERS),
    url: z.string().nullable(),
    archivalReference: z.string().nullable(),
    // Nullable, and deliberately not defaulted. The sources added in the
    // corpus's later sessions carry no Verification value at all. Coercing
    // those to "NOT YET VERIFIED" would invent a judgement the corpus has not
    // made, and defaulting them to anything higher would be worse. A missing
    // verification is rendered as its own visible state — see <ArchivalRef>.
    verification: z.enum(SOURCE_VERIFICATION).nullable(),
    biasNotes: z.string().nullable(),
    covers: z.string().nullable(),
  }),
});

const archives = defineCollection({
  loader: file('src/content/data/archives.json', { parser: (t) => JSON.parse(t) }),
  schema: z.object({
    slug: z.string(),
    notionId: z.string().nullable(),
    institution: z.string(),
    country: z.enum(COUNTRIES),
    city: z.string().nullable(),
    fonds: z.string().nullable(),
    coveringDates: z.string().nullable(),
    holdings: z.string().nullable(),
    whatItCanSettle: z.string().nullable(),
    access: z.string().nullable(),
    digitised: z.enum(DIGITISED),
    verification: z.enum(ARCHIVE_VERIFICATION),
    priority: z.enum(PRIORITY),
    url: z.string().nullable(),
    // The research-agenda columns, added when the claim became the core
    // object. Nullable because only six of the 25 rows carry them, and the
    // explorer renders the absence as "Not yet documented" rather than
    // hiding the row — a holding nobody has written a search plan for is
    // itself a finding.
    searchTerms: z.string().nullable(),
    notYetSearched: z.string().nullable(),
    language: z.array(z.enum(LANGUAGES)),
    relatedPeople: z.array(z.string()),
    relatedEvents: z.array(z.string()),
    claims: z.array(z.string()),
    openQuestions: z.array(z.string()),
  }),
});

/**
 * Claims — the atomic unit of the corpus.
 *
 * Every field that could carry a document quotation is nullable, and the
 * renderer is required to say so out loud. A blank `whatTheDocumentSays` next
 * to a populated `archivalReference` is the exact shape of a claim nobody has
 * checked, and it must read that way on the page.
 */
const claims = defineCollection({
  loader: file('src/content/data/claim-records.json', { parser: (t) => JSON.parse(t) }),
  schema: z.object({
    slug: z.string(),
    notionId: z.string().nullable(),
    claim: z.string(),
    confidence: z.enum(CLAIM_CONFIDENCE).nullable(),
    evidenceLayer: z.enum(EVIDENCE_LAYERS).nullable(),
    phase: z.enum(PHASES).nullable(),
    whatTheDocumentSays: z.string().nullable(),
    interpretation: z.string().nullable(),
    counterEvidence: z.string().nullable(),
    whySourcesDisagree: z.string().nullable(),
    archivalReference: z.string().nullable(),
    primaryEvidence: z.array(z.string()),
    counterEvidenceSources: z.array(z.string()),
    archives: z.array(z.string()),
    people: z.array(z.string()),
    events: z.array(z.string()),
    disputes: z.array(z.string()),
    openQuestions: z.array(z.string()),
    lastReviewed: z.string().nullable(),
  }),
});

/**
 * Disputes — the matrix. Four national positions kept as four separate
 * nullable fields so that "Spain said nothing about this" survives into the
 * rendered table as a visible gap rather than a collapsed column.
 */
const disputeRecords = defineCollection({
  loader: file('src/content/data/dispute-records.json', { parser: (t) => JSON.parse(t) }),
  schema: z.object({
    slug: z.string(),
    notionId: z.string().nullable(),
    dispute: z.string(),
    positions: z.object({
      french: z.string().nullable(),
      spanish: z.string().nullable(),
      moroccan: z.string().nullable(),
      other: z.string().nullable(),
    }),
    currentAssessment: z.string().nullable(),
    whySourcesDisagree: z.string().nullable(),
    status: z.enum(DISPUTE_RECORD_STATUSES).nullable(),
    phase: z.enum(PHASES).nullable(),
    people: z.array(z.string()),
    events: z.array(z.string()),
    claims: z.array(z.string()),
  }),
});

/** Open questions — the research agenda, not a list of failures. */
const openQuestions = defineCollection({
  loader: file('src/content/data/open-questions.json', { parser: (t) => JSON.parse(t) }),
  schema: z.object({
    slug: z.string(),
    notionId: z.string().nullable(),
    question: z.string(),
    whatWeKnow: z.string().nullable(),
    missingEvidence: z.string().nullable(),
    documentsRequested: z.string().nullable(),
    whyWeDontKnow: z.enum(WHY_UNKNOWN).nullable(),
    researchStatus: z.enum(RESEARCH_STATUSES).nullable(),
    phase: z.enum(PHASES).nullable(),
    archives: z.array(z.string()),
    people: z.array(z.string()),
    events: z.array(z.string()),
    claims: z.array(z.string()),
  }),
});

/**
 * Bibliography — currently empty, and defined anyway.
 *
 * The collection exists so the site can state that it has no entries yet,
 * which is true and useful, rather than omitting a section and letting the
 * reader assume the citations are elsewhere.
 */
const bibliography = defineCollection({
  loader: file('src/content/data/bibliography.json', { parser: (t) => JSON.parse(t) }),
  schema: z.object({
    slug: z.string(),
    notionId: z.string().nullable(),
    entry: z.string().nullable(),
    type: z.string().nullable(),
    authors: z.string().nullable(),
    year: z.string().nullable(), // text, never parsed — same rule as Born/Died
    identifier: z.string().nullable(),
    url: z.string().nullable(),
    language: z.array(z.string()),
    notes: z.string().nullable(),
  }),
});

const places = defineCollection({
  loader: file('src/content/data/places.json', { parser: (t) => JSON.parse(t) }),
  schema: z.object({
    slug: z.string(),
    notionId: z.string().nullable(),
    place: z.string(),
    otherNames: z.string().nullable(),
    aliases: z.array(aliasVariant),
    region: z.string().nullable(),
    zone: z.enum(ZONES).nullable(),
    whyItMatters: z.string().nullable(),
    tribes: z.string().nullable(),
    militaryPresence: z.string().nullable(),
  }),
});

const groups = defineCollection({
  loader: file('src/content/data/groups.json', { parser: (t) => JSON.parse(t) }),
  schema: z.object({
    slug: z.string(),
    notionId: z.string().nullable(),
    group: z.string(),
    otherNames: z.string().nullable(),
    aliases: z.array(aliasVariant),
    type: z.enum(GROUP_TYPES),
    language: z.array(z.enum(GROUP_LANGUAGES)),
    region: z.string().nullable(),
    politicalPosition: z.string().nullable(),
    notes: z.string().nullable(),
  }),
});

const relationships = defineCollection({
  loader: file('src/content/data/relationships.json', { parser: (t) => JSON.parse(t) }),
  schema: z.object({
    slug: z.string(),
    notionId: z.string().nullable(),
    label: z.string(),
    from: z.string(),
    fromName: z.string(),
    to: z.string(),
    toName: z.string(),
    relation: z.enum(RELATION_VERBS),
    period: z.string().nullable(),
    evidence: z.string().nullable(),
    evidenceStrength: z.enum(EVIDENCE_STRENGTH),
  }),
});

const disputes = defineCollection({
  loader: file('src/content/disputes/disputes.json', { parser: (t) => JSON.parse(t) }),
  schema: z.object({
    n: z.number(),
    slug: z.string(),
    dispute: z.string(),
    positions: z.array(
      z.object({
        party: z.string(),
        position: z.string(),
        interest: z.string().optional(),
      })
    ),
    status: z.enum(DISPUTE_STATUSES),
    resolution: z.enum(['fully', 'partly']).optional(),
    before: z.object({ status: z.string(), text: z.string() }).optional(),
    after: z.object({ status: z.string(), text: z.string() }).optional(),
    settledBy: z.string(),
    whyDisinterested: z.string(),
    whatItWouldTake: z.string(),
    phase: z.enum(PHASES),
    relatedEvents: z.array(z.string()).optional(),
    relatedPeople: z.array(z.string()).optional(),
    withheld: z.boolean().optional(),
    verification: z.string().optional(),
  }),
});

/** The long-form argumentative pages. Rendered as essays, never chopped into cards. */
const pages = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    route: z.string(),
    icon: z.string().optional(),
    order: z.number(),
    notionId: z.string().optional(),
    lede: z.string().optional(),
  }),
});

/** Dossier bodies for people, keyed by slug. Optional — a person may be a stub. */
const dossiers = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/dossiers' }),
  schema: z.object({
    slug: z.string(),
    name: z.string(),
    notionId: z.string().optional(),
  }),
});

/** Event dossier bodies, keyed by slug. */
const eventDossiers = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/event-dossiers' }),
  schema: z.object({
    slug: z.string(),
    event: z.string(),
    notionId: z.string().optional(),
  }),
});

export const collections = {
  people,
  events,
  sources,
  archives,
  places,
  groups,
  relationships,
  claims,
  disputeRecords,
  openQuestions,
  bibliography,
  // The narrative-page contradictions, extracted from prose. Distinct from
  // `disputeRecords`, which is the structured Notion database — different
  // provenance, so they are never merged into one list.
  disputes,
  pages,
  dossiers,
  eventDossiers,
};
