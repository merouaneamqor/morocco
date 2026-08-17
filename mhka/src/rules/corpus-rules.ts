/**
 * R04 — Unmarked colonial vocabulary · warn
 * R05 — Name conflation and duplicates · error / warn
 * R07 — Claim-status coherence · warn
 * R09 — Relation integrity · warn
 * R10 — Staleness · info
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Finding, Rule, RuleContext, Snapshot } from '../model/types.js';
import { COLONIAL_WATCHLIST } from '../model/vocab.js';
import { foldKey } from '../alias/fold.js';
import { scoreNames } from '../alias/match.js';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ────────────────────────────────────────────────────────────────── R04

/**
 * A term is *marked* when it sits in quotation, in a blockquote, in italics or
 * inline code, or inside an explanatory construction.
 *
 * The brief is explicit that a noisy rule gets disabled and a disabled rule
 * guards nothing, so this errs toward silence. `pacification` in particular is
 * almost always discussed rather than used, and the explanatory test catches
 * that.
 */
const EXPLANATORY =
  /\b(usage|category|categories|filed|classif|label|vocabulary|terminology|so-called|what the|means?|meant|denote|administrative|in French|in Spanish|French term|Spanish term|the word|the term|quotation|scare quotes)\b/i;

/**
 * Attribution: the term is named as the coloniser's own, which is the marked
 * form the corpus uses in prose.
 *
 * "after the date France declared the pacification of Morocco complete" is
 * doing the right thing — it says whose word this is. Flagging it would be a
 * false positive, and false positives are what get a rule switched off.
 */
const ATTRIBUTED =
  /\b(France|French|Spain|Spanish|Protectorate|Residency|Résidence|Makhzen|colonial|coloniser|Bureau des Affaires)\b[^.]{0,80}?\b(declared|called|filed|classified|termed|described|labelled|labeled|deemed|considered|regarded|reported|recorded|used|says?|said|claimed|announced|proclaimed)\b/i;

export const R04: Rule = {
  id: 'R04',
  title: 'Unmarked colonial vocabulary',
  defaultSeverity: 'warn',
  run({ snapshot, severityFor }: RuleContext): Finding[] {
    const findings: Finding[] = [];
    const severity = severityFor('R04', 'warn');

    const texts: { collection: string; slug: string; field: string; text: string }[] = [];
    for (const p of snapshot.people) {
      if (p.oneLine) texts.push({ collection: 'people', slug: p.slug, field: 'oneLine', text: p.oneLine });
      if (p.body) texts.push({ collection: 'people', slug: p.slug, field: 'body', text: p.body });
    }
    for (const e of snapshot.events) {
      if (e.summary) texts.push({ collection: 'events', slug: e.slug, field: 'summary', text: e.summary });
      if (e.body) texts.push({ collection: 'events', slug: e.slug, field: 'body', text: e.body });
    }
    for (const pg of snapshot.pages) {
      texts.push({ collection: 'pages', slug: pg.slug, field: 'body', text: pg.body });
    }

    for (const t of texts) {
      const lines = t.text.split(/\r?\n/);
      lines.forEach((line, i) => {
        if (/^\s*>/.test(line)) return; // blockquote: the corpus's marked form
        if (EXPLANATORY.test(line)) return; // the line is discussing the term
        if (ATTRIBUTED.test(line)) return; // the line says whose word it is

        for (const term of COLONIAL_WATCHLIST) {
          const re = new RegExp(`\\b${escapeRe(term)}\\b`, 'gi');
          for (const m of line.matchAll(re)) {
            const idx = m.index ?? 0;
            if (isMarked(line, idx, m[0].length)) continue;
            findings.push({
              rule: 'R04',
              severity,
              collection: t.collection,
              slug: t.slug,
              field: t.field,
              message: `Unmarked colonial term "${m[0]}"`,
              detail:
                `Line ${i + 1}: ${line.trim().slice(0, 160)}\n` +
                `These words describe how the Protectorate filed a person, not what the\n` +
                `person was. Quote, attribute, or explain the filing category.`,
            });
          }
        }
      });
    }

    return findings;
  },
};

