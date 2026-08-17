/**
 * R12 — Evidence monotonicity · error   (requires diff)
 * R13 — Range collapse · error          (requires diff)
 *
 * These two are the reason `diff` exists. Everything else can be checked
 * against a single snapshot; drift can only be seen against history.
 */

import type { Finding, Rule, RuleContext, Snapshot } from '../model/types.js';
import { LADDERS, rank } from '../model/vocab.js';

/**
 * Ladder positions where a DECREASE in index is a strengthening.
 * Each entry names the collection, the field, and the ladder it moves along.
 */
const MONOTONIC_FIELDS: {
  collection: keyof Snapshot;
  field: string;
  ladder: readonly string[];
  label: string;
}[] = [
  { collection: 'sources', field: 'verification', ladder: LADDERS.sourceVerification, label: 'Source verification' },
  { collection: 'archives', field: 'verification', ladder: LADDERS.archiveVerification, label: 'Archive verification' },
  { collection: 'sources', field: 'tier', ladder: LADDERS.tier, label: 'Source tier' },
  { collection: 'people', field: 'evidenceBase', ladder: LADDERS.evidenceBase, label: 'Evidence base' },
  {
    collection: 'relationships',
    field: 'evidenceStrength',
    ladder: LADDERS.evidenceStrength,
    label: 'Evidence strength',
  },
];

export const R12: Rule = {
  id: 'R12',
  title: 'Evidence monotonicity',
  defaultSeverity: 'error',
  requiresDiff: true,
  run({ snapshot, previous, severityFor }: RuleContext): Finding[] {
    if (!previous) return [];
    const findings: Finding[] = [];
    const severity = severityFor('R12', 'error');

    // What new evidence appeared between the two snapshots?
    const prevSourceSlugs = new Set(previous.sources.map((s) => s.slug));
    const newSources = snapshot.sources.filter((s) => !prevSourceSlugs.has(s.slug));
    const prevRefs = new Map(previous.sources.map((s) => [s.slug, s.archivalReference ?? '']));
    const prevArchiveRefs = new Map(previous.archives.map((a) => [a.slug, a.fonds ?? '']));

    const sourcesAppeared = newSources.length > 0;

    for (const spec of MONOTONIC_FIELDS) {
      const before = indexBySlug(previous[spec.collection] as any[]);
      const after = indexBySlug(snapshot[spec.collection] as any[]);

      for (const [slug, now] of after) {
        const then = before.get(slug);
        if (!then) continue; // a new record is an addition, not a strengthening

        const wasValue = then[spec.field] as string | null;
        const nowValue = now[spec.field] as string | null;
        if (wasValue === nowValue) continue;

        const wasRank = rank(spec.ladder, wasValue);
        const nowRank = rank(spec.ladder, nowValue);
        // A value outside the ladder (Contested, or a missing verification)
        // is not a rung, so a move into or out of it is not a strengthening.
        if (wasRank == null || nowRank == null) continue;
        if (nowRank >= wasRank) continue; // unchanged or weakened — fine

        // Did this record gain a reference of its own?
        const gainedOwnRef =
          spec.collection === 'sources'
            ? (now.archivalReference ?? '') !== (prevRefs.get(slug) ?? '')
            : spec.collection === 'archives'
              ? (now.fonds ?? '') !== (prevArchiveRefs.get(slug) ?? '')
              : false;

        if (gainedOwnRef || sourcesAppeared) {
          // Accompanied by evidence. Still worth an info line, because
          // "a source appeared somewhere" is a weak justification for a
          // specific record strengthening.
          findings.push({
            rule: 'R12',
            severity: 'info',
            collection: String(spec.collection),
            slug,
            field: spec.field,
            message: `${spec.label} strengthened: ${wasValue} → ${nowValue}`,
            detail: gainedOwnRef
              ? 'Accompanied by a change to this record’s own archival reference.'
              : `Accompanied by ${newSources.length} new Source record(s): ` +
                `${newSources.slice(0, 3).map((s) => s.title.slice(0, 40)).join('; ')}.\n` +
                'Check the new source actually bears on this record.',
          });
          continue;
        }

        findings.push({
          rule: 'R12',
          severity,
          collection: String(spec.collection),
          slug,
          field: spec.field,
          message: `${spec.label} strengthened with no new source: ${wasValue} → ${nowValue}`,
          detail:
            `A claim's status may not strengthen without a source appearing.\n` +
            `No new Source record and no change to this record's archival reference\n` +
            `accompanied this move. This is what an unattended agent talking itself\n` +
            `into confidence looks like.`,
        });
      }
    }

    return findings;
  },
};

