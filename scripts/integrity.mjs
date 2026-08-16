#!/usr/bin/env node
/**
 * Content integrity checks.
 *
 * These are the rules that make the site trustworthy, enforced rather than
 * documented. Errors fail the build; warnings are reported and do not.
 *
 *   1. ERROR  — an unrecognised select value anywhere in the corpus.
 *   2. ERROR  — a page renders a bare figure that also appears in a FigureRange.
 *   3. ERROR  — an ArchivalRef marked NOT YET VERIFIED whose accessible text
 *               does not contain the literal words NOT YET VERIFIED.
 *   4. WARN   — a colonial-vocabulary term outside <ColonialTerm> or a quote.
 *   5. WARN   — a dossier with Contested points but no Disputed claim marker.
 *
 * Rule 6 (Born/Died render verbatim) is a snapshot test in tests/.
 *
 * Rules 2 and 3 read the built HTML in dist/, because they are claims about
 * what the reader actually sees. Run `astro build` first.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLONIAL_TERMS } from '../src/lib/vocab.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const DATA = join(ROOT, 'src', 'content', 'data');

const errors = [];
const warnings = [];
const err = (rule, msg) => errors.push({ rule, msg });
const warn = (rule, msg) => warnings.push({ rule, msg });

/** Walk dist/ for HTML files. */
function htmlFiles(dir = DIST, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) htmlFiles(p, out);
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

/**
 * HTML → readable text.
 *
 * Block boundaries become newlines rather than spaces. This matters: the
 * bare-figure rule reads the sentence a figure sits in, and if block
 * boundaries collapsed to spaces that "sentence" would run on across
 * paragraphs, table cells and component slots — picking up words from
 * unrelated prose and exempting figures it should have caught.
 */
const BLOCK_END =
  /<\/(p|div|li|ul|ol|h[1-6]|td|th|tr|figcaption|figure|dd|dt|dl|section|article|aside|blockquote|caption|main|header|footer|nav)\s*>|<br\s*\/?>/gi;

const stripTags = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(BLOCK_END, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{2,}/g, '\n');

// ---------------------------------------------------------------- rule 1
// The Zod schemas already fail the build on an unknown select value. This
// re-checks the normalized JSON directly so the rule is enforced even when
// someone edits src/content/data by hand.
function ruleUnknownSelects() {
  const VOCAB = {
    'people.json': {
      dossierStatus: ['Full dossier', 'Substantial', 'Stub', 'Identified - not yet researched'],
      evidenceBase: [
        'Strong - archival + academic',
        'Moderate - academic',
        'Thin - encyclopedic leads only',
        'Contested',
      ],
    },
    'sources.json': {
      tier: [
        'PRIMARY_ARCHIVAL', 'PRIMARY_CONTEMPORARY', 'OFFICIAL', 'ACADEMIC',
        'SECONDARY', 'ENCYCLOPEDIC', 'JOURNALISTIC', 'UNSOURCED',
      ],
      verification: [
        'Consulted directly', 'Catalogue verified', 'Cited by named scholar', 'NOT YET VERIFIED',
      ],
    },
    'archives.json': {
      verification: [
        'Consulted directly', 'Catalogue verified', 'Cited by named scholar',
        'Described by named scholar', 'Reported', 'NOT YET VERIFIED',
      ],
      priority: ['1 - decisive', '2 - structural', '3 - supporting', '4 - background'],
      digitised: [
        'Substantially online', 'Partly online', 'Catalogue online only',
        'On-site only', 'Unknown',
      ],
    },
    'relationships.json': {
      evidenceStrength: [
        'Documented', 'Well-attested in scholarship', 'Single source assertion',
        'Traditional / oral', 'Disputed',
      ],
    },
  };

  // Fields where a missing value is a recorded gap rather than a fault, and
  // is surfaced in the UI as its own state. These warn instead of failing —
  // but they do warn, so the gap stays visible rather than becoming normal.
  const NULLABLE_WITH_WARNING = { 'sources.json': ['verification'] };

  for (const [file, fields] of Object.entries(VOCAB)) {
    const p = join(DATA, file);
    if (!existsSync(p)) continue;
    const rows = JSON.parse(readFileSync(p, 'utf8'));
    for (const row of rows) {
      for (const [field, allowed] of Object.entries(fields)) {
        const v = row[field];
        if (v == null) {
          if (NULLABLE_WITH_WARNING[file]?.includes(field)) {
            warn(
              'missing-verification',
              `${file}: ${row.slug ?? '?'} has no ${field}. The site renders this as ` +
                `"verification not recorded" rather than assuming a value — but the corpus ` +
                `should eventually state one.`
            );
          }
          continue;
        }
        if (!allowed.includes(v)) {
          err(
            'unknown-select',
            `${file}: ${row.slug ?? '?'} has ${field}="${v}", which is not a recognised value. ` +
              `A silently dropped select value is the exact failure mode this site exists to prevent.`
          );
        }
      }
    }
  }
}

