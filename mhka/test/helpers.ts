/**
 * Fixture helpers.
 *
 * `makeSnapshot` builds a minimal but valid snapshot so each rule test can
 * state only the fields it cares about. Everything omitted defaults to a
 * passing value, which keeps a failing test's intent visible in the diff.
 */

import { join } from 'node:path';
import { DEFAULT_CONFIG, type Config } from '../src/config.js';
import { hashRecord } from '../src/model/normalise.js';
import type {
  ArchiveRecord,
  EventRecord,
  PageRecord,
  PersonRecord,
  RelationshipRecord,
  Snapshot,
  SourceRecord,
} from '../src/model/types.js';

export const TEST_CONFIG: Config = {
  ...DEFAULT_CONFIG,
  paths: { ...DEFAULT_CONFIG.paths, data: join(process.cwd(), 'data') },
};

const withHash = <T extends Record<string, unknown>>(r: T): T =>
  ({ ...r, hash: hashRecord(r) }) as T;

export function person(over: Partial<PersonRecord> = {}): PersonRecord {
  return withHash({
    slug: over.slug ?? 'test-person',
    notionId: 'aaaa',
    url: null,
    hash: '',
    name: 'Test Person',
    aliasesRaw: null,
    aliases: [],
    born: '1836 (conventional). Some reference works give 1857',
    died: 'not established',
    category: ['Tribal leader'],
    region: ['Middle Atlas'],
    phase: ['IV 1912-1921'],
    dossierStatus: 'Stub',
    evidenceBase: 'Thin - encyclopedic leads only',
    impact: null,
    assessment: null,
    lastReviewed: null,
    oneLine: 'A neutral identification.',
    contestedPoints: null,
    events: [],
    relationships: [],
    body: null,
    ...over,
  }) as PersonRecord;
}

export function source(over: Partial<SourceRecord> = {}): SourceRecord {
  return withHash({
    slug: over.slug ?? 'test-source',
    notionId: 'bbbb',
    url: null,
    hash: '',
    title: 'Test Source',
    author: 'An Author',
    date: '1975',
    publisher: 'A Publisher',
    language: ['French'],
    tier: 'ACADEMIC',
    sourceUrl: 'https://example.org/',
    archivalReference: 'n/a',
    verification: 'Cited by named scholar',
    biasNotes: 'Neutral note.',
    covers: 'Something.',
    ...over,
  }) as SourceRecord;
}

export function archive(over: Partial<ArchiveRecord> = {}): ArchiveRecord {
  return withHash({
    slug: over.slug ?? 'test-archive',
    notionId: 'cccc',
    url: null,
    hash: '',
    institution: 'Test Archive',
    country: 'France',
    city: 'Paris',
    fonds: 'Série X',
    coveringDates: '1900–1950',
    holdings: 'Papers.',
    whatItCanSettle: 'A question.',
    access: 'Reading room.',
    digitised: 'Catalogue online only',
    verification: 'Catalogue verified',
    priority: '2 - structural',
    archiveUrl: null,
    ...over,
  }) as ArchiveRecord;
}

export function event(over: Partial<EventRecord> = {}): EventRecord {
  return withHash({
    slug: over.slug ?? 'test-event',
    notionId: 'dddd',
    url: null,
    hash: '',
    event: 'Test Event',
    start: '1914-11-13',
    end: null,
    location: 'Somewhere',
    phase: 'IV 1912-1921',
    type: ['Battle'],
    dossierStatus: 'Stub',
    summary: 'A summary.',
    mainDispute: null,
    people: ['test-person'],
    body: null,
    ...over,
  }) as EventRecord;
}

export function relationship(over: Partial<RelationshipRecord> = {}): RelationshipRecord {
  return withHash({
    slug: over.slug ?? 'test-rel',
    notionId: 'eeee',
    url: null,
    hash: '',
    label: 'A → opposed → B',
    from: 'test-person',
    to: 'test-person-2',
    fromName: 'A',
    toName: 'B',
    relation: 'opposed',
    period: '1914',
    evidence: 'Some evidence.',
    evidenceStrength: 'Documented',
    ...over,
  }) as RelationshipRecord;
}

export function page(over: Partial<PageRecord> = {}): PageRecord {
  return withHash({
    slug: over.slug ?? 'test-page',
    title: 'Test Page',
    notionId: null,
    hash: '',
    body: 'Some prose.',
    ...over,
  }) as PageRecord;
}

export function makeSnapshot(over: Partial<Snapshot> = {}): Snapshot {
  return {
    takenAt: '2026-08-16T00:00:00.000Z',
    origin: 'test',
    propertyTypes: {
      people: { Born: 'rich_text', Died: 'rich_text' },
    },
    people: [],
    events: [],
    sources: [],
    archives: [],
    relationships: [],
    places: [],
    groups: [],
    pages: [],
    ...over,
  };
}

/** Run one rule and return its findings. */
export function runRule(
  rule: import('../src/model/types.js').Rule,
  snapshot: Snapshot,
  previous?: Snapshot
) {
  return rule.run({
    snapshot,
    previous,
    config: TEST_CONFIG,
    severityFor: (id, fallback) => TEST_CONFIG.severities[id] ?? fallback,
  });
}
