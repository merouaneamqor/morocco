/**
 * sync — Notion → .cache → dated snapshot.
 *
 * Snapshots are the backbone: without a history there is no drift detection,
 * and drift detection is why this tool exists. Keep every one, dated and
 * committed.
 *
 * If a pull fails partway, nothing is written. A half-updated snapshot would
 * make `diff` report changes that never happened, which is worse than no
 * snapshot at all.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '../config.js';
import { blocksToMarkdown, createReadClient, readProperty } from './read-client.js';
import {
  hashRecord,
  linkRelations,
  normaliseArchives,
  normaliseEvents,
  normaliseGroups,
  normalisePeople,
  normalisePlaces,
  normaliseRelationships,
  normaliseSources,
  notionId,
  slugify,
} from '../model/normalise.js';
import type { Snapshot } from '../model/types.js';

export interface SyncOptions {
  root: string;
  config: Config;
  /** Build a snapshot from an existing .cache without contacting Notion. */
  offline?: boolean;
  /** Also fetch page bodies. Slower; several rules read them. */
  bodies?: boolean;
  token?: string;
}

const TITLE_KEY: Record<string, string> = {
  people: 'Name',
  events: 'Event',
  sources: 'Title',
  archives: 'Institution',
  relationships: 'Relationship',
  places: 'Place',
  groups: 'Group',
};

export async function sync(opts: SyncOptions): Promise<{ snapshot: Snapshot; path: string }> {
  const { root, config } = opts;
  const cacheDir = join(root, config.paths.cache, 'notion-raw');
  const snapDir = join(root, config.paths.snapshots);
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(snapDir, { recursive: true });

  const raw: Record<string, any[]> = {};
  const propertyTypes: Record<string, Record<string, string>> = {};
  const bodies = new Map<string, string>();

  if (opts.offline) {
    for (const name of Object.keys(config.databases)) {
      const p = join(cacheDir, `${name}.json`);
      if (!existsSync(p)) {
        throw new Error(
          `--offline needs a cached ${name}.json in ${cacheDir}. Run a real sync first, or import a cache.`
        );
      }
      raw[name] = JSON.parse(readFileSync(p, 'utf8'));
    }
    // Long-form pages are a collection in the snapshot but not a database, so
    // they are read separately when present.
    const pagesPath = join(cacheDir, 'pages.json');
    if (existsSync(pagesPath)) {
      raw.pages = JSON.parse(readFileSync(pagesPath, 'utf8'));
    }

    const typesPath = join(cacheDir, '_property-types.json');
    if (existsSync(typesPath)) {
      Object.assign(propertyTypes, JSON.parse(readFileSync(typesPath, 'utf8')));
    }
  } else {
    const notion = createReadClient(opts.token ?? process.env.NOTION_TOKEN ?? '');

    // Stage everything before writing, so a failure leaves the cache intact.
    for (const [name, id] of Object.entries(config.databases)) {
      const schema = await notion.retrieveDatabase(id);
      propertyTypes[name] = Object.fromEntries(
        Object.entries(schema.properties ?? {}).map(([k, v]: [string, any]) => [k, v.type])
      );

      const pages = await notion.queryDatabase(id);
      raw[name] = pages.map((p: any) => {
        const flat: Record<string, unknown> = { url: p.url, __lastEdited: p.last_edited_time };
        for (const [key, prop] of Object.entries(p.properties ?? {})) {
          flat[key] = readProperty(prop);
        }
        // Carry the declared property types for Born/Died so R06 can see a
        // schema change even in an offline snapshot.
        if (name === 'people') {
          flat['__bornType'] = propertyTypes[name]?.['Born'];
          flat['__diedType'] = propertyTypes[name]?.['Died'];
        }
        return flat;
      });
    }

    if (opts.bodies) {
      for (const name of ['people', 'events'] as const) {
        for (const row of raw[name] ?? []) {
          const id = notionId(row.url);
          if (!id) continue;
          const blocks = await notion.listBlocks(id);
          const childrenOf = new Map<string, any[]>();
          for (const b of blocks) {
            if (b.has_children && b.type === 'table') {
              childrenOf.set(b.id, await notion.listBlocks(b.id));
            }
          }
          const md = blocksToMarkdown(blocks, childrenOf);
          if (md.trim()) {
            row.__body = md;
            bodies.set(id, md);
          }
        }
      }
    }

    for (const [name, rows] of Object.entries(raw)) {
      writeFileSync(join(cacheDir, `${name}.json`), JSON.stringify(rows, null, 1));
    }
    writeFileSync(join(cacheDir, '_property-types.json'), JSON.stringify(propertyTypes, null, 1));
  }

  const snapshot = buildSnapshot(raw, propertyTypes, opts.offline ? `offline:${cacheDir}` : 'notion');
  const date = snapshot.takenAt.slice(0, 10);
  const path = join(snapDir, `${date}.json`);
  writeFileSync(path, JSON.stringify(snapshot, null, 1));
  return { snapshot, path };
}

/** Assemble a snapshot from raw rows. Exported so tests can build fixtures. */
export function buildSnapshot(
  raw: Record<string, any[]>,
  propertyTypes: Record<string, Record<string, string>>,
  origin: string
): Snapshot {
  const people = normalisePeople(raw.people ?? []);
  const events = normaliseEvents(raw.events ?? []);
  const sources = normaliseSources(raw.sources ?? []);
  const archives = normaliseArchives(raw.archives ?? []);
  const places = normalisePlaces(raw.places ?? []);
  const groups = normaliseGroups(raw.groups ?? []);

  const peopleByNotionId = new Map(
    people
      .filter((p) => p.notionId)
      .map((p) => [p.notionId as string, { slug: p.slug, name: p.name }])
  );

  const relationships = normaliseRelationships(raw.relationships ?? [], peopleByNotionId);

  // Event → people ids, keyed by the event's slug.
  const eventPeopleIds = new Map<string, string[]>();
  (raw.events ?? []).forEach((row, i) => {
    const slug = events[i]?.slug;
    if (!slug) return;
    const ids = (Array.isArray(row['People involved']) ? row['People involved'] : [])
      .map((v: string) => notionId(v) ?? v.replace(/-/g, ''))
      .filter(Boolean);
    eventPeopleIds.set(slug, ids);
  });

  linkRelations(people, events, relationships, eventPeopleIds, peopleByNotionId);

  const pages = (raw.pages ?? []).map((p: any) => ({
    slug: slugify(p.title ?? p.slug ?? ''),
    title: String(p.title ?? ''),
    notionId: notionId(p.url) ?? null,
    body: String(p.body ?? ''),
    hash: hashRecord({ body: p.body ?? '', title: p.title ?? '' }),
  }));

  return {
    takenAt: new Date().toISOString(),
    origin,
    propertyTypes,
    people,
    events,
    sources,
    archives,
    relationships,
    places,
    groups,
    pages,
  };
}

/** List snapshots, oldest first. */
export function listSnapshots(root: string, config: Config): string[] {
  const dir = join(root, config.paths.snapshots);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();
}

export function loadSnapshot(root: string, config: Config, file?: string): Snapshot {
  const dir = join(root, config.paths.snapshots);
  const files = listSnapshots(root, config);
  const target = file ?? files[files.length - 1];
  if (!target) {
    throw new Error(`No snapshots in ${dir}. Run \`mhka sync\` first.`);
  }
  const path = target.endsWith('.json') ? join(dir, target) : join(dir, `${target}.json`);
  if (!existsSync(path)) throw new Error(`Snapshot not found: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8')) as Snapshot;
}
