/**
 * R02 — Archival reference integrity · error   (the highest-value rule here)
 * R03 — Bare figure where a range exists · error
 * R08 — Assessment fencing · error
 * R11 — Tier / verification coherence · warn
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Finding, Rule, RuleContext, Snapshot } from '../model/types.js';
import { EVIDENCE_FIELDS, FALSIFIER_MARKERS, OPINION_MARKERS } from '../model/vocab.js';

const NOT_YET_VERIFIED = 'NOT YET VERIFIED';

/**
 * Reference strings precise enough to identify a single item.
 *
 * The distinction R02 turns on: a series-level range is a legitimate thing to
 * write down before you have been to the archive — you can read it off a
 * published guide. An item-level citation is not. If a record says
 * NOT YET VERIFIED and also carries `3H 1247` or `HR.SYS. 2392/2`, something
 * produced a precise-looking reference without consulting anything, and that
 * is the exact failure the corpus's standing rule exists to prevent.
 */
const ITEM_LEVEL_PATTERNS: { re: RegExp; note: string }[] = [
  // A single carton number, not a range: "3H 1247" but not "3H 314–752".
  { re: /\b\d?[A-Z]{1,3}\s?\d{2,5}\b(?!\s*[–—-]\s*\d)/g, note: 'single carton-level citation' },
  // Ottoman-style item references: HR.SYS. 2392/2, DH.KMS. 29-28.
  { re: /\b[A-Z]{2,3}(?:\.[A-Z]{2,4})*\.?\s?\d{2,5}[/-]\d{1,3}\b/g, note: 'item-level file reference' },
  // Explicit dossier/carton/liasse numbering.
  { re: /\b(?:carton|liasse|dossier|caja|legajo|box|folder)\s+\d+\b/gi, note: 'explicit item number' },
];

/** A range or a whole-series designation is fine at NOT YET VERIFIED. */
const SERIES_LEVEL = /\b\d+\s*[–—-]\s*\d+\b|\bsous-série\b|\bfonds\b|\bséries?\b|\bseries\b|\bc\.\s*\d[\d,]*\s+(articles|cartons|cajas|boxes|volumes)/i;

export const R02: Rule = {
  id: 'R02',
  title: 'Archival reference integrity',
  defaultSeverity: 'error',
  run({ snapshot, severityFor }: RuleContext): Finding[] {
    const findings: Finding[] = [];
    const severity = severityFor('R02', 'error');

    const bodyText = collectBodies(snapshot);

    const records: {
      collection: string;
      slug: string;
      title: string;
      verification: string | null;
      reference: string | null;
    }[] = [
      ...snapshot.sources.map((s) => ({
        collection: 'sources',
        slug: s.slug,
        title: s.title,
        verification: s.verification,
        reference: s.archivalReference,
      })),
      ...snapshot.archives.map((a) => ({
        collection: 'archives',
        slug: a.slug,
        title: a.institution,
        verification: a.verification,
        reference: a.fonds,
      })),
    ];

    for (const rec of records) {
      if (rec.verification !== NOT_YET_VERIFIED) continue;

      // (a) The literal words must appear, in the reference field or in the
      //     dossier text that cites this record.
      const inField = rec.reference?.includes(NOT_YET_VERIFIED) ?? false;
      const inBody = bodyText.includes(NOT_YET_VERIFIED) && bodyText.includes(rec.title.slice(0, 24));
      if (!inField && !inBody) {
        findings.push({
          rule: 'R02',
          severity,
          collection: rec.collection,
          slug: rec.slug,
          field: 'archivalReference',
          message: `Verification is NOT YET VERIFIED but the literal words appear nowhere`,
          detail:
            `A reader scanning the reference must be able to see it is an IOU.\n` +
            `Put "${NOT_YET_VERIFIED}" in the reference field, or in the dossier text that cites it.`,
        });
      }

      // (b) Item-level precision on an unverified record.
      if (!rec.reference) continue;
      for (const { re, note } of ITEM_LEVEL_PATTERNS) {
        re.lastIndex = 0;
        const hits = [...rec.reference.matchAll(re)].map((m) => m[0]);
        for (const hit of hits) {
          // A hit inside a range is series-level and legitimate.
          const around = contextAround(rec.reference, hit);
          if (SERIES_LEVEL.test(around)) continue;
          findings.push({
            rule: 'R02',
            severity,
            collection: rec.collection,
            slug: rec.slug,
            field: 'archivalReference',
            message: `Item-level citation "${hit}" on a record marked ${NOT_YET_VERIFIED}`,
            detail:
              `Detected as: ${note}.\n` +
              `Series-level ranges are fine at this status — you can read them off a published\n` +
              `guide. Item-level precision means something produced a citation without\n` +
              `consulting anything. Verify it, or reduce it to the series.`,
          });
        }
      }
    }

    return findings;
  },
};

