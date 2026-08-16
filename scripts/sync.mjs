#!/usr/bin/env node
/**
 * Pull the Notion workspace into .cache/notion-raw/, then hand off to
 * normalize.mjs.
 *
 * The built site has no runtime dependency on Notion: this runs on demand and
 * on a Notion webhook, writes JSON and MDX into the repo, and a stale build
 * still serves. If this script cannot reach Notion it exits non-zero WITHOUT
 * touching the cache, so the last good corpus stays in place.
 *
 *   NOTION_TOKEN=secret_… node scripts/sync.mjs
 *   node scripts/sync.mjs --no-bodies   # properties only, much faster
 *
 * Responses are cached under .cache/notion/ so re-runs are cheap; pass
 * --fresh to bypass the cache.
 */

import { Client } from '@notionhq/client';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugify, notionId } from './lib/slugify.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, '.cache', 'notion-raw');
const CACHE = join(ROOT, '.cache', 'notion');
const DOSSIERS = join(ROOT, 'src', 'content', 'dossiers');
const EVENT_DOSSIERS = join(ROOT, 'src', 'content', 'event-dossiers');
const PAGES = join(ROOT, 'src', 'content', 'pages');

const args = new Set(process.argv.slice(2));
const FRESH = args.has('--fresh');
const NO_BODIES = args.has('--no-bodies');

const token = process.env.NOTION_TOKEN;
if (!token) {
  console.error(
    '\n  NOTION_TOKEN is not set.\n\n' +
      '  This script is the canonical ingestion path, but it is not the only one:\n' +
      '  the corpus currently in .cache/notion-raw/ was pulled through the Notion\n' +
      '  MCP connector. Either export a token, or edit the raw cache directly and\n' +
      '  run `npm run normalize`.\n'
  );
  process.exit(1);
}

const notion = new Client({ auth: token });

/** The workspace's parent page and its databases. */
const PARENT_PAGE = '3bd885d8804281139 6a0c2dd959b3c3c'.replace(/\s/g, '');

const DATABASES = {
  people: '8645be5a1ebf44068dc8b6e8acd684ec',
  events: '0951dd9c4de44267835cf05c1167c04b',
  sources: '5c17df2c42cd41f483670da3ac293dfc',
  places: 'e234e8f8315645a68562f718036ef0a9',
  groups: 'd30e95d8dad64a92909586af0b282ed6',
  relationships: '9abd7d5bdfa24c938751c0288aee15ad',
  archives: '49f975b985c4478b8b1f4a7225cb62c2',
};

/** The long-form pages, with the route each becomes. */
const LONGFORM = {
  synthesis: { id: '3bd885d880428123ba90c0f1f9bd8b21', title: 'Moroccan history from the archives — synthesis', order: 1 },
  timeline: { id: '3bd885d8804281eead73d6093e4b45ba', title: 'Timeline', order: 2 },
  bias: { id: '3bd885d88042813b9ba3d83dff389e08', title: 'Source bias and contradictions', order: 3 },
  discovered: { id: '3bd885d8804281eca780e7ec53faa346', title: 'Discovered and forgotten personalities', order: 4 },
  'research-plan': { id: '3bd885d880428125b5d1fe6c899aa964', title: 'Archival research plan', order: 5 },
  'cross-verification': { id: '3bd885d8804281ee8bd9f03c07b478a1', title: 'Global sources — cross-verification matrix', order: 6 },
  'research-log': { id: '3bd885d8804281c98055ca13534bf337', title: 'Research log', order: 7 },
};

