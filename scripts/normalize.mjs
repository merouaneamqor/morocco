#!/usr/bin/env node
/**
 * Normalize the raw Notion cache into typed content collections.
 *
 * Input:  .cache/notion-raw/{people,events,sources,archives,relationships,places,groups}.json
 * Output: src/content/data/*.json  + derived indexes
 *
 * The one rule that governs this file: it may reshape and it may add, but it
 * may never rewrite a value the corpus states. `Born` and `Died` in particular
 * pass through as verbatim strings. Where a sort key is needed, it is emitted
 * as a separate `_derivedYear` field whose name says it is derived.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  slugifyUnique,
  slugify,
  notionId,
  fold,
  hasArabic,
  splitQuotedVariants,
} from './lib/slugify.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, '.cache', 'notion-raw');
const OUT = join(ROOT, 'src', 'content', 'data');

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
];

const read = (name) => JSON.parse(readFileSync(join(RAW, `${name}.json`), 'utf8'));

/** Notion SQL returns multi-selects as JSON-encoded strings; hand-written cache files use real arrays. */
function arr(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('[')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        /* fall through to single-value treatment */
      }
    }
    return trimmed ? [trimmed] : [];
  }
  return [value];
}

const clean = (v) => (typeof v === 'string' ? v.trim() : v ?? null);

/**
 * Pull a 4-digit year out of a free-text date for sorting only.
 * Returns null rather than guessing when the string has no year at all.
 * Never used for display.
 */
function derivedYear(text) {
  if (!text) return null;
  const m = String(text).match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
  return m ? Number(m[1]) : null;
}

/** Split the corpus's `·`-separated alias strings into tagged variants. */
function parseAliases(raw) {
  if (!raw) return [];
  return String(raw)
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((variant) => {
      // The corpus tags tradition inline: "Fr. archives: 'Moha ou Hammou'"
      const m = variant.match(/^(Tamazight|Tarifit|Tashelhit|Fr\.?\s*archives?|Fr\.?|Sp\.?|Ar\.?|Eng\.?|Sp\.\/Eng\.|Fr\.\/Eng\.)\s*:\s*(.+)$/i);
      let tradition = null;
      let rest = variant;
      if (m) {
        tradition = m[1].replace(/\.$/, '');
        rest = m[2].trim();
      }
      // One tagged field may hold several archival forms; each becomes a term.
      return splitQuotedVariants(rest).map((value) => {
        const script = hasArabic(value) ? 'arabic' : 'latin';
        return {
          value,
          tradition: tradition ?? (script === 'arabic' ? 'Ar' : null),
          script,
          folded: fold(value),
        };
      });
    });
}

