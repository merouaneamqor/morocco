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
          isNote: isProseNote(value),
        };
      });
    });
}

/**
 * Is this alias entry a name, or a note about the name?
 *
 * The corpus sometimes writes a caveat into `Aliases & spellings` — the
 * unresolved Ben Hammou record carries "Name as supplied. … Do not merge with
 * Mouha ou Hammou Zayani or with his sons without evidence."
 *
 * Indexing that as a spelling made a search for "Zayani" land on the one
 * record that exists to warn against exactly that conflation. So a prose note
 * is still displayed — corpus text is never dropped — but it is not offered
 * as a name someone can be found under.
 *
 * Both conditions are required. A sentence break alone would misread
 * abbreviations, and length alone would misread multi-form entries like
 * "Mouha ou Hammou Zaïani / Zaïani / Zayani".
 */
function isProseNote(value) {
  const s = String(value ?? '');
  return /\.\s+\S/.test(s) && s.split(/\s+/).length >= 6;
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
      impact: clean(r.Impact),
      oneLine: clean(r['One-line']),
      contestedPoints: clean(r['Contested points']),
      // Judgement, carried through verbatim and fenced by the renderer.
      assessment: clean(r['Assessment (signed opinion)']),
      lastReviewed: clean(r['Last reviewed']),
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
      // The research-agenda columns. `notYetSearched` is the point of the
      // whole explorer: it records what a researcher still has to go and do,
      // so a null here means "nobody has written the backlog down yet", which
      // is not the same as "nothing left to search". The templates say so.
      searchTerms: clean(r['Search terms to use']),
      notYetSearched: clean(r['Not yet searched']),
      language: arr(r.Language),
      _relatedPeopleIds: arr(r['Related people']).map(notionId).filter(Boolean),
      _relatedEventIds: arr(r['Related events']).map(notionId).filter(Boolean),
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

  // ---------------------------------------------------- claims & disputes
  // The claim is the core object: everything below resolves onto it.
  //
  // Relations are resolved through the same idToSlug map the graph uses, so a
  // claim can never point at a person the site does not render. A relation
  // that fails to resolve is collected and thrown on, exactly as a dangling
  // relationship edge is — an invented endpoint is the one thing this corpus
  // cannot afford.
  const danglingClaimRefs = [];
  const resolveMany = (values, label, where) =>
    arr(values)
      .map(notionId)
      .filter(Boolean)
      .map((id) => {
        const hit = idToSlug.get(id);
        if (!hit) danglingClaimRefs.push({ where, label, id });
        return hit ?? null;
      })
      .filter(Boolean);

  const takenDisputeRecords = new Map();
  const disputeRecords = read('dispute-records').map((r) => {
    const slug = slugifyUnique(r.Dispute, takenDisputeRecords);
    idToSlug.set(notionId(r.url), { slug, collection: 'dispute-records', name: r.Dispute });
    return {
      slug,
      notionId: notionId(r.url),
      dispute: r.Dispute,
      // The four positions stay separate fields and are never merged into a
      // single "what happened". A null is rendered as a visible em-dash: the
      // absence of a Spanish position is itself information.
      positions: {
        french: clean(r['French position']),
        spanish: clean(r['Spanish position']),
        moroccan: clean(r['Moroccan position']),
        other: clean(r['Other position']),
      },
      currentAssessment: clean(r['Current assessment']),
      whySourcesDisagree: clean(r['Why the sources disagree']),
      status: clean(r.Status),
      phase: clean(r.Phase),
      _peopleIds: arr(r.People),
      _eventIds: arr(r.Events),
      _claimIds: arr(r['Related claims']),
    };
  });

  const takenOpenQuestions = new Map();
  const openQuestions = read('open-questions').map((r) => {
    const slug = slugifyUnique(r.Question, takenOpenQuestions);
    idToSlug.set(notionId(r.url), { slug, collection: 'open-questions', name: r.Question });
    return {
      slug,
      notionId: notionId(r.url),
      question: r.Question,
      whatWeKnow: clean(r['What we know']),
      missingEvidence: clean(r['Missing evidence']),
      documentsRequested: clean(r['Documents requested']),
      whyWeDontKnow: clean(r["Why we don't know"]),
      researchStatus: clean(r['Research status']),
      phase: clean(r.Phase),
      _archiveIds: arr(r['Archives likely to hold it']),
      _peopleIds: arr(r.People),
      _eventIds: arr(r.Events),
      _claimIds: arr(r['Related claims']),
    };
  });

  const takenClaims = new Map();
  const claims = read('claims').map((r) => {
    const slug = slugifyUnique(r.Claim, takenClaims);
    idToSlug.set(notionId(r.url), { slug, collection: 'claims', name: r.Claim });
    return {
      slug,
      notionId: notionId(r.url),
      claim: r.Claim,
      confidence: clean(r.Confidence),
      evidenceLayer: clean(r['Evidence layer']),
      phase: clean(r.Phase),
      // Verbatim or nothing. The site renders a null here as an explicit
      // "not yet consulted directly" state rather than an empty panel, so a
      // reader can never mistake silence for a quotation.
      whatTheDocumentSays: clean(r['What the document says']),
      interpretation: clean(r.Interpretation),
      counterEvidence: clean(r['Counter-evidence']),
      whySourcesDisagree: clean(r['Why sources disagree']),
      archivalReference: clean(r['Archival reference']),
      _primaryEvidenceIds: arr(r['Primary evidence']),
      _counterEvidenceIds: arr(r['Counter-evidence sources']),
      _archiveIds: arr(r.Archive),
      _peopleIds: arr(r.People),
      _eventIds: arr(r.Events),
      _disputeIds: arr(r.Disputes),
      _openQuestionIds: arr(r['Open questions']),
      lastReviewed: clean(r['Last reviewed']),
    };
  });

  const bibliography = read('bibliography').map((r) => ({
    slug: slugify(r.Entry ?? ''),
    notionId: notionId(r.url),
    entry: clean(r.Entry),
    type: clean(r.Type),
    authors: clean(r['Author(s)']),
    year: clean(r.Year), // text, never parsed — same rule as Born/Died
    identifier: clean(r.Identifier),
    url: clean(r['Catalogue/access URL']),
    language: arr(r.Language),
    notes: clean(r.Notes),
  }));

  // Resolve every claim/dispute/question relation now that all ids are known.
  const slugsOf = (ids, label, where) => resolveMany(ids, label, where).map((h) => h.slug);
  for (const c of claims) {
    c.primaryEvidence = slugsOf(c._primaryEvidenceIds, 'Primary evidence', c.slug);
    c.counterEvidenceSources = slugsOf(c._counterEvidenceIds, 'Counter-evidence sources', c.slug);
    c.archives = slugsOf(c._archiveIds, 'Archive', c.slug);
    c.people = slugsOf(c._peopleIds, 'People', c.slug);
    c.events = slugsOf(c._eventIds, 'Events', c.slug);
    c.disputes = slugsOf(c._disputeIds, 'Disputes', c.slug);
    c.openQuestions = slugsOf(c._openQuestionIds, 'Open questions', c.slug);
    for (const k of Object.keys(c)) if (k.startsWith('_')) delete c[k];
  }
  for (const d of disputeRecords) {
    d.people = slugsOf(d._peopleIds, 'People', d.slug);
    d.events = slugsOf(d._eventIds, 'Events', d.slug);
    d.claims = slugsOf(d._claimIds, 'Related claims', d.slug);
    for (const k of Object.keys(d)) if (k.startsWith('_')) delete d[k];
  }
  for (const q of openQuestions) {
    q.archives = slugsOf(q._archiveIds, 'Archives likely to hold it', q.slug);
    q.people = slugsOf(q._peopleIds, 'People', q.slug);
    q.events = slugsOf(q._eventIds, 'Events', q.slug);
    q.claims = slugsOf(q._claimIds, 'Related claims', q.slug);
    for (const k of Object.keys(q)) if (k.startsWith('_')) delete q[k];
  }
  for (const a of archives) {
    a.relatedPeople = a._relatedPeopleIds
      .map((id) => idToSlug.get(id)?.slug)
      .filter(Boolean);
    a.relatedEvents = a._relatedEventIds.map((id) => idToSlug.get(id)?.slug).filter(Boolean);
    delete a._relatedPeopleIds;
    delete a._relatedEventIds;
  }

  if (danglingClaimRefs.length) {
    console.error('\n  Unresolved claim/dispute/question relations:');
    for (const d of danglingClaimRefs) console.error(`   ${d.where} → ${d.label} → ${d.id}`);
    throw new Error(`${danglingClaimRefs.length} relation(s) could not be resolved.`);
  }

  // Back-links, so a person page can list its claims without scanning.
  for (const c of claims) {
    for (const d of c.disputes) {
      const rec = disputeRecords.find((x) => x.slug === d);
      if (rec && !rec.claims.includes(c.slug)) rec.claims.push(c.slug);
    }
  }
  for (const a of archives) {
    a.claims = claims.filter((c) => c.archives.includes(a.slug)).map((c) => c.slug);
    a.openQuestions = openQuestions.filter((q) => q.archives.includes(a.slug)).map((q) => q.slug);
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
    p.claims = claims.filter((c) => c.people.includes(p.slug)).map((c) => c.slug);
    p.disputes = disputeRecords.filter((d) => d.people.includes(p.slug)).map((d) => d.slug);
    // "Archives holding material on this person" — the section that actually
    // delivers the side-by-side French/Spanish/Moroccan comparison per figure.
    p.archives = archives.filter((a) => a.relatedPeople.includes(p.slug)).map((a) => a.slug);
  }
  for (const e of events) {
    e.claims = claims.filter((c) => c.events.includes(e.slug)).map((c) => c.slug);
    e.disputes = disputeRecords.filter((d) => d.events.includes(e.slug)).map((d) => d.slug);
    e.openQuestions = openQuestions.filter((q) => q.events.includes(e.slug)).map((q) => q.slug);
    e.archives = archives.filter((a) => a.relatedEvents.includes(e.slug)).map((a) => a.slug);
  }

  // ------------------------------------------------------ derived indexes
  // The graph carries four node kinds now: person, claim, source and archive.
  //
  // Colour stays on the three-slot narrative-tradition palette — a network
  // view puts every pair on screen at once, and the palette only clears its
  // separation floors at three categorical slots under that condition. Node
  // *kind* is therefore encoded as shape, never as a fourth hue.
  //
  // It ships sparse on purpose. Five claims is what the corpus has; padding
  // the graph to look denser would be the same failure as smoothing a gap.
  const graph = {
    nodes: [
      ...people.map((p) => ({
        id: `person:${p.slug}`,
        slug: p.slug,
        kind: 'person',
        label: p.name,
        group: narrativePosition(p.category),
        shape: 'circle',
        depth: p.dossierStatus,
        phase: p.phase,
        category: p.category,
        degree: 0,
      })),
      ...claims.map((c) => ({
        id: `claim:${c.slug}`,
        slug: c.slug,
        kind: 'claim',
        label: c.claim,
        group: 'unaligned',
        shape: 'diamond',
        confidence: c.confidence,
        evidenceLayer: c.evidenceLayer,
        phase: c.phase ? [c.phase] : [],
        degree: 0,
      })),
      ...sources.map((s) => ({
        id: `source:${s.slug}`,
        slug: s.slug,
        kind: 'source',
        label: s.title,
        group: 'unaligned',
        shape: 'square',
        tier: s.tier,
        verification: s.verification,
        phase: [],
        degree: 0,
      })),
      ...archives.map((a) => ({
        id: `archive:${a.slug}`,
        slug: a.slug,
        kind: 'archive',
        label: a.institution,
        group: 'unaligned',
        shape: 'triangle',
        country: a.country,
        priority: a.priority,
        phase: [],
        degree: 0,
      })),
    ],
    edges: [
      ...relationships.map((r) => ({
        source: `person:${r.from}`,
        target: `person:${r.to}`,
        kind: 'person-person',
        relation: r.relation,
        strength: r.evidenceStrength,
        period: r.period,
        evidence: r.evidence,
        id: r.slug,
      })),
      ...claims.flatMap((c) => [
        ...c.people.map((p) => ({
          source: `person:${p}`,
          target: `claim:${c.slug}`,
          kind: 'person-claim',
          relation: 'is the subject of',
          id: `${p}--${c.slug}`,
        })),
        ...c.primaryEvidence.map((s) => ({
          source: `claim:${c.slug}`,
          target: `source:${s}`,
          kind: 'claim-source',
          relation: 'rests on',
          id: `${c.slug}--${s}`,
        })),
        ...c.counterEvidenceSources.map((s) => ({
          source: `claim:${c.slug}`,
          target: `source:${s}`,
          kind: 'claim-counter-source',
          relation: 'is contradicted by',
          id: `${c.slug}--counter--${s}`,
        })),
        ...c.archives.map((a) => ({
          source: `claim:${c.slug}`,
          target: `archive:${a}`,
          kind: 'claim-archive',
          relation: 'would be settled at',
          id: `${c.slug}--${a}`,
        })),
      ]),
      // Claim ↔ claim "contradicts", derived from sharing a Disputes row.
      // Derived, not asserted: two claims in one dispute are in tension by
      // construction, which is the only basis the corpus actually has.
      ...disputeRecords.flatMap((d) =>
        d.claims.flatMap((a, i) =>
          d.claims.slice(i + 1).map((b) => ({
            source: `claim:${a}`,
            target: `claim:${b}`,
            kind: 'claim-claim',
            relation: 'contradicts',
            via: d.slug,
            id: `${a}--contradicts--${b}`,
          }))
        )
      ),
    ],
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
    // NOT `claims.json` — that name belongs to the prose-extracted claim
    // markers written by extract-claims.mjs, which is a different thing with
    // a different shape. Two collections called claims is how one silently
    // overwrites the other.
    'claim-records': write('claim-records', claims),
    'dispute-records': write('dispute-records', disputeRecords),
    'open-questions': write('open-questions', openQuestions),
    bibliography: write('bibliography', bibliography),
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
    // Notes are displayed on the dossier but are not findable names.
    const terms = [p.name, ...p.aliases.filter((a) => !a.isNote).map((a) => a.value)];
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