// ------------------------------------------------------------------ cache
const cachePath = (key) => join(CACHE, `${key}.json`);
function cached(key, fn) {
  const p = cachePath(key);
  if (!FRESH && existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  return fn().then((data) => {
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(p, JSON.stringify(data));
    return data;
  });
}

// ------------------------------------------------------------ properties
/**
 * Flatten a Notion property to the shape normalize.mjs expects.
 *
 * Dates are the one place to be careful: `Start`/`End` on Events are real date
 * properties and come through as ISO strings, but `Born`/`Died` on People are
 * deliberately TEXT and must never be routed through a date branch.
 */
function readProp(prop) {
  if (!prop) return null;
  switch (prop.type) {
    case 'title':
      return prop.title.map((t) => t.plain_text).join('');
    case 'rich_text':
      return prop.rich_text.map((t) => t.plain_text).join('') || null;
    case 'select':
      return prop.select?.name ?? null;
    case 'multi_select':
      return prop.multi_select.map((s) => s.name);
    case 'date':
      return prop.date?.start ?? null;
    case 'url':
      return prop.url ?? null;
    case 'relation':
      return prop.relation.map((r) => r.id);
    case 'number':
      return prop.number;
    case 'checkbox':
      return prop.checkbox;
    default:
      return null;
  }
}

async function queryDatabase(id) {
  const rows = [];
  let cursor;
  do {
    const res = await notion.databases.query({ database_id: id, start_cursor: cursor });
    rows.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return rows;
}

// ---------------------------------------------------------------- blocks
async function listBlocks(blockId) {
  const blocks = [];
  let cursor;
  do {
    const res = await notion.blocks.children.list({ block_id: blockId, start_cursor: cursor });
    blocks.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return blocks;
}

const rich = (arr = []) =>
  arr
    .map((t) => {
      let s = t.plain_text;
      if (t.annotations?.code) return `\`${s}\``;
      if (t.annotations?.bold) s = `**${s}**`;
      if (t.annotations?.italic) s = `*${s}*`;
      if (t.href) s = `[${s}](${t.href})`;
      return s;
    })
    .join('');

/**
 * Notion blocks → Markdown. Preserves tables, blockquotes, bold, inline code,
 * headings and callouts — the constructs the corpus actually uses, and the
 * ones the remark plugin then lifts into semantic components.
 */
async function blocksToMarkdown(blockId, depth = 0) {
  const blocks = await listBlocks(blockId);
  const out = [];

  for (const b of blocks) {
    switch (b.type) {
      case 'heading_1':
        out.push(`# ${rich(b.heading_1.rich_text)}`);
        break;
      case 'heading_2':
        out.push(`## ${rich(b.heading_2.rich_text)}`);
        break;
      case 'heading_3':
        out.push(`### ${rich(b.heading_3.rich_text)}`);
        break;
      case 'paragraph': {
        const t = rich(b.paragraph.rich_text);
        if (t.trim()) out.push(t);
        break;
      }
      case 'bulleted_list_item':
        out.push(`${'  '.repeat(depth)}- ${rich(b.bulleted_list_item.rich_text)}`);
        break;
      case 'numbered_list_item':
        out.push(`${'  '.repeat(depth)}1. ${rich(b.numbered_list_item.rich_text)}`);
        break;
      case 'quote':
        out.push(`> ${rich(b.quote.rich_text)}`);
        break;
      case 'callout':
        // Callouts carry the Evidence note / Terminology warning conventions;
        // emitting them as blockquotes lets the remark plugin recognise them.
        out.push(`> ${rich(b.callout.rich_text)}`);
        break;
      case 'code':
        out.push(['```', rich(b.code.rich_text), '```'].join('\n'));
        break;
      case 'divider':
        out.push('---');
        break;
      case 'table': {
        const rows = await listBlocks(b.id);
        const cells = rows.map((r) => r.table_row.cells.map((c) => rich(c).replace(/\|/g, '\\|')));
        if (!cells.length) break;
        const width = Math.max(...cells.map((r) => r.length));
        const pad = (r) => [...r, ...Array(width - r.length).fill('')];
        const [head, ...body] = b.table.has_column_header
          ? cells
          : [Array(width).fill(''), ...cells];
        out.push(
          `| ${pad(head).join(' | ')} |`,
          `|${Array(width).fill('---').join('|')}|`,
          ...body.map((r) => `| ${pad(r).join(' | ')} |`)
        );
        break;
      }
      default:
        break;
    }

    // Nested children (list items with sub-lists, toggles).
    if (b.has_children && !['table', 'column_list'].includes(b.type)) {
      const nested = await blocksToMarkdown(b.id, depth + 1);
      if (nested.trim()) out.push(nested);
    }
  }

  return out.join('\n\n');
}

const frontmatter = (obj) =>
  [
    '---',
    ...Object.entries(obj)
      .filter(([, v]) => v != null)
      .map(([k, v]) => (typeof v === 'string' ? `${k}: ${JSON.stringify(v)}` : `${k}: ${v}`)),
    '---',
    '',
  ].join('\n');

// -------------------------------------------------------------------- run
async function main() {
  mkdirSync(RAW, { recursive: true });
  mkdirSync(DOSSIERS, { recursive: true });
  mkdirSync(EVENT_DOSSIERS, { recursive: true });
  mkdirSync(PAGES, { recursive: true });

  const TITLE_FIELD = {
    people: 'Name',
    events: 'Event',
    sources: 'Title',
    places: 'Place',
    groups: 'Group',
    relationships: 'Relationship',
    archives: 'Institution',
  };

  const staged = {};

  for (const [name, id] of Object.entries(DATABASES)) {
    const rows = await cached(`db-${name}`, () => queryDatabase(id));
    staged[name] = rows.map((r) => {
      const flat = { url: r.url };
      for (const [key, prop] of Object.entries(r.properties)) {
        flat[key] = readProp(prop);
      }
      // Relations arrive as ids; normalize.mjs resolves them to slugs.
      return flat;
    });
    console.log(`   ${String(staged[name].length).padStart(3)}  ${name}`);
  }

  // Only write the raw cache once every database has come back, so a failed
  // run never leaves a half-updated corpus behind.
  for (const [name, rows] of Object.entries(staged)) {
    writeFileSync(join(RAW, `${name}.json`), JSON.stringify(rows, null, 1));
  }

  if (!NO_BODIES) {
    console.log('\n  Bodies:');
    for (const [collection, dir, titleKey] of [
      ['people', DOSSIERS, 'Name'],
      ['events', EVENT_DOSSIERS, 'Event'],
    ]) {
      let written = 0;
      for (const row of staged[collection]) {
        const id = notionId(row.url);
        const md = await cached(`body-${id}`, () => blocksToMarkdown(id));
        if (!md.trim()) continue; // a stub with no body is an ordinary absence
        const slug = slugify(row[titleKey]);
        const fm =
          collection === 'people'
            ? { slug, name: row.Name, notionId: id }
            : { slug, event: row.Event, notionId: id };
        writeFileSync(join(dir, `${slug}.mdx`), frontmatter(fm) + md + '\n');
        written++;
      }
      console.log(`   ${String(written).padStart(3)}  ${collection} bodies`);
    }

    for (const [slug, meta] of Object.entries(LONGFORM)) {
      const md = await cached(`page-${slug}`, () => blocksToMarkdown(meta.id));
      if (!md.trim()) continue;
      writeFileSync(
        join(PAGES, `${slug}.mdx`),
        frontmatter({
          title: meta.title,
          slug,
          route: `/${slug}`,
          order: meta.order,
          notionId: meta.id,
        }) + md + '\n'
      );
    }
    console.log(`   ${String(Object.keys(LONGFORM).length).padStart(3)}  long-form pages`);
  }

  console.log('\n  Sync complete. Run `npm run build` to normalize and rebuild.\n');
}

main().catch((e) => {
  console.error('\n  Sync failed — the existing corpus in .cache/notion-raw is untouched.\n');
  console.error(e);
  process.exit(1);
});