function main() {
  mkdirSync(OUT, { recursive: true });

  const idToSlug = new Map(); // notion page id → { slug, collection, name }
  const redirects = {}; // previous-slug → current-slug (stable across title changes)

  // ---------------------------------------------------------------- people
  const takenPeople = new Map();
  const people = read('people').map((r) => {
    const slug = slugifyUnique(r.Name, takenPeople);
    const id = notionId(r.url);
    idToSlug.set(id, { slug, collection: 'people', name: r.Name });
    return {
      slug,
      notionId: id,
      name: r.Name,
      aliasesRaw: clean(r['Aliases & spellings']),
      aliases: parseAliases(r['Aliases & spellings']),
      born: clean(r.Born), // verbatim — never parsed to a date
      died: clean(r.Died), // verbatim — never parsed to a date
      _derivedBornYear: derivedYear(r.Born),
      _derivedDiedYear: derivedYear(r.Died),
      category: arr(r.Category),
      region: arr(r.Region),
      phase: arr(r.Phase),
      dossierStatus: clean(r['Dossier status']),
      evidenceBase: clean(r['Evidence base']),
      oneLine: clean(r['One-line']),
      contestedPoints: clean(r['Contested points']),
    };
  });

  // ---------------------------------------------------------------- events
  const takenEvents = new Map();
  const events = read('events').map((r) => {
    const slug = slugifyUnique(r.Event, takenEvents);
    const id = notionId(r.url);
    idToSlug.set(id, { slug, collection: 'events', name: r.Event });
    return {
      slug,
      notionId: id,
      event: r.Event,
      start: clean(r.Start),
      end: clean(r.End),
      location: clean(r.Location),
      phase: clean(r.Phase),
      type: arr(r.Type),
      dossierStatus: clean(r['Dossier status']),
      summary: clean(r.Summary),
      mainDispute: clean(r['Main dispute']),
      _peopleIds: arr(r['People involved']).map(notionId).filter(Boolean),
    };
  });

  // --------------------------------------------------------------- sources
  const takenSources = new Map();
  const sources = read('sources').map((r) => {
    const slug = slugifyUnique(r.Title, takenSources);
    const id = notionId(r.url);
    idToSlug.set(id, { slug, collection: 'sources', name: r.Title });
    return {
      slug,
      notionId: id,
      title: r.Title,
      author: clean(r['Author / producer']),
      date: clean(r.Date),
      publisher: clean(r['Institution / publisher']),
      language: arr(r.Language),
      tier: clean(r.Tier),
      url: clean(r.URL),
      archivalReference: clean(r['Archival reference']),
      verification: clean(r.Verification),
      biasNotes: clean(r['Bias notes']),
      covers: clean(r.Covers),
    };
  });

  // -------------------------------------------------------------- archives
  const takenArchives = new Map();
  const archives = read('archives').map((r) => {
    const slug = slugifyUnique(r.Institution, takenArchives);
    const id = notionId(r.url);
    idToSlug.set(id, { slug, collection: 'archives', name: r.Institution });
    return {
      slug,
      notionId: id,
      institution: r.Institution,
      country: clean(r.Country),
      city: clean(r.City),
      fonds: clean(r['Fonds / series']),
      coveringDates: clean(r['Covering dates']),
      holdings: clean(r.Holdings),
      whatItCanSettle: clean(r['What it can settle']),
      access: clean(r.Access),
      digitised: clean(r.Digitised),
      verification: clean(r.Verification),
      priority: clean(r.Priority),
      url: clean(r.URL),
    };
  });

  // ---------------------------------------------------------------- places
  const takenPlaces = new Map();
  const places = read('places').map((r) => {
    const slug = slugifyUnique(r.Place, takenPlaces);
    const id = notionId(r.url);
    idToSlug.set(id, { slug, collection: 'places', name: r.Place });
    return {
      slug,
      notionId: id,
      place: r.Place,
      otherNames: clean(r['Other names']),
      aliases: parseAliases(r['Other names']),
      region: clean(r.Region),
      zone: clean(r.Zone),
      whyItMatters: clean(r['Why it matters']),
      tribes: clean(r.Tribes),
      militaryPresence: clean(r['Military presence']),
    };
  });

  // ---------------------------------------------------------------- groups
  const takenGroups = new Map();
  const groups = read('groups').map((r) => {
    const slug = slugifyUnique(r.Group, takenGroups);
    const id = notionId(r.url);
    idToSlug.set(id, { slug, collection: 'groups', name: r.Group });
    return {
      slug,
      notionId: id,
      group: r.Group,
      otherNames: clean(r['Other names']),
      aliases: parseAliases(r['Other names']),
      type: clean(r.Type),
      language: arr(r.Language),
      region: clean(r.Region),
      politicalPosition: clean(r['Political position']),
      notes: clean(r.Notes),
    };
  });

  // --------------------------------------------------------- relationships
  // Resolved last: every edge endpoint must already be in idToSlug.
  const takenRels = new Map();
  const unresolved = [];
  const relationships = read('relationships').map((r) => {
    const slug = slugifyUnique(r.Relationship, takenRels);
    const fromId = notionId(arr(r.From)[0]);
    const toId = notionId(arr(r.To)[0]);
    const from = idToSlug.get(fromId);
    const to = idToSlug.get(toId);
    if (!from) unresolved.push({ edge: r.Relationship, side: 'From', id: fromId });
    if (!to) unresolved.push({ edge: r.Relationship, side: 'To', id: toId });
    return {
      slug,
      notionId: notionId(r.url),
      label: r.Relationship,
      from: from?.slug ?? null,
      fromName: from?.name ?? null,
      to: to?.slug ?? null,
      toName: to?.name ?? null,
      relation: clean(r.Relation),
      period: clean(r.Period),
      evidence: clean(r.Evidence),
      evidenceStrength: clean(r['Evidence strength']),
    };
  });

  if (unresolved.length) {
    // A dangling edge means a person was deleted from the corpus without the
    // edge being removed. Loud, not silent — the site must not draw a graph
    // with invented endpoints.
    console.error('\n  Unresolved relationship endpoints:');
    for (const u of unresolved) console.error(`   ${u.side} of "${u.edge}" → ${u.id}`);
    throw new Error(`${unresolved.length} relationship endpoint(s) could not be resolved to a person.`);
  }

  // Back-link events → people by slug, and people → events.
  const peopleBySlug = new Map(people.map((p) => [p.slug, p]));
  for (const e of events) {
    e.people = e._peopleIds.map((id) => idToSlug.get(id)?.slug).filter(Boolean);
    delete e._peopleIds;
  }
  for (const p of people) {
    p.events = events.filter((e) => e.people.includes(p.slug)).map((e) => e.slug);
    p.relationships = relationships
      .filter((r) => r.from === p.slug || r.to === p.slug)
      .map((r) => r.slug);
  }

  // ------------------------------------------------------ derived indexes
  const graph = {
    nodes: people.map((p) => ({
      id: p.slug,
      label: p.name,
      // Narrative position drives colour — exactly three categorical slots
      // plus a recessive grey, per the design system. Assigned from Category.
      group: narrativePosition(p.category),
      shape: 'circle',
      depth: p.dossierStatus,
      phase: p.phase,
      category: p.category,
      degree: 0,
    })),
    edges: relationships.map((r) => ({
      source: r.from,
      target: r.to,
      relation: r.relation,
      strength: r.evidenceStrength,
      period: r.period,
      evidence: r.evidence,
      id: r.slug,
    })),
  };
  const degree = new Map();
  for (const e of graph.edges) {
    degree.set(e.source, (degree.get(e.source) || 0) + 1);
    degree.set(e.target, (degree.get(e.target) || 0) + 1);
  }
  for (const n of graph.nodes) n.degree = degree.get(n.id) || 0;

  const timeline = {
    phases: PHASES,
    events: events
      .map((e) => ({
        slug: e.slug,
        label: e.event,
        start: e.start,
        end: e.end,
        phase: e.phase,
        type: e.type,
        summary: e.summary,
        mainDispute: e.mainDispute,
        dossierStatus: e.dossierStatus,
      }))
      .sort((a, b) => String(a.start || '').localeCompare(String(b.start || ''))),
    // Fuzzy spans come from the corpus's own disputed-date language, not from
    // guessing. Each is declared explicitly with the reason it is fuzzy.
    uncertain: [
      {
        label: "Ma al-ʿAynayn appointed khalifa of the Sahara",
        from: 1879,
        to: 1887,
        subject: 'ma-al-aynayn',
        why: "A dahir appointing him representative over Saharan territories. The date determines whether the act preceded or responded to Spanish occupation at Dakhla — which is the crux of the modern territorial argument.",
        dispute: 'ma-al-aynayns-appointment',
      },
      {
        label: 'Mouha ou Hammou Zayani invested as qaid of the Zaian',
        from: 1877,
        to: 1886,
        subject: 'mouha-ou-hammou-zayani',
        why: 'Three different years — 1877, 1880 and 1886 — appear in works of comparable authority.',
      },
      {
        label: 'Mouha ou Hammou Zayani born',
        from: 1857,
        to: 1863,
        subject: 'mouha-ou-hammou-zayani',
        why: 'c. 1857 or c. 1863, Middle Atlas — not established.',
      },
    ],
  };

  const searchIndex = buildSearchIndex({ people, events, sources, archives, places, groups });

  // ------------------------------------------------------------- emit
  const write = (name, data) => {
    writeFileSync(join(OUT, `${name}.json`), JSON.stringify(data, null, 1));
    return Array.isArray(data) ? data.length : Object.keys(data).length;
  };

  const counts = {
    people: write('people', people),
    events: write('events', events),
    sources: write('sources', sources),
    archives: write('archives', archives),
    places: write('places', places),
    groups: write('groups', groups),
    relationships: write('relationships', relationships),
  };
  write('graph', graph);
  write('timeline', timeline);
  write('search-index', searchIndex);
  write('redirects', redirects);

  console.log('  Normalized:');
  for (const [k, v] of Object.entries(counts)) console.log(`   ${String(v).padStart(3)}  ${k}`);
  console.log(`   ${String(graph.edges.length).padStart(3)}  graph edges`);
  console.log(`   ${String(searchIndex.length).padStart(3)}  search records`);
}

