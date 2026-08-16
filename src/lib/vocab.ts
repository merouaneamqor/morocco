/**
 * The controlled vocabularies, with their definitions.
 *
 * These definitions are the corpus's own, taken from the workspace's method
 * statement. They are surfaced on hover from <SourceTier> and in full on
 * /method, so a reader never has to guess what a tier label means.
 */

export const TIER_DEFINITIONS = {
  PRIMARY_ARCHIVAL:
    'Document produced by an institution at the time, held in an archive, consulted or verifiably cited.',
  PRIMARY_CONTEMPORARY:
    'Memoir, press, correspondence, photograph produced at the time but published.',
  OFFICIAL:
    'Government publication (Bulletin Officiel, Gaceta, parliamentary record).',
  ACADEMIC: 'Peer-reviewed scholarship working from archives.',
  SECONDARY: 'Serious non-academic history.',
  ENCYCLOPEDIC: 'Reference work — used as a lead, never as final authority.',
  JOURNALISTIC: 'Press, present-day.',
  UNSOURCED: 'Assertion in circulation with no traceable origin.',
} as const;

export const CLAIM_DEFINITIONS = {
  Established: 'Multiple independent tiers agree.',
  'Highly probable': 'Strong single-tier evidence, no contradiction.',
  Disputed: 'Sources conflict; all versions recorded.',
  Unknown: 'The question is open and is stated as open.',
} as const;

export const WITHHELD_DEFINITION =
  'Known to someone who will not disclose it. Not a rung on the confidence ladder — a separate flag that may co-occur with any status.';

export const VERIFICATION_DEFINITIONS = {
  'Consulted directly': 'The document itself was read by this project.',
  'Catalogue verified':
    'The reference was seen in the holding institution’s own catalogue.',
  'Cited by named scholar':
    'A named scholar quotes the reference as one they consulted.',
  'Described by named scholar':
    'A named scholar describes the holding, without a quotable reference string.',
  Reported: 'The holding is reported to exist; not catalogue-checked here.',
  'NOT YET VERIFIED':
    'No reference number here has been reconstructed from memory or inferred. This is an IOU against a named fonds.',
} as const;

export const EVIDENCE_STRENGTH_ORDER = [
  'Documented',
  'Well-attested in scholarship',
  'Single source assertion',
  'Traditional / oral',
  'Disputed',
] as const;

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

/**
 * Colonial administrative vocabulary that must never appear as unmarked
 * description. Each entry carries the institution that issued the category,
 * what it meant administratively, and the caution.
 *
 * These words describe how the Protectorate filed a person. They do not
 * describe what the person was.
 */
export const COLONIAL_TERMS: Record<
  string,
  { issuer: string; meaning: string; caution: string; language: string }
> = {
  dissident: {
    language: 'French',
    issuer: 'Résidence Générale; Bureau des Affaires Indigènes',
    meaning:
      'An armed leader outside French authority — a legal-administrative status.',
    caution:
      'Not a judgement of legitimacy in Moroccan terms. Mouha ou Hammou held a Makhzen commission from Hassan I while French reporting filed him as dissident.',
  },
  insoumis: {
    language: 'French',
    issuer: 'Résidence Générale; French military command',
    meaning: 'Literally “unsubmitted” — not yet brought under French control.',
    caution:
      'Describes a relationship to France, not a relationship to the Moroccan order. The term presumes submission is the default state.',
  },
  rebelle: {
    language: 'French',
    issuer: 'French military and civil administration',
    meaning: 'One in revolt against the authority the Protectorate asserted.',
    caution:
      'Presupposes the legitimacy of the authority being resisted, which is the question at issue.',
  },
  prétendant: {
    language: 'French',
    issuer: 'French administration and press',
    meaning: 'A claimant to the throne without recognised title.',
    caution:
      'Applied selectively. Recognition of a sultan in Moroccan practice ran through the bayʿa, not through French acknowledgement.',
  },
  fanatique: {
    language: 'French',
    issuer: 'French military intelligence; Affaires Indigènes',
    meaning:
      'Religiously motivated and therefore, in the filing category, not politically rational.',
    caution:
      'A category error built into the filing system: it exists precisely so that resistance need not be recorded as politics.',
  },
  bandit: {
    language: 'French',
    issuer: 'French and Spanish administrations',
    meaning: 'Criminal rather than political actor.',
    caution:
      'Reclassifies political violence as crime, which removes the need to negotiate with it.',
  },
  rogui: {
    language: 'Moroccan Arabic, taken up in French usage',
    issuer: 'Makhzen usage, adopted by the French administration',
    meaning: 'Pretender — used above all of Bou Hamara.',
    caution:
      'Carried from Makhzen polemic into European reporting, where it hardened into a label rather than a claim under dispute.',
  },
  'el Roghi': {
    language: 'French and Spanish rendering',
    issuer: 'European press and administration',
    meaning: 'The pretender — Bou Hamara.',
    caution:
      'A European rendering of a Makhzen polemical term, repeated as if it were a name.',
  },
  cabecilla: {
    language: 'Spanish',
    issuer: 'Alta Comisaría de España en Marruecos',
    meaning: 'Ringleader — a small-scale, illegitimate leader.',
    caution:
      'Diminutive by construction. Used of Abd el-Krim, who headed a state with an army, a treasury and a foreign policy.',
  },
  rebelde: {
    language: 'Spanish',
    issuer: 'Spanish protectorate administration',
    meaning: 'Rebel against Spanish authority in the northern zone.',
    caution:
      'The AGA fonds uses this as a classification of Moroccan political actors, alongside cabecilla and bandido.',
  },
  bandido: {
    language: 'Spanish',
    issuer: 'Spanish protectorate administration',
    meaning: 'Bandit.',
    caution: 'As with the French bandit: political violence filed as crime.',
  },
  agitateur: {
    language: 'French',
    issuer: 'Résidence Générale',
    meaning: 'One who stirs up opposition, especially in the urban milieu.',
    caution:
      'Locates the cause of opposition in an individual rather than in the conditions being opposed.',
  },
};

/** Regex matching any watchlist term as a whole word, for the CI lint. */
export const COLONIAL_TERM_PATTERN = new RegExp(
  `\\b(${Object.keys(COLONIAL_TERMS)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})\\b`,
  'gi'
);