function indexBySlug(rows: any[]): Map<string, any> {
  return new Map(rows.map((r) => [r.slug as string, r]));
}

// ────────────────────────────────────────────────────────────────── R13

/** A range: two numbers joined by a dash, "to", or "between … and". */
const RANGE_RE =
  /(?<![\d.,])(\d[\d,]*)\s*(?:[–—-]|to|and)\s*(\d[\d,]*)(?![\d.,])/gi;

/**
 * Fields whose prose is checked for a range collapsing to a single number.
 * These are the ones that carry contested quantities.
 */
const RANGE_FIELDS: { collection: keyof Snapshot; fields: string[] }[] = [
  { collection: 'people', fields: ['oneLine', 'contestedPoints', 'body'] },
  { collection: 'events', fields: ['summary', 'mainDispute', 'body'] },
  { collection: 'sources', fields: ['covers', 'biasNotes'] },
  { collection: 'pages', fields: ['body'] },
];

export const R13: Rule = {
  id: 'R13',
  title: 'Range collapse',
  defaultSeverity: 'error',
  requiresDiff: true,
  run({ snapshot, previous, severityFor }: RuleContext): Finding[] {
    if (!previous) return [];
    const findings: Finding[] = [];
    const severity = severityFor('R13', 'error');

    for (const spec of RANGE_FIELDS) {
      const before = indexBySlug(previous[spec.collection] as any[]);
      const after = indexBySlug(snapshot[spec.collection] as any[]);

      for (const [slug, now] of after) {
        const then = before.get(slug);
        if (!then) continue;

        for (const field of spec.fields) {
          const wasText = (then[field] as string) ?? '';
          const nowText = (now[field] as string) ?? '';
          if (!wasText || wasText === nowText) continue;

          const wasRanges = extractRanges(wasText);
          if (!wasRanges.length) continue;
          const nowRanges = extractRanges(nowText);
          const nowRangeKeys = new Set(nowRanges.map((r) => r.key));

          for (const range of wasRanges) {
            if (nowRangeKeys.has(range.key)) continue; // range survived

            // The range is gone. Did one of its endpoints survive alone?
            const survivors = [range.low, range.high].filter((n) =>
              new RegExp(`(?<![\\d.,])(${escapeRe(n)}|${escapeRe(stripCommas(n))})(?![\\d]|[.,]\\d)`).test(
                nowText
              )
            );
            if (survivors.length === 0) continue; // removed entirely, not collapsed

            findings.push({
              rule: 'R13',
              severity,
              collection: String(spec.collection),
              slug,
              field,
              message: `Range ${range.low}–${range.high} collapsed to ${survivors.join(' / ')}`,
              detail:
                `Was: "${excerptAround(wasText, range.low)}"\n` +
                `Now: "${excerptAround(nowText, survivors[0]!)}"\n` +
                `This is the signature failure mode of automated summarisation, and it is\n` +
                `invisible to anyone reading the page afterwards.`,
            });
          }
        }
      }
    }

    return findings;
  },
};

interface Range {
  low: string;
  high: string;
  key: string;
}

function extractRanges(text: string): Range[] {
  const out: Range[] = [];
  RANGE_RE.lastIndex = 0;
  for (const m of text.matchAll(RANGE_RE)) {
    const low = m[1]!;
    const high = m[2]!;
    // Ignore year ranges and small counts; contested quantities are larger.
    const lowN = Number(stripCommas(low));
    const highN = Number(stripCommas(high));
    if (!Number.isFinite(lowN) || !Number.isFinite(highN)) continue;
    if (highN <= lowN) continue;
    out.push({ low, high, key: `${stripCommas(low)}-${stripCommas(high)}` });
  }
  return out;
}

const stripCommas = (s: string) => s.replace(/,/g, '');
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function excerptAround(text: string, needle: string, radius = 70): string {
  const i = text.indexOf(needle);
  if (i === -1) return text.slice(0, 140).trim();
  return text
    .slice(Math.max(0, i - radius), i + needle.length + radius)
    .replace(/\s+/g, ' ')
    .trim();
}
