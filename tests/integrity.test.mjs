/**
 * Tests for the content-integrity rules.
 *
 * A check that never fires is worthless, so each rule is tested against a
 * deliberately violating fixture as well as against the real corpus. These run
 * the checker's logic over synthetic HTML rather than shelling out to a build.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'src', 'content', 'data');

const readData = (name) => JSON.parse(readFileSync(join(DATA, name), 'utf8'));

const stripTags = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ');

/** The balanced-slice extractor from integrity.mjs rule 3. */
function unverifiedBlocks(html) {
  const out = [];
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
    out.push(stripTags(html.slice(start, end)));
  }
  return out;
}

// ---------------------------------------------------------------- rule 3
test('rule 3: nested unverified ref keeps its literal words', () => {
  // This is the shape ArchivalRef actually emits — nested spans. A lazy
  // matcher stops at the first </span> and wrongly reports a violation.
  const good =
    '<div data-verification="NOT YET VERIFIED">' +
    '<span class="chip"><span>NOT YET VERIFIED</span></span>' +
    '<p>SHD GR 3H</p></div>';
  const blocks = unverifiedBlocks(good);
  assert.equal(blocks.length, 1);
  assert.ok(
    blocks[0].includes('NOT YET VERIFIED'),
    'balanced slice must reach the literal words inside nested spans'
  );
});

test('rule 3: fires when the literal words are missing', () => {
  const bad =
    '<div data-verification="NOT YET VERIFIED">' +
    '<span class="chip"><span>Unverified</span></span>' +
    '<p>SHD GR 3H</p></div>';
  const blocks = unverifiedBlocks(bad);
  assert.equal(blocks.length, 1);
  assert.ok(
    !blocks[0].includes('NOT YET VERIFIED'),
    'a block without the literal words must be detectable'
  );
});

// ---------------------------------------------------------------- rule 6
test('rule 6: Born and Died render verbatim, never reformatted as dates', () => {
  const people = readData('people.json');

  // The canonical hard case: a birth year that is two competing years plus a
  // disclaimer. Any date parsing destroys it.
  const zayani = people.find((p) => p.slug === 'mouha-ou-hammou-zayani');
  assert.ok(zayani, 'the Zayani dossier should exist');
  assert.equal(zayani.born, 'c. 1857 or c. 1863, Middle Atlas — not established');
  assert.equal(
    zayani.died,
    "27 March 1921 (some accounts spring 1921 without exact date), Azlag n'Tazemmourt / Azelag N'Tazemourte, Middle Atlas"
  );

  // The derived sort key is separate, numeric, and named to say it is derived.
  assert.equal(zayani._derivedBornYear, 1857);
  assert.notEqual(zayani.born, String(zayani._derivedBornYear));

  // Corpus-wide: no Born/Died value may have become an ISO date or a Date.
  for (const p of people) {
    for (const field of ['born', 'died']) {
      const v = p[field];
      if (v == null) continue;
      assert.equal(typeof v, 'string', `${p.slug}.${field} must stay a string`);
      assert.ok(
        !/^\d{4}-\d{2}-\d{2}T/.test(v),
        `${p.slug}.${field} was reformatted into an ISO datetime: ${v}`
      );
      assert.ok(
        !/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) [A-Z][a-z]{2} \d{2} \d{4}/.test(v),
        `${p.slug}.${field} was stringified from a Date object: ${v}`
      );
    }
  }
});

test('rule 6: verbatim strings survive into the built HTML', { skip: !existsSync(join(ROOT, 'dist')) }, () => {
  const html = readFileSync(
    join(ROOT, 'dist', 'people', 'mouha-ou-hammou-zayani', 'index.html'),
    'utf8'
  );
  assert.ok(
    html.includes('c. 1857 or c. 1863, Middle Atlas — not established'),
    'the verbatim Born string must appear in the rendered page'
  );
});