/**
 * Map a person's categories to one of exactly three coloured slots plus grey.
 * Order matters: a person who is both "Tribal leader" and "Makhzen official"
 * is Moroccan; a French officer who later served Spain is French. First match
 * in this order wins, and the order is fixed so colour follows the entity and
 * never changes under filtering.
 */
function narrativePosition(categories) {
  const c = new Set(categories);
  const moroccan = [
    'Sultan / monarch',
    'Makhzen official',
    'Tribal leader',
    'Religious leader',
    'Armed resistance',
    'Nationalist',
    'Collaborating notable',
  ];
  const french = ['French military', 'French civil'];
  const spanish = ['Spanish military', 'Spanish civil'];
  if (moroccan.some((x) => c.has(x))) return 'moroccan';
  if (french.some((x) => c.has(x))) return 'french';
  if (spanish.some((x) => c.has(x))) return 'spanish';
  return 'other'; // Ottoman, German, British, US, Italian — deliberately recessive
}

/**
 * Build the client search index. Every alias variant is a first-class term,
 * and every term carries its folded form so diacritics fold both ways.
 */
function buildSearchIndex({ people, events, sources, archives, places, groups }) {
  const records = [];

  for (const p of people) {
    const terms = [p.name, ...p.aliases.map((a) => a.value)];
    records.push({
      type: 'person',
      slug: p.slug,
      url: `/people/${p.slug}`,
      title: p.name,
      subtitle: p.oneLine,
      terms,
      folded: [...new Set(terms.map(fold).filter(Boolean))],
      phase: p.phase,
      status: p.evidenceBase,
      dossierStatus: p.dossierStatus,
    });
  }
  for (const e of events) {
    records.push({
      type: 'event',
      slug: e.slug,
      url: `/events/${e.slug}`,
      title: e.event,
      subtitle: e.summary,
      terms: [e.event, e.location].filter(Boolean),
      folded: [fold(e.event), fold(e.location)].filter(Boolean),
      phase: e.phase ? [e.phase] : [],
      status: e.dossierStatus,
    });
  }
  for (const s of sources) {
    records.push({
      type: 'source',
      slug: s.slug,
      url: `/sources#${s.slug}`,
      title: s.title,
      subtitle: s.author,
      terms: [s.title, s.author, s.archivalReference].filter(Boolean),
      folded: [fold(s.title), fold(s.author)].filter(Boolean),
      phase: [],
      tier: s.tier,
      verification: s.verification,
    });
  }
  for (const a of archives) {
    records.push({
      type: 'archive',
      slug: a.slug,
      url: `/archives#${a.slug}`,
      title: a.institution,
      subtitle: `${a.city ?? ''} — ${a.country ?? ''}`.replace(/^ — | — $/, ''),
      terms: [a.institution, a.city, a.country, a.fonds].filter(Boolean),
      folded: [fold(a.institution), fold(a.city), fold(a.country)].filter(Boolean),
      phase: [],
      country: a.country,
      priority: a.priority,
    });
  }
  for (const pl of places) {
    const terms = [pl.place, ...pl.aliases.map((a) => a.value)];
    records.push({
      type: 'place',
      slug: pl.slug,
      url: `/places#${pl.slug}`,
      title: pl.place,
      subtitle: pl.region,
      terms,
      folded: [...new Set(terms.map(fold).filter(Boolean))],
      phase: [],
      zone: pl.zone,
    });
  }
  for (const g of groups) {
    const terms = [g.group, ...g.aliases.map((a) => a.value)];
    records.push({
      type: 'group',
      slug: g.slug,
      url: `/groups#${g.slug}`,
      title: g.group,
      subtitle: g.type,
      terms,
      folded: [...new Set(terms.map(fold).filter(Boolean))],
      phase: [],
    });
  }

  return records;
}

main();