function contextAround(text: string, needle: string, radius = 60): string {
  const i = text.indexOf(needle);
  if (i === -1) return text;
  return text.slice(Math.max(0, i - radius), i + needle.length + radius);
}

function collectBodies(snapshot: Snapshot): string {
  return [
    ...snapshot.people.map((p) => p.body ?? ''),
    ...snapshot.events.map((e) => e.body ?? ''),
    ...snapshot.pages.map((p) => p.body ?? ''),
  ].join('\n');
}

// ────────────────────────────────────────────────────────────────── R03

interface Quantity {
  id: string;
  label: string;
  values: number[];
  low: number;
  high: number | null;
  floorOnly?: boolean;
  /**
   * Terms that must appear near the figure for it to be about this quantity.
   *
   * Without this the rule matches by number alone, and 2,000 belongs to three
   * different contested quantities at once — Casablanca 1947, the Rif in
   * 1958-59, and the German estimate for Casablanca 1907. Cross-contamination
   * on that scale makes the rule noise, and the brief is explicit that a noisy
   * rule gets disabled and a disabled rule guards nothing.
   */
  context: string[];
  spread: string;
}

export function loadQuantities(dataDir: string): Quantity[] {
  const raw = JSON.parse(readFileSync(join(dataDir, 'contested-quantities.json'), 'utf8'));
  return raw.quantities as Quantity[];
}

/**
 * Attribution or hedging that makes a single figure legitimate.
 * The corpus does this constantly and correctly.
 */
const QUALIFIED =
  /\b(range|ranges|ranging|variously|between|estimates?|estimated|count|counted|figure|figures|floor|at least|well over|up to|approximately|approx|about|around|c\.|circa|reported|reportedly|alleged|allegedly|per the|according to|gives?|gave|records?|recorded|claims?|puts?|lists?|listed|states?|stated|return of|obelisk|monument|dispute[ds]?|definitional|highest|inclusive|inflates?)\b/i;

/** A written range: the figure is an endpoint, not a bare assertion. */
const RANGE_EXPRESSION =
  /(?<![\d.,])\d[\d,]*\s*(?:[–—-]|to|and)\s*\d[\d,]*(?![\d.,])/g;

export const R03: Rule = {
  id: 'R03',
  title: 'Bare figure where a range exists',
  defaultSeverity: 'error',
  run({ snapshot, severityFor, config }: RuleContext): Finding[] {
    const findings: Finding[] = [];
    const severity = severityFor('R03', 'error');
    const quantities = loadQuantities(config.paths.data);

    const texts = gatherTexts(snapshot);

    for (const q of quantities) {
      for (const value of q.values) {
        const pattern = numberPattern(value);

        for (const t of texts) {
          for (const hit of t.text.matchAll(pattern)) {
            const index = hit.index ?? 0;
            const sentence = sentenceAround(t.text, index);

            // The figure must actually be about this quantity. A number alone
            // is not evidence of subject: 2,000 belongs to several.
            const topical = topicalWindow(t.text, index);
            if (!q.context.some((term) => topical.includes(term.toLowerCase()))) continue;

            // An endpoint of a written range is a range, not a bare figure.
            if (isRangeEndpoint(sentence, hit[0])) continue;

            // Stating the spread is the required behaviour, not a violation.
            const siblingNearby = q.values.some(
              (other) => other !== value && numberPattern(other).test(sentence)
            );
            if (siblingNearby) continue;

            // Attribution or a hedge in the figure's own sentence.
            if (QUALIFIED.test(sentence)) continue;

            findings.push({
              rule: 'R03',
              severity,
              collection: t.collection,
              slug: t.slug,
              field: t.field,
              message: `Bare figure ${hit[0]} for a contested quantity: ${q.label}`,
              detail:
                `The corpus records ${q.floorOnly ? 'a floor' : 'a range'}: ` +
                `${q.low}${q.high ? `–${q.high}` : ' (floor only)'}.\n` +
                `Spread: ${q.spread}\n` +
                `Sentence: "${sentence.trim().slice(0, 180)}"\n` +
                `State the range, or attribute the figure to whoever counted it.`,
            });
          }
        }
      }
    }

    return findings;
  },
};