// ---------------------------------------------------------- vocabularies
test('every select value in the corpus is a recognised member of its vocabulary', () => {
  const checks = [
    ['people.json', 'dossierStatus', ['Full dossier', 'Substantial', 'Stub', 'Identified - not yet researched']],
    ['people.json', 'evidenceBase', ['Strong - archival + academic', 'Moderate - academic', 'Thin - encyclopedic leads only', 'Contested']],
    ['sources.json', 'verification', ['Consulted directly', 'Catalogue verified', 'Cited by named scholar', 'NOT YET VERIFIED']],
    ['archives.json', 'priority', ['1 - decisive', '2 - structural', '3 - supporting', '4 - background']],
    ['relationships.json', 'evidenceStrength', ['Documented', 'Well-attested in scholarship', 'Single source assertion', 'Traditional / oral', 'Disputed']],
  ];
  for (const [file, field, allowed] of checks) {
    for (const row of readData(file)) {
      if (row[field] == null) continue;
      assert.ok(
        allowed.includes(row[field]),
        `${file}: ${row.slug} has unrecognised ${field}="${row[field]}"`
      );
    }
  }
});

// -------------------------------------------------------------- integrity
test('no relationship edge dangles', () => {
  const people = new Set(readData('people.json').map((p) => p.slug));
  for (const r of readData('relationships.json')) {
    assert.ok(people.has(r.from), `edge "${r.label}" has unresolved from=${r.from}`);
    assert.ok(people.has(r.to), `edge "${r.label}" has unresolved to=${r.to}`);
  }
});

test('withheld is tracked as a flag, never as a status value', () => {
  const { claims } = readData('claims.json');
  const STATUSES = ['Established', 'Highly probable', 'Disputed', 'Unknown'];
  for (const c of claims) {
    if (c.status != null) {
      assert.ok(STATUSES.includes(c.status), `claim ${c.id} has non-ladder status "${c.status}"`);
    }
    assert.equal(typeof c.withheld, 'boolean', `claim ${c.id} must carry withheld as a boolean flag`);
  }
  // And the flag must actually be used somewhere — Ben Barka is the case the
  // whole distinction exists for.
  assert.ok(
    claims.some((c) => c.withheld),
    'at least one claim must be flagged withheld'
  );
});

// ----------------------------------------------------------------- search
test('alias search resolves every recorded spelling to the right dossier', async () => {
  const { fold } = await import('../scripts/lib/slugify.mjs');
  const index = readData('search-index.json');

  const cases = [
    ['Zaïanes', 'Mouha ou Hammou Zayani'],
    ['Zayani', 'Mouha ou Hammou Zayani'],
    ['Aẓayyi', 'Mouha ou Hammou Zayani'],
    ['el caíd Hammu', 'Mouha ou Hammou Zayani'],
    ['محا أو حمو', 'Mouha ou Hammou Zayani'],
    ['Ma al-Aynayn', "Ma al-'Aynayn"],
    ['Abd el-Krim', 'Mohammed ben Abdelkrim El Khattabi'],
  ];

  for (const [query, expected] of cases) {
    const q = fold(query) || query.toLowerCase();
    const hit = index.find(
      (r) =>
        r.folded.some((t) => t.includes(q)) ||
        r.terms.some((t) => t.includes(query))
    );
    assert.ok(hit, `"${query}" found nothing`);
    assert.equal(hit.title, expected, `"${query}" reached the wrong record`);
  }
});

test('diacritic folding is symmetric', async () => {
  const { fold } = await import('../scripts/lib/slugify.mjs');
  assert.equal(fold('Māʾ al-ʿAynayn'), fold('Ma al-Aynayn'));
  assert.equal(fold('Muḥa u Ḥemmu Aẓayyi'), fold('Muha u Hemmu Azayyi'));
  assert.equal(fold('Zaïani'), fold('Zaiani'));
});

test('alias splitting loses nothing', async () => {
  const { splitQuotedVariants } = await import('../scripts/lib/slugify.mjs');
  // An unquoted member leading a list of quoted ones must survive.
  const parts = splitQuotedVariants("Mohamed Hammou, 'el caíd Hammu', 'los zayanes'");
  assert.deepEqual(parts, ['Mohamed Hammou', 'el caíd Hammu', 'los zayanes']);
  // An unquoted string containing a comma is not a list and stays whole.
  assert.deepEqual(splitQuotedVariants('Rabat, near Bab Rouah'), ['Rabat, near Bab Rouah']);
});
