/**
 * Slugs, hashes, and the raw → normalised transform.
 *
 * The transform reshapes and adds; it never rewrites a value the corpus states.
 * `Born` and `Died` in particular pass through as verbatim strings, and there
 * is deliberately no derived-year field here — this is an auditor, and it has
 * no reason to produce a number that could later be mistaken for the record.
 */

import { createHash } from 'node:crypto';
import { splitAliases } from '../alias/fold.js';
import type {
  ArchiveRecord,
  EventRecord,
  GroupRecord,
  PersonRecord,
  PlaceRecord,
  RelationshipRecord,
  SourceRecord,
} from './types.js';

export function slugify(input: string): string {
  const base = String(input ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[·/—–_,:;.'"()[\]{}]/g, '-')
    .replace(/[^a-z0-9؀-ۿ-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return base || 'untitled';
}

/** Deduplicate with a numeric suffix, never a hash — URLs stay legible. */
export function slugifyUnique(input: string, taken: Map<string, number>): string {
  const base = slugify(input);
  const seen = taken.get(base) ?? 0;
  taken.set(base, seen + 1);
  return seen === 0 ? base : `${base}-${seen + 1}`;
}

/** Stable hash over a record's own fields, excluding volatile keys. */
export function hashRecord(obj: Record<string, unknown>): string {
  const omit = new Set(['hash', 'lastEdited']);
  const stable = Object.keys(obj)
    .filter((k) => !omit.has(k))
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = obj[k];
      return acc;
    }, {});
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex').slice(0, 16);
}

export function notionId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = String(url).match(/([0-9a-f]{32}|[0-9a-f-]{36})(?:\?|$|#)/i);
  return m ? m[1]!.replace(/-/g, '') : null;
}

const str = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

/** Notion SQL returns multi-selects as JSON strings; hand-built caches use arrays. */
export function arr(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === 'string') {
    const t = v.trim();
    if (t.startsWith('[')) {
      try {
        const parsed = JSON.parse(t);
        return Array.isArray(parsed) ? parsed.map((x) => String(x)) : [];
      } catch {
        /* fall through */
      }
    }
    return t ? [t] : [];
  }
  return [String(v)];
}

type Raw = Record<string, unknown>;

export function normalisePeople(rows: Raw[]): PersonRecord[] {
  const taken = new Map<string, number>();
  return rows.map((r) => {
    const rec: PersonRecord = {
      slug: slugifyUnique(String(r['Name'] ?? ''), taken),
      notionId: notionId(r['url'] as string),
      url: str(r['url']),
      hash: '',
      name: String(r['Name'] ?? ''),
      aliasesRaw: str(r['Aliases & spellings']),
      aliases: splitAliases(str(r['Aliases & spellings'])),
      born: str(r['Born']),
      died: str(r['Died']),
      bornPropertyType: (r['__bornType'] as string) ?? undefined,
      diedPropertyType: (r['__diedType'] as string) ?? undefined,
      category: arr(r['Category']),
      region: arr(r['Region']),
      phase: arr(r['Phase']),
      dossierStatus: str(r['Dossier status']),
      evidenceBase: str(r['Evidence base']),
      impact: str(r['Impact']),
      assessment: str(r['Assessment (signed opinion)']),
      lastReviewed: str(r['Last reviewed'] ?? r['date:Last reviewed:start']),
      oneLine: str(r['One-line']),
      contestedPoints: str(r['Contested points']),
      events: [],
      relationships: [],
      body: str(r['__body']),
    };
    rec.hash = hashRecord(rec as unknown as Raw);
    return rec;
  });
}

export function normaliseEvents(rows: Raw[]): EventRecord[] {
  const taken = new Map<string, number>();
  return rows.map((r) => {
    const rec: EventRecord = {
      slug: slugifyUnique(String(r['Event'] ?? ''), taken),
      notionId: notionId(r['url'] as string),
      url: str(r['url']),
      hash: '',
      event: String(r['Event'] ?? ''),
      start: str(r['Start'] ?? r['date:Start:start']),
      end: str(r['End'] ?? r['date:End:start']),
      location: str(r['Location']),
      phase: str(r['Phase']),
      type: arr(r['Type']),
      dossierStatus: str(r['Dossier status']),
      summary: str(r['Summary']),
      mainDispute: str(r['Main dispute']),
      people: [],
      body: str(r['__body']),
    };
    rec.hash = hashRecord(rec as unknown as Raw);
    return rec;
  });
}

export function normaliseSources(rows: Raw[]): SourceRecord[] {
  const taken = new Map<string, number>();
  return rows.map((r) => {
    const rec: SourceRecord = {
      slug: slugifyUnique(String(r['Title'] ?? ''), taken),
      notionId: notionId(r['url'] as string),
      url: str(r['url']),
      hash: '',
      title: String(r['Title'] ?? ''),
      author: str(r['Author / producer']),
      date: str(r['Date']),
      publisher: str(r['Institution / publisher']),
      language: arr(r['Language']),
      tier: str(r['Tier']),
      sourceUrl: str(r['URL'] ?? r['userDefined:URL']),
      archivalReference: str(r['Archival reference']),
      verification: str(r['Verification']),
      biasNotes: str(r['Bias notes']),
      covers: str(r['Covers']),
    };
    rec.hash = hashRecord(rec as unknown as Raw);
    return rec;
  });
}

export function normaliseArchives(rows: Raw[]): ArchiveRecord[] {
  const taken = new Map<string, number>();
  return rows.map((r) => {
    const rec: ArchiveRecord = {
      slug: slugifyUnique(String(r['Institution'] ?? ''), taken),
      notionId: notionId(r['url'] as string),
      url: str(r['url']),
      hash: '',
      institution: String(r['Institution'] ?? ''),
      country: str(r['Country']),
      city: str(r['City']),
      fonds: str(r['Fonds / series']),
      coveringDates: str(r['Covering dates']),
      holdings: str(r['Holdings']),
      whatItCanSettle: str(r['What it can settle']),
      access: str(r['Access']),
      digitised: str(r['Digitised']),
      verification: str(r['Verification']),
      priority: str(r['Priority']),
      archiveUrl: str(r['URL'] ?? r['userDefined:URL']),
    };
    rec.hash = hashRecord(rec as unknown as Raw);
    return rec;
  });
}

export function normaliseRelationships(
  rows: Raw[],
  peopleByNotionId: Map<string, { slug: string; name: string }>
): RelationshipRecord[] {
  const taken = new Map<string, number>();
  return rows.map((r) => {
    const fromId = notionId(arr(r['From'])[0]);
    const toId = notionId(arr(r['To'])[0]);
    const from = fromId ? peopleByNotionId.get(fromId) : undefined;
    const to = toId ? peopleByNotionId.get(toId) : undefined;
    const rec: RelationshipRecord = {
      slug: slugifyUnique(String(r['Relationship'] ?? ''), taken),
      notionId: notionId(r['url'] as string),
      url: str(r['url']),
      hash: '',
      label: String(r['Relationship'] ?? ''),
      from: from?.slug ?? null,
      to: to?.slug ?? null,
      fromName: from?.name ?? null,
      toName: to?.name ?? null,
      relation: str(r['Relation']),
      period: str(r['Period']),
      evidence: str(r['Evidence']),
      evidenceStrength: str(r['Evidence strength']),
    };
    rec.hash = hashRecord(rec as unknown as Raw);
    return rec;
  });
}

export function normalisePlaces(rows: Raw[]): PlaceRecord[] {
  const taken = new Map<string, number>();
  return rows.map((r) => {
    const rec: PlaceRecord = {
      slug: slugifyUnique(String(r['Place'] ?? ''), taken),
      notionId: notionId(r['url'] as string),
      url: str(r['url']),
      hash: '',
      place: String(r['Place'] ?? ''),
      otherNames: str(r['Other names']),
      region: str(r['Region']),
      zone: str(r['Zone']),
      whyItMatters: str(r['Why it matters']),
      tribes: str(r['Tribes']),
      militaryPresence: str(r['Military presence']),
    };
    rec.hash = hashRecord(rec as unknown as Raw);
    return rec;
  });
}

export function normaliseGroups(rows: Raw[]): GroupRecord[] {
  const taken = new Map<string, number>();
  return rows.map((r) => {
    const rec: GroupRecord = {
      slug: slugifyUnique(String(r['Group'] ?? ''), taken),
      notionId: notionId(r['url'] as string),
      url: str(r['url']),
      hash: '',
      group: String(r['Group'] ?? ''),
      otherNames: str(r['Other names']),
      type: str(r['Type']),
      language: arr(r['Language']),
      region: str(r['Region']),
      politicalPosition: str(r['Political position']),
      notes: str(r['Notes']),
    };
    rec.hash = hashRecord(rec as unknown as Raw);
    return rec;
  });
}

/** Link people ↔ events and people ↔ relationships, by slug. */
export function linkRelations(
  people: PersonRecord[],
  events: EventRecord[],
  relationships: RelationshipRecord[],
  eventPeopleIds: Map<string, string[]>,
  peopleByNotionId: Map<string, { slug: string; name: string }>
): void {
  for (const e of events) {
    const ids = eventPeopleIds.get(e.slug) ?? [];
    e.people = ids.map((id) => peopleByNotionId.get(id)?.slug).filter((s): s is string => !!s);
    e.hash = hashRecord(e as unknown as Raw);
  }
  for (const p of people) {
    p.events = events.filter((e) => e.people.includes(p.slug)).map((e) => e.slug);
    p.relationships = relationships
      .filter((r) => r.from === p.slug || r.to === p.slug)
      .map((r) => r.slug);
    p.hash = hashRecord(p as unknown as Raw);
  }
}