/**
 * A generous window around the hit, lowercased, for subject matching.
 *
 * Wider than the sentence on purpose: the subject is often established a
 * sentence or two earlier ("Annual, July–August 1921" as a heading, then the
 * figures below it), and missing that produces false negatives — which for
 * this rule are worse than the false positives, since a missed bare figure is
 * exactly what the rule is for.
 */
function topicalWindow(text: string, index: number, radius = 600): string {
  return text.slice(Math.max(0, index - radius), index + radius).toLowerCase();
}

/** True when the matched figure is one end of a written range. */
function isRangeEndpoint(sentence: string, matched: string): boolean {
  RANGE_EXPRESSION.lastIndex = 0;
  for (const m of sentence.matchAll(RANGE_EXPRESSION)) {
    if (m[0].includes(matched)) return true;
  }
  return false;
}

function numberPattern(n: number): RegExp {
  const withCommas = n.toLocaleString('en-GB');
  const bare = String(n);
  return new RegExp(`(?<![\\d.,])(${escapeRe(withCommas)}|${escapeRe(bare)})(?![\\d]|[.,]\\d)`, 'g');
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The figure's own sentence. Block boundaries end a sentence, as full stops do. */
function sentenceAround(text: string, index: number): string {
  const starts = [
    text.lastIndexOf('. ', index),
    text.lastIndexOf('\n', index),
    text.lastIndexOf('; ', index),
    text.lastIndexOf('| ', index),
  ];
  const start = Math.max(...starts, -1) + 1;
  const ends = [text.indexOf('. ', index), text.indexOf('\n', index), text.indexOf(' |', index)]
    .filter((i) => i !== -1);
  const end = ends.length ? Math.min(...ends) + 1 : text.length;
  return text.slice(start, end);
}

interface TextRef {
  collection: string;
  slug: string;
  field: string;
  text: string;
}

function gatherTexts(snapshot: Snapshot): TextRef[] {
  const out: TextRef[] = [];
  const push = (collection: string, slug: string, field: string, text: string | null | undefined) => {
    if (text && text.trim()) out.push({ collection, slug, field, text });
  };

  for (const p of snapshot.people) {
    push('people', p.slug, 'oneLine', p.oneLine);
    push('people', p.slug, 'contestedPoints', p.contestedPoints);
    push('people', p.slug, 'body', p.body);
  }
  for (const e of snapshot.events) {
    push('events', e.slug, 'summary', e.summary);
    push('events', e.slug, 'mainDispute', e.mainDispute);
    push('events', e.slug, 'body', e.body);
  }
  for (const s of snapshot.sources) {
    push('sources', s.slug, 'covers', s.covers);
    push('sources', s.slug, 'biasNotes', s.biasNotes);
  }
  for (const pg of snapshot.pages) {
    push('pages', pg.slug, 'body', pg.body);
  }
  return out;
}

// ────────────────────────────────────────────────────────────────── R08

export const R08: Rule = {
  id: 'R08',
  title: 'Assessment fencing',
  defaultSeverity: 'error',
  run({ snapshot, severityFor }: RuleContext): Finding[] {
    const findings: Finding[] = [];
    const severity = severityFor('R08', 'error');

    // (a) Opinion language in an evidence field.
    const fieldOwners: { collection: string; rows: any[] }[] = [
      { collection: 'people', rows: snapshot.people },
      { collection: 'events', rows: snapshot.events },
      { collection: 'sources', rows: snapshot.sources },
      { collection: 'archives', rows: snapshot.archives },
      { collection: 'relationships', rows: snapshot.relationships },
    ];

    for (const { collection, rows } of fieldOwners) {
      for (const row of rows) {
        for (const field of EVIDENCE_FIELDS) {
          const value = row[field];
          if (typeof value !== 'string' || !value) continue;
          for (const marker of OPINION_MARKERS) {
            const re = new RegExp(`\\b${escapeRe(marker)}\\b`, 'i');
            if (!re.test(value)) continue;
            findings.push({
              rule: 'R08',
              severity,
              collection,
              slug: row.slug,
              field,
              message: `Opinion language "${marker}" in the evidence field ${field}`,
              detail:
                `Evidence fields carry the record; judgement belongs in\n` +
                `"Assessment (signed opinion)", which is never cited as a source.\n` +
                `Found: "${excerpt(value, marker)}"`,
            });
          }
        }
      }
    }

    // (b) An assessment with no falsifier is a warn, not an error: the
    //     standing rule is that an assessment which cannot name its own
    //     falsifier is not a judgement.
    for (const p of snapshot.people) {
      if (!p.assessment) continue;
      const hasFalsifier = FALSIFIER_MARKERS.some((m) =>
        new RegExp(escapeRe(m), 'i').test(p.assessment as string)
      );
      if (!hasFalsifier) {
        findings.push({
          rule: 'R08',
          severity: 'warn',
          collection: 'people',
          slug: p.slug,
          field: 'assessment',
          message: 'Assessment names no falsifier',
          detail:
            `An assessment that cannot say what would change its mind is not a judgement.\n` +
            `Expected language such as: would change · would revise · unless · if evidence showed.`,
        });
      }
    }

    // (c) An assessment cited as a source.
    const assessmentCite =
      /\bAssessment\s*\(signed opinion\)|\bsigned opinion\b|\bmy assessment\b/i;
    for (const s of snapshot.sources) {
      const hay = [s.title, s.author, s.archivalReference, s.covers].filter(Boolean).join(' ');
      if (assessmentCite.test(hay)) {
        findings.push({
          rule: 'R08',
          severity,
          collection: 'sources',
          slug: s.slug,
          message: 'An assessment appears to be cited as a source',
          detail: 'Assessments are explicitly separated from the evidence record. Never cite one.',
        });
      }
    }

    return findings;
  },
};

function excerpt(text: string, marker: string, radius = 60): string {
  const i = text.toLowerCase().indexOf(marker.toLowerCase());
  if (i === -1) return text.slice(0, 120);
  return text.slice(Math.max(0, i - radius), i + marker.length + radius).trim();
}

// ────────────────────────────────────────────────────────────────── R11

export const R11: Rule = {
  id: 'R11',
  title: 'Tier / verification coherence',
  defaultSeverity: 'warn',
  run({ snapshot, severityFor }: RuleContext): Finding[] {
    const findings: Finding[] = [];
    const severity = severityFor('R11', 'warn');

    for (const s of snapshot.sources) {
      if (s.tier === 'PRIMARY_ARCHIVAL' && s.verification === NOT_YET_VERIFIED) {
        findings.push({
          rule: 'R11',
          severity,
          collection: 'sources',
          slug: s.slug,
          message: 'PRIMARY_ARCHIVAL source is NOT YET VERIFIED',
          detail:
            'Legitimate, but it is a promise rather than a citation. Surfaced so the\n' +
            'distinction stays visible while the corpus still leans on it.',
        });
      }

      if (s.tier === 'ACADEMIC' && s.verification === 'Consulted directly' && !s.sourceUrl) {
        findings.push({
          rule: 'R11',
          severity,
          collection: 'sources',
          slug: s.slug,
          message: 'ACADEMIC source marked "Consulted directly" with no URL',
          detail: 'Direct consultation of a published work should be locatable. Add the URL or downgrade.',
        });
      }

      if (s.verification == null) {
        findings.push({
          rule: 'R11',
          severity,
          collection: 'sources',
          slug: s.slug,
          field: 'verification',
          message: 'No verification status recorded',
          detail:
            'Distinct from NOT YET VERIFIED: that is a judgement the corpus has made,\n' +
            'this is one it has not. Recorded as a gap rather than assumed either way.',
        });
      }
    }

    return findings;
  },
};