// ---------------------------------------------------------------- rule 2
// A bare figure that also appears inside a FigureRange means a page is
// asserting one number where the corpus records a spread.
function ruleBareFigures() {
  const files = htmlFiles();

  // Collect every value that appears in a rendered FigureRange, per page and
  // globally — the rule is corpus-wide, since the spread is a property of the
  // figure, not of the page that happens to mention it.
  const ranged = new Map(); // formatted figure → { label, siblings }
  for (const f of files) {
    const html = readFileSync(f, 'utf8');
    for (const m of html.matchAll(
      /<figure class="frange"[\s\S]*?<\/figure>/g
    )) {
      const block = m[0];
      const label =
        block.match(/class="frange__label"[^>]*>([^<]*)</)?.[1]?.trim() ?? 'a FigureRange';
      const members = [...block.matchAll(/class="frange__n"[^>]*>([\d,]+)</g)].map((c) =>
        c[1].trim()
      );
      for (const value of members) {
        ranged.set(value, { label, members });
      }
    }
  }
  if (ranged.size === 0) return;

  for (const f of files) {
    const html = readFileSync(f, 'utf8');
    // Remove the FigureRange blocks themselves — they are allowed to state
    // every value in the range, that is their whole job.
    const withoutRanges = html.replace(/<figure class="frange"[\s\S]*?<\/figure>/g, ' ');
    const text = stripTags(withoutRanges);
    const rel = relative(ROOT, f);

    for (const [figure, { label, members }] of ranged) {
      // Match the figure as a standalone number, with or without separators.
      //
      // Every occurrence has to be examined, not just the first. A page
      // legitimately states the full spread near the top (in Main dispute, say)
      // and could still assert a bare figure further down; checking only the
      // first hit would find the qualified one and skip the rest of the page.
      const bare = figure.replace(/,/g, '');
      const re = new RegExp(`(?<![\\d.,])(${figure}|${bare})(?![\\d.,])`, 'g');

      for (const hit of text.matchAll(re)) {
        // The spread may legitimately span a clause or two, so look for
        // sibling figures in a reasonably wide window.
        const wide = text.slice(
          Math.max(0, hit.index - 220),
          Math.min(text.length, hit.index + 220)
        );

        // Stating the spread is the correct behaviour, not a violation: if
        // another member of the same range appears nearby, the page is showing
        // a range, which is exactly what the rule wants.
        const showsSpread = members.some((other) => {
          if (other === figure) return false;
          const otherBare = other.replace(/,/g, '');
          return new RegExp(`(?<![\\d.,])(${other}|${otherBare})(?![\\d.,])`).test(wide);
        });
        if (showsSpread) continue;

        // Attribution, by contrast, is checked against the figure's OWN
        // sentence. A wide window is useless here: on a page this dense almost
        // any 400-character span contains the word "count" or "estimate"
        // somewhere, which would exempt every figure on the site and leave the
        // rule enforcing nothing.
        // A block boundary ends a sentence just as a full stop does.
        const sentenceStart = Math.max(
          text.lastIndexOf('. ', hit.index) + 1,
          text.lastIndexOf('; ', hit.index) + 1,
          text.lastIndexOf('\n', hit.index) + 1,
          0
        );
        const ends = [text.indexOf('. ', hit.index), text.indexOf('\n', hit.index)].filter(
          (i) => i !== -1
        );
        const sentenceEnd = ends.length ? Math.min(...ends) + 1 : text.length;
        const sentence = text.slice(sentenceStart, sentenceEnd);

        // A page may name a single figure when that sentence says whose figure
        // it is, or frames it as one of several — the corpus does this
        // constantly ("the French count of 182 is a French battlefield count").
        const qualified =
          /\b(range|ranges|ranging|variously|between|estimates?|estimated|count|counted|figure|figures|floor|at least|well over|dispute[ds]?|definitional|definitions|highest|inclusive|according to|reported|gives?|c\.)\b/i.test(
            sentence
          );
        if (qualified) continue;

        err(
          'bare-figure',
          `${rel}: renders the bare figure ${hit[1]}, which appears in the FigureRange "${label}". ` +
            `The site must never display a single figure where the corpus records a range.`
        );
      }
    }
  }
}