/** Quotation marks, italics, inline code or parenthesis around the hit. */
function isMarked(line: string, index: number, length: number): boolean {
  const before = line.slice(Math.max(0, index - 3), index);
  const after = line.slice(index + length, index + length + 3);
  if (/["“”'‘’«»]$/.test(before.trimEnd()) && /^["“”'‘’«»]/.test(after.trimStart())) return true;
  if (/[*_`]$/.test(before.trimEnd()) && /^[*_`]/.test(after.trimStart())) return true;
  if (/\($/.test(before.trimEnd())) return true;
  // Odd number of quote marks before the hit means we are inside a quotation.
  const quotesBefore = (line.slice(0, index).match(/["“”«»]/g) ?? []).length;
  if (quotesBefore % 2 === 1) return true;
  const backticksBefore = (line.slice(0, index).match(/`/g) ?? []).length;
  if (backticksBefore % 2 === 1) return true;
  return false;
}

// ────────────────────────────────────────────────────────────────── R05

interface KnownDistinct {
  pairs: { a: string; b: string; why: string }[];
  neverMerge: { name: string; why: string }[];
}

export function loadKnownDistinct(dataDir: string): KnownDistinct {
  return JSON.parse(readFileSync(join(dataDir, 'known-distinct.json'), 'utf8')) as KnownDistinct;
}

export const R05: Rule = {
  id: 'R05',
  title: 'Name conflation and duplicates',
  defaultSeverity: 'error',
  run({ snapshot, severityFor, config }: RuleContext): Finding[] {
    const findings: Finding[] = [];
    const errorSeverity = severityFor('R05', 'error');
    const known = loadKnownDistinct(config.paths.data);

    const byName = new Map(snapshot.people.map((p) => [foldKey(p.name), p]));

    // (a) A known-distinct pair must still be two records.
    for (const pair of known.pairs) {
      const a = byName.get(foldKey(pair.a));
      const b = byName.get(foldKey(pair.b));

      if (a && b && a.slug === b.slug) {
        findings.push({
          rule: 'R05',
          severity: errorSeverity,
          collection: 'people',
          slug: a.slug,
          message: `"${pair.a}" and "${pair.b}" have been merged into one record`,
          detail: `${pair.why}\nThese must stay separate.`,
        });
        continue;
      }

      // One record absorbing the other's name as an alias IS what a merge
      // looks like — and the absorbed record has usually been deleted, so this
      // must not require both to still exist. Requiring both was a real gap:
      // it made the rule silent in exactly the case it is for.
      for (const [rec, otherName] of [
        [a, pair.b],
        [b, pair.a],
      ] as const) {
        if (!rec) continue;
        const absorbed = rec.aliases.some((al) => foldKey(al) === foldKey(otherName));
        if (!absorbed) continue;
        findings.push({
          rule: 'R05',
          severity: errorSeverity,
          collection: 'people',
          slug: rec.slug,
          field: 'aliases',
          message: `"${rec.name}" lists "${otherName}" as an alias, but they are different people`,
          detail:
            `${pair.why}\n` +
            (byName.get(foldKey(otherName))
              ? 'Both records still exist; remove the alias.'
              : `No separate record for "${otherName}" remains — this looks like a completed merge.`),
        });
      }
    }

    // (b) Records the corpus says must never be merged.
    for (const nm of known.neverMerge) {
      const matches = snapshot.people.filter(
        (p) => foldKey(p.name).includes(foldKey(nm.name)) || foldKey(nm.name).includes(foldKey(p.name))
      );
      if (matches.length > 1) {
        findings.push({
          rule: 'R05',
          severity: errorSeverity,
          collection: 'people',
          message: `"${nm.name}" now matches ${matches.length} records`,
          detail: `${nm.why}\nMatched: ${matches.map((m) => m.slug).join(', ')}`,
        });
      }
    }

    // (c) New likely duplicates. Warn only — the matcher proposes, a human
    //     disposes. Two men named Ameziane are the reason.
    const distinctKeys = new Set(
      known.pairs.flatMap((p) => [`${foldKey(p.a)}|${foldKey(p.b)}`, `${foldKey(p.b)}|${foldKey(p.a)}`])
    );

    for (let i = 0; i < snapshot.people.length; i++) {
      for (let j = i + 1; j < snapshot.people.length; j++) {
        const a = snapshot.people[i]!;
        const b = snapshot.people[j]!;
        const key = `${foldKey(a.name)}|${foldKey(b.name)}`;
        if (distinctKeys.has(key)) continue; // declared distinct; (a) covers it

        const { score, extensionPenalty } = scoreNames(a.name, b.name);
        if (score < config.aliasThreshold) continue;

        findings.push({
          rule: 'R05',
          severity: 'warn',
          collection: 'people',
          slug: a.slug,
          message: `Possible duplicate: "${a.name}" and "${b.name}" (score ${score.toFixed(2)})`,
          detail:
            `Other record: ${b.slug}\n` +
            (extensionPenalty
              ? `One name extends the other, which more often means two people than one.\n`
              : '') +
            `Proposed, never merged. If they are distinct, add them to known-distinct.json.`,
        });
      }
    }

    return findings;
  },
};

// ────────────────────────────────────────────────────────────────── R07

const DISPUTE_MARKER = /\*\*(Disputed|Unknown|Contested)\b|^\s*(Disputed|Unknown|Contested)\s*:/im;

export const R07: Rule = {
  id: 'R07',
  title: 'Claim-status coherence',
  defaultSeverity: 'warn',
  run({ snapshot, severityFor }: RuleContext): Finding[] {
    const findings: Finding[] = [];
    const severity = severityFor('R07', 'warn');

    for (const p of snapshot.people) {
      if (!p.contestedPoints) continue;
      // Only meaningful where there is prose to carry a marker.
      if (!p.body || !p.body.trim()) continue;
      if (DISPUTE_MARKER.test(p.body)) continue;

      findings.push({
        rule: 'R07',
        severity,
        collection: 'people',
        slug: p.slug,
        message: 'Contested points recorded, but no Disputed/Unknown/Contested marker in the body',
        detail:
          `Disagreement between the property and the prose usually means one was\n` +
          `updated and the other was not.\n` +
          `Contested points: "${p.contestedPoints.slice(0, 140)}"`,
      });
    }

    return findings;
  },
};

// ────────────────────────────────────────────────────────────────── R09

export const R09: Rule = {
  id: 'R09',
  title: 'Relation integrity',
  defaultSeverity: 'warn',
  run({ snapshot, severityFor, config }: RuleContext): Finding[] {
    const findings: Finding[] = [];
    const severity = severityFor('R09', 'warn');
    const peopleSlugs = new Set(snapshot.people.map((p) => p.slug));

    for (const r of snapshot.relationships) {
      if (!r.from || !peopleSlugs.has(r.from)) {
        findings.push({
          rule: 'R09',
          severity,
          collection: 'relationships',
          slug: r.slug,
          field: 'from',
          message: `Dangling relation: from = ${r.from ?? 'null'}`,
          detail: 'An edge whose endpoint does not resolve draws a line to nobody.',
        });
      }
      if (!r.to || !peopleSlugs.has(r.to)) {
        findings.push({
          rule: 'R09',
          severity,
          collection: 'relationships',
          slug: r.slug,
          field: 'to',
          message: `Dangling relation: to = ${r.to ?? 'null'}`,
        });
      }
      if (r.from && r.to && r.from === r.to && !config.allowedSelfLoops.includes(r.slug)) {
        findings.push({
          rule: 'R09',
          severity,
          collection: 'relationships',
          slug: r.slug,
          message: `Self-loop: ${r.fromName} → ${r.toName}`,
          detail: 'If this is legitimate, add its slug to allowedSelfLoops in the config.',
        });
      }
    }

    for (const e of snapshot.events) {
      if (e.people.length === 0) {
        findings.push({
          rule: 'R09',
          severity: 'info',
          collection: 'events',
          slug: e.slug,
          message: 'Event has no people linked',
        });
      }
    }

    // A Full dossier with nothing in Sources covering it.
    const sourceText = snapshot.sources
      .map((s) => [s.covers, s.biasNotes, s.title].filter(Boolean).join(' '))
      .join('\n');
    for (const p of snapshot.people) {
      if (p.dossierStatus !== 'Full dossier') continue;
      const surname = p.name.split(/\s+/).slice(-1)[0] ?? p.name;
      if (surname.length < 4) continue;
      if (!sourceText.includes(surname)) {
        findings.push({
          rule: 'R09',
          severity,
          collection: 'people',
          slug: p.slug,
          message: `Full dossier with no Source record mentioning "${surname}"`,
          detail: 'A full dossier resting on nothing in the Sources database is worth checking.',
        });
      }
    }

    return findings;
  },
};

// ────────────────────────────────────────────────────────────────── R10

export const R10: Rule = {
  id: 'R10',
  title: 'Staleness',
  defaultSeverity: 'info',
  run({ snapshot, severityFor, config }: RuleContext): Finding[] {
    const findings: Finding[] = [];
    const severity = severityFor('R10', 'info');
    const now = Date.now();
    const day = 86_400_000;

    for (const p of snapshot.people) {
      // A Full dossier gets a shorter fuse than a stub: there is more to rot.
      const limit =
        p.dossierStatus === 'Full dossier' ? config.staleness.fullDossier : config.staleness.default;

      if (!p.lastReviewed) {
        if (p.dossierStatus === 'Full dossier' || p.dossierStatus === 'Substantial') {
          findings.push({
            rule: 'R10',
            severity,
            collection: 'people',
            slug: p.slug,
            field: 'lastReviewed',
            message: `${p.dossierStatus} has never been marked reviewed`,
          });
        }
        continue;
      }

      const age = Math.floor((now - Date.parse(p.lastReviewed)) / day);
      if (Number.isFinite(age) && age > limit) {
        findings.push({
          rule: 'R10',
          severity,
          collection: 'people',
          slug: p.slug,
          field: 'lastReviewed',
          message: `Not reviewed in ${age} days (${p.dossierStatus}, limit ${limit})`,
        });
      }
    }

    return findings;
  },
};
