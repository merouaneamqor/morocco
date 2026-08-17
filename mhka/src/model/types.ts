/**
 * The normalised model.
 *
 * Every record carries a stable slug, relations resolved to slugs, and a
 * content hash so `diff` can spot changes cheaply. Raw select values are kept
 * as plain strings rather than narrowed unions: R01 is what validates them, and
 * a type that could not represent an invalid value would leave R01 nothing to
 * find.
 */

export interface RecordBase {
  slug: string;
  notionId: string | null;
  url: string | null;
  /** Hash over the record's own fields, excluding the hash itself. */
  hash: string;
  /** Notion's last-edited timestamp, when the API supplies it. */
  lastEdited?: string | null;
}

export interface PersonRecord extends RecordBase {
  name: string;
  aliasesRaw: string | null;
  /** Split variants, for the matcher. Display always uses aliasesRaw. */
  aliases: string[];
  /** Verbatim. Parsing these into Date objects is a bug — see R06. */
  born: string | null;
  died: string | null;
  /** The Notion property type as reported by the API, for R06. */
  bornPropertyType?: string;
  diedPropertyType?: string;
  category: string[];
  region: string[];
  phase: string[];
  dossierStatus: string | null;
  evidenceBase: string | null;
  impact: string | null;
  assessment: string | null;
  lastReviewed: string | null;
  oneLine: string | null;
  contestedPoints: string | null;
  events: string[];
  relationships: string[];
  /** Markdown body, when fetched. */
  body?: string | null;
}

export interface EventRecord extends RecordBase {
  event: string;
  start: string | null;
  end: string | null;
  location: string | null;
  phase: string | null;
  type: string[];
  dossierStatus: string | null;
  summary: string | null;
  mainDispute: string | null;
  people: string[];
  body?: string | null;
}

export interface SourceRecord extends RecordBase {
  title: string;
  author: string | null;
  date: string | null;
  publisher: string | null;
  language: string[];
  tier: string | null;
  sourceUrl: string | null;
  archivalReference: string | null;
  verification: string | null;
  biasNotes: string | null;
  covers: string | null;
}

export interface ArchiveRecord extends RecordBase {
  institution: string;
  country: string | null;
  city: string | null;
  fonds: string | null;
  coveringDates: string | null;
  holdings: string | null;
  whatItCanSettle: string | null;
  access: string | null;
  digitised: string | null;
  verification: string | null;
  priority: string | null;
  archiveUrl: string | null;
}

export interface RelationshipRecord extends RecordBase {
  label: string;
  from: string | null;
  to: string | null;
  fromName: string | null;
  toName: string | null;
  relation: string | null;
  period: string | null;
  evidence: string | null;
  evidenceStrength: string | null;
}

export interface PlaceRecord extends RecordBase {
  place: string;
  otherNames: string | null;
  region: string | null;
  zone: string | null;
  whyItMatters: string | null;
  tribes: string | null;
  militaryPresence: string | null;
}

export interface GroupRecord extends RecordBase {
  group: string;
  otherNames: string | null;
  type: string | null;
  language: string[];
  region: string | null;
  politicalPosition: string | null;
  notes: string | null;
}

export interface PageRecord {
  slug: string;
  title: string;
  notionId: string | null;
  hash: string;
  body: string;
}

export interface Snapshot {
  /** ISO date the snapshot was taken. */
  takenAt: string;
  /** Where it came from: 'notion' or an offline import path. */
  origin: string;
  /** Schema fingerprints, so R06 can see a property type change. */
  propertyTypes: Record<string, Record<string, string>>;
  people: PersonRecord[];
  events: EventRecord[];
  sources: SourceRecord[];
  archives: ArchiveRecord[];
  relationships: RelationshipRecord[];
  places: PlaceRecord[];
  groups: GroupRecord[];
  pages: PageRecord[];
}

export type Severity = 'error' | 'warn' | 'info';

export interface Finding {
  rule: string;
  severity: Severity;
  message: string;
  /** Collection and slug of the offending record. */
  collection?: string;
  slug?: string;
  field?: string;
  /** Free-form supporting detail, printed indented under the message. */
  detail?: string;
}

export interface Rule {
  id: string;
  title: string;
  defaultSeverity: Severity;
  /** Rules needing two snapshots declare it; `validate` skips them. */
  requiresDiff?: boolean;
  run(ctx: RuleContext): Finding[];
}

export interface RuleContext {
  snapshot: Snapshot;
  previous?: Snapshot;
  config: import('../config.js').Config;
  severityFor(ruleId: string, fallback: Severity): Severity;
}

export const EMPTY_SNAPSHOT: Omit<Snapshot, 'takenAt' | 'origin'> = {
  propertyTypes: {},
  people: [],
  events: [],
  sources: [],
  archives: [],
  relationships: [],
  places: [],
  groups: [],
  pages: [],
};