// ---------------------------------------------------------------- rule 3
function ruleUnverifiedRefText() {
  for (const f of htmlFiles()) {
    const html = readFileSync(f, 'utf8');
    const rel = relative(ROOT, f);

    // Every element declaring itself unverified must carry the literal words.
    //
    // These elements nest (a span inside the ref block, spans inside that), so
    // a lazy match to the first matching close tag would stop short and report
    // text that is genuinely present as missing. Walk the tag stream instead
    // and take the balanced slice.
    for (const open of html.matchAll(
      /<(div|span)\b[^>]*data-verification="NOT YET VERIFIED"[^>]*>/g
    )) {
      const tag = open[1];
      const start = open.index;
      const tagRe = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
      tagRe.lastIndex = start;
      let depth = 0;
      let end = html.length;
      let t;
      while ((t = tagRe.exec(html))) {
        depth += t[1] ? -1 : 1;
        if (depth === 0) {
          end = t.index + t[0].length;
          break;
        }
      }
      const text = stripTags(html.slice(start, end));
      if (!text.includes('NOT YET VERIFIED')) {
        err(
          'unverified-text',
          `${rel}: an element marked verification="NOT YET VERIFIED" renders without the ` +
            `literal words NOT YET VERIFIED in its accessible text.`
        );
      }
    }
  }
}

// ---------------------------------------------------------------- rule 4
function ruleColonialTerms() {
  const terms = Object.keys(COLONIAL_TERMS);
  const re = new RegExp(
    `\\b(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
    'gi'
  );

  const dirs = ['src/content/dossiers', 'src/content/event-dossiers', 'src/content/pages'];
  for (const d of dirs) {
    const dir = join(ROOT, d);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.mdx'))) {
      const raw = readFileSync(join(dir, name), 'utf8');
      const lines = raw.split(/\r?\n/);
      lines.forEach((line, i) => {
        // Allowed contexts: inside a ColonialTerm, inside a blockquote, inside
        // quotation marks or emphasis, or inside inline code.
        if (/<ColonialTerm/.test(line)) return;
        if (/^\s*>/.test(line)) return;
        for (const m of line.matchAll(re)) {
          const before = line.slice(Math.max(0, m.index - 40), m.index);
          const after = line.slice(m.index + m[0].length, m.index + m[0].length + 40);
          const quoted =
            /["“'‘*`]$/.test(before.trimEnd()) || /^["”'’*`]/.test(after.trimStart());
          const inCode = (line.slice(0, m.index).match(/`/g) || []).length % 2 === 1;
          if (quoted || inCode) continue;
          warn(
            'unmarked-colonial-term',
            `${d}/${name}:${i + 1}: "${m[0]}" appears outside <ColonialTerm>, a blockquote or ` +
              `quotation marks. These words describe how the Protectorate filed a person, ` +
              `not what the person was.`
          );
        }
      });
    }
  }
}

// ---------------------------------------------------------------- rule 5
function ruleContestedAgreesWithDisputed() {
  const peoplePath = join(DATA, 'people.json');
  const claimsPath = join(DATA, 'claims.json');
  if (!existsSync(peoplePath) || !existsSync(claimsPath)) return;

  const people = JSON.parse(readFileSync(peoplePath, 'utf8'));
  const { claims } = JSON.parse(readFileSync(claimsPath, 'utf8'));
  const dossierDir = join(ROOT, 'src/content/dossiers');
  const haveBody = existsSync(dossierDir)
    ? new Set(readdirSync(dossierDir).filter((f) => f.endsWith('.mdx')).map((f) => f.replace(/\.mdx$/, '')))
    : new Set();

  for (const p of people) {
    if (!p.contestedPoints) continue;
    // Only meaningful where a body exists to carry markers.
    if (!haveBody.has(p.slug)) continue;
    const has = claims.some((c) => c.hostSlug === p.slug && c.status === 'Disputed');
    if (!has) {
      warn(
        'contested-without-disputed',
        `${p.slug}: has Contested points but no Disputed claim marker in the dossier body. ` +
          `The two should agree.`
      );
    }
  }
}

// -------------------------------------------------------------------- run
ruleUnknownSelects();
ruleUnverifiedRefText();
ruleBareFigures();
ruleColonialTerms();
ruleContestedAgreesWithDisputed();

const seen = new Set();
const dedupe = (list) =>
  list.filter((x) => {
    const k = `${x.rule}|${x.msg}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

const errs = dedupe(errors);
const warns = dedupe(warnings);

if (warns.length) {
  console.log(`\n  ${warns.length} warning(s):\n`);
  for (const w of warns) console.log(`   [${w.rule}] ${w.msg}`);
}

if (errs.length) {
  console.error(`\n  ${errs.length} error(s):\n`);
  for (const e of errs) console.error(`   [${e.rule}] ${e.msg}`);
  console.error('\n  Content integrity check FAILED.\n');
  process.exit(1);
}

console.log(
  `\n  Content integrity check passed${warns.length ? ` with ${warns.length} warning(s)` : ''}.\n`
);
