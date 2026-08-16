#!/usr/bin/env node
/**
 * Build claims.json — every graded claim in the corpus, with its status, its
 * host page and its anchor.
 *
 * This powers /evidence and the site-wide status filter. It parses the MDX
 * sources directly rather than hooking the Astro build, so the index can be
 * regenerated and diffed without a full build, and so the same regexes serve
 * both this and the renderer (both import src/lib/markers.mjs).
 *
 * The honest headline of this project is that a great deal is disputed or
 * unknown. This script is what lets the site say so on arrival.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALL_LEAD_INS,
  resolveLeadIn,
  looksWithheld,
  NOT_YET_VERIFIED,
  TIER_TOKENS,
} from '../src/lib/markers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'content', 'data', 'claims.json');

/** Sources of claim-bearing prose, with how to build the host link. */
const SOURCES = [
  { dir: 'src/content/pages', kind: 'page', url: (fm) => fm.route ?? `/${fm.slug}` },
  { dir: 'src/content/dossiers', kind: 'person', url: (fm) => `/people/${fm.slug}` },
  { dir: 'src/content/event-dossiers', kind: 'event', url: (fm) => `/events/${fm.slug}` },
];

/** Minimal frontmatter reader — the files are ours and the shape is fixed. */
function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: raw };
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (/^["'].*["']$/.test(v)) v = v.slice(1, -1);
    if (/^\d+$/.test(v)) v = Number(v);
    fm[kv[1]] = v;
  }
  return { fm, body: m[2] };
}

// Longest-first alternation so a specific alias wins over its own prefix.
const LEAD_IN_RE = new RegExp(
  `^\\*\\*(${ALL_LEAD_INS.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(
    '|'
  )})\\s*[.:]?\\*\\*\\s*(.*)$`,
  'i'
);

/** Strip markdown emphasis and links down to readable claim text. */
function plain(s) {
  return s
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function extract(body, host) {
  const claims = [];
  const lines = body.split(/\r?\n/);
  let index = 0;
  let inFence = false;
  let currentHeading = null;

  for (const line of lines) {
    if (/^```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const h = line.match(/^#{2,4}\s+(.*)$/);
    if (h) {
      currentHeading = plain(h[1]);
      continue;
    }

    // A lead-in may open a paragraph or a list item.
    const stripped = line.replace(/^\s*[-*]\s+/, '').trim();
    const m = stripped.match(LEAD_IN_RE);
    if (!m) continue;

    const resolved = resolveLeadIn(m[1]);
    if (!resolved) continue;
    const text = plain(m[2]);
    if (!text) continue;

    claims.push({
      id: `${host.slug}-${index}`,
      anchor: `claim-${index}`,
      url: `${host.url}#claim-${index}`,
      host: host.title,
      hostSlug: host.slug,
      hostKind: host.kind,
      section: currentHeading,
      leadIn: resolved.canonical,
      // A `Status:` lead-in states its value in the prose; leave it ungraded
      // rather than guessing a rung.
      status: resolved.status,
      // Withheld is a flag, never a rung: it can be raised by the lead-in
      // itself or by the language of the claim body.
      withheld: resolved.withheld || looksWithheld(text),
      tiers: TIER_TOKENS.filter((t) => text.includes(t)),
      unverifiedRef: text.includes(NOT_YET_VERIFIED) || text.includes('NOT YET VERIFIED'),
      text,
      phase: host.phase ?? null,
    });
    index++;
  }
  return claims;
}

function main() {
  const all = [];
  const peoplePath = join(ROOT, 'src/content/data/people.json');
  const people = existsSync(peoplePath)
    ? JSON.parse(readFileSync(peoplePath, 'utf8'))
    : [];
  const phaseBySlug = new Map(people.map((p) => [p.slug, p.phase?.[0] ?? null]));

  for (const src of SOURCES) {
    const dir = join(ROOT, src.dir);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.mdx'))) {
      const raw = readFileSync(join(dir, f), 'utf8');
      const { fm, body } = parseFrontmatter(raw);
      const slug = fm.slug ?? basename(f, '.mdx');
      all.push(
        ...extract(body, {
          slug,
          title: fm.title ?? fm.name ?? fm.event ?? slug,
          kind: src.kind,
          url: src.url({ ...fm, slug }),
          phase: phaseBySlug.get(slug) ?? null,
        })
      );
    }
  }

  const byStatus = { Established: 0, 'Highly probable': 0, Disputed: 0, Unknown: 0, Ungraded: 0 };
  for (const c of all) byStatus[c.status ?? 'Ungraded']++;
  const withheld = all.filter((c) => c.withheld).length;

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify(
      { generatedFrom: SOURCES.map((s) => s.dir), counts: { ...byStatus, withheld, total: all.length }, claims: all },
      null,
      1
    )
  );

  console.log(`  Claims extracted: ${all.length}`);
  for (const [k, v] of Object.entries(byStatus)) {
    if (v) console.log(`   ${String(v).padStart(3)}  ${k}`);
  }
  if (withheld) console.log(`   ${String(withheld).padStart(3)}  flagged Withheld`);
}

main();
