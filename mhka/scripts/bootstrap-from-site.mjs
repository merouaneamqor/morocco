#!/usr/bin/env node
/**
 * Bootstrap a cache from the sibling website repo.
 *
 * The website in this repository already holds a pulled copy of the corpus in
 * `.cache/notion-raw`, plus dossier bodies as MDX. This script copies both into
 * `mhka/.cache/notion-raw` so `mhka sync --offline` can build a snapshot
 * without a NOTION_TOKEN.
 *
 * It exists because the rules are far more useful with real prose than with
 * fixtures, and because a first snapshot has to come from somewhere. It is a
 * bootstrap, not a substitute for `mhka sync`: once a token is available, the
 * real sync supersedes it and brings the Notion property types with it.
 *
 * Read-only with respect to the website; it only writes into mhka/.cache.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MHKA = join(HERE, '..');
const SITE = join(MHKA, '..');

const SRC = join(SITE, '.cache', 'notion-raw');
const DEST = join(MHKA, '.cache', 'notion-raw');

if (!existsSync(SRC)) {
  console.error(`No website cache at ${SRC}. Nothing to bootstrap from.`);
  process.exit(1);
}

mkdirSync(DEST, { recursive: true });

/** Attach dossier bodies from the website's MDX collections. */
function bodiesFrom(dir, slugKey) {
  const out = new Map();
  const path = join(SITE, 'src', 'content', dir);
  if (!existsSync(path)) return out;
  for (const file of readdirSync(path).filter((f) => f.endsWith('.mdx'))) {
    const raw = readFileSync(join(path, file), 'utf8');
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!m) continue;
    const fmSlug = m[1].match(/^slug:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '');
    const slug = fmSlug ?? basename(file, '.mdx');
    // Drop MDX import lines; the rules read prose, not module syntax.
    const body = m[2].replace(/^import .*$/gm, '').trim();
    out.set(slug, body);
  }
  return out;
}

const slugify = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[·/—–_,:;.'"()[\]{}]/g, '-')
    .replace(/[^a-z0-9؀-ۿ-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const personBodies = bodiesFrom('dossiers');
const eventBodies = bodiesFrom('event-dossiers');
const pageBodies = bodiesFrom('pages');

let copied = 0;
let attached = 0;

for (const name of ['people', 'events', 'sources', 'archives', 'places', 'groups', 'relationships']) {
  const src = join(SRC, `${name}.json`);
  if (!existsSync(src)) continue;
  const rows = JSON.parse(readFileSync(src, 'utf8'));

  if (name === 'people' || name === 'events') {
    const bodies = name === 'people' ? personBodies : eventBodies;
    const titleKey = name === 'people' ? 'Name' : 'Event';
    for (const row of rows) {
      const body = bodies.get(slugify(row[titleKey]));
      if (body) {
        row.__body = body;
        attached++;
      }
    }
  }

  writeFileSync(join(DEST, `${name}.json`), JSON.stringify(rows, null, 1));
  copied++;
}

// Long-form pages become their own collection in the snapshot.
const pages = [...pageBodies.entries()].map(([slug, body]) => ({
  slug,
  title: slug,
  url: null,
  body,
}));
writeFileSync(join(DEST, 'pages.json'), JSON.stringify(pages, null, 1));

/**
 * Property types as they stand in Notion today, verified against the live
 * schema. Born and Died are rich_text, which is what R06 requires; recording
 * them here gives R06 a baseline it can see change.
 */
writeFileSync(
  join(DEST, '_property-types.json'),
  JSON.stringify(
    {
      people: {
        Name: 'title',
        'Aliases & spellings': 'rich_text',
        Born: 'rich_text',
        Died: 'rich_text',
        Category: 'multi_select',
        Region: 'multi_select',
        Phase: 'multi_select',
        'Dossier status': 'select',
        'Evidence base': 'select',
        Impact: 'select',
        'Assessment (signed opinion)': 'rich_text',
        'Last reviewed': 'date',
        'One-line': 'rich_text',
        'Contested points': 'rich_text',
      },
      events: { Event: 'title', Start: 'date', End: 'date' },
    },
    null,
    1
  )
);

console.log(`Bootstrapped ${copied} collections into ${DEST}`);
console.log(`  ${pages.length} long-form pages`);
console.log(`  ${attached} dossier bodies attached`);
console.log('');
console.log('Next: npm run mhka -- sync --offline');
