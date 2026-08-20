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

/** Mirrors stripTags in integrity.mjs — block boundaries become newlines. */
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

/** Mirrors the sentence extraction in integrity.mjs rule 2. */
function sentenceAt(text, index) {
  const start = Math.max(
    text.lastIndexOf('. ', index) + 1,
    text.lastIndexOf('; ', index) + 1,
    text.lastIndexOf('\n', index) + 1,
    0
  );
  const ends = [text.indexOf('. ', index), text.indexOf('\n', index)].filter((i) => i !== -1);
  return text.slice(start, ends.length ? Math.min(...ends) + 1 : text.length);
}

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

// ---------------------------------------------------------------- rule 2
test('rule 2: text extraction keeps block boundaries', () => {
  // Without this, a "sentence" runs on across paragraphs and picks up words
  // from unrelated prose — which silently exempts figures the rule should
  // catch, and did until this was fixed.
  const html = '<p>Would settle the casualty definitions</p><p>The Spanish lost 13363 men.</p>';
  const text = stripTags(html);
  assert.ok(text.includes('\n'), 'block boundaries must survive as newlines');

  const idx = text.indexOf('13363');
  const sentence = sentenceAt(text, idx);
  assert.ok(
    !/definitions/i.test(sentence),
    'the figure’s sentence must not bleed into the preceding block'
  );
  assert.ok(sentence.includes('The Spanish lost'), 'sentence should be the figure’s own');
});

test('rule 2: scans every occurrence, not just the first', () => {
  // A page legitimately states the full spread near the top and could still
  // assert a bare figure lower down. Checking only the first hit would find
  // the qualified one and skip the rest of the page.
  // The two mentions must sit further apart than the sibling-figure window,
  // otherwise the second is correctly read as part of the same stated spread.
  const filler = '<p>' + 'Intervening prose about the campaign. '.repeat(12) + '</p>';
  const text = stripTags(
    `<p>Total Spanish dead (7,875 to 13,363).</p>${filler}<p>The Spanish lost 13363 men.</p>`
  );
  const hits = [...text.matchAll(/(?<![\d.,])(13,363|13363)(?![\d.,])/g)];
  assert.equal(hits.length, 2, 'both occurrences must be found');

  const members = ['13,363', '8,668', '8,180', '7,875'];
  // The figure under test is the canonical key, not the literal that matched:
  // comparing against the matched text would let "13,363" and "13363" count as
  // different members, and the figure would find itself as its own sibling.
  const figure = '13,363';
  const verdicts = hits.map((hit) => {
    const wide = text.slice(Math.max(0, hit.index - 220), hit.index + 220);
    const showsSpread = members.some(
      (o) =>
        o !== figure &&
        new RegExp(`(?<![\\d.,])(${o}|${o.replace(/,/g, '')})(?![\\d.,])`).test(wide)
    );
    return showsSpread ? 'exempt' : 'violation';
  });
  assert.deepEqual(
    verdicts,
    ['exempt', 'violation'],
    'the stated range is exempt; the bare restatement is a violation'
  );
});

test('rule 2: a figure at the end of a sentence is still detected', () => {
  // The trailing boundary must reject a continuation of the number, not
  // sentence punctuation. `(?![\d.,])` rejected any figure followed by a full
  // stop, so a bare contested number ending a sentence went undetected —
  // which is a common way to write one.
  const boundary = (fig) =>
    new RegExp(`(?<![\\d.,])(${fig}|${fig.replace(/,/g, '')})(?![\\d]|[.,]\\d)`);

  assert.ok(boundary('13,363').test('The Spanish lost 13,363.'), 'end of sentence');
  assert.ok(boundary('13,363').test('The Spanish lost 13,363 men'), 'mid sentence');
  assert.ok(boundary('13,363').test('(13,363)'), 'parenthesised');
  // But a longer number that merely contains it is still not a match.
  assert.ok(!boundary('13,363').test('reference 13,3635'), 'not a longer integer');
  assert.ok(!boundary('13,363').test('value 13,363.5'), 'not a decimal');
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
    // "Zaïanes" is the confederation's own name and only a fragment of the
    // man's "Hammou des Zaïanes", so it must reach the tribe. Reaching the
    // qaid instead would be the site quietly deciding that a people is its
    // leader — which is precisely the colonial reading the corpus refuses.
    ['Zaïanes', 'Zaian (Izayyan)'],
    ['Hammou des Zaïanes', 'Mouha ou Hammou Zayani'],
    ['Zayani', 'Mouha ou Hammou Zayani'],
    ['Aẓayyi', 'Mouha ou Hammou Zayani'],
    ['el caíd Hammu', 'Mouha ou Hammou Zayani'],
    ['محا أو حمو', 'Mouha ou Hammou Zayani'],
    ['Ma al-Aynayn', "Ma al-'Aynayn"],
    ['Abd el-Krim', 'Mohammed ben Abdelkrim El Khattabi'],
  ];

  // Ranked exactly as the search page ranks, via the shared scorer — a
  // substring scan would answer "Abd el-Krim" with his brother's record,
  // which is what a reader would never accept and the site does not do.
  const { bestMatch } = await import('../src/lib/search-rank.mjs');

  for (const [query, expected] of cases) {
    const q = fold(query) || query.toLowerCase();
    const hit = bestMatch(index, q, query);
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

// ------------------------------------------------- claims & disputes layer

test('every claim relation resolves to a record that exists', () => {
  const claims = readData('claim-records.json');
  const has = (file, key = 'slug') => new Set(readData(file).map((r) => r[key]));
  const people = has('people.json');
  const events = has('events.json');
  const sources = has('sources.json');
  const archives = has('archives.json');
  const disputes = has('dispute-records.json');
  const questions = has('open-questions.json');

  for (const c of claims) {
    for (const [field, set] of [
      ['people', people],
      ['events', events],
      ['primaryEvidence', sources],
      ['counterEvidenceSources', sources],
      ['archives', archives],
      ['disputes', disputes],
      ['openQuestions', questions],
    ]) {
      for (const slug of c[field]) {
        assert.ok(set.has(slug), `claim "${c.slug}" points at missing ${field} "${slug}"`);
      }
    }
  }
});

test('a claim with no verbatim quotation says so, rather than leaving it blank', () => {
  // The failure this guards: a blank quotation field beside a precise-looking
  // archival reference reads exactly like a citation.
  for (const c of readData('claim-records.json')) {
    assert.ok(
      typeof c.whatTheDocumentSays === 'string' && c.whatTheDocumentSays.trim() !== '',
      `claim "${c.slug}" leaves the document quotation empty instead of stating its absence`
    );
  }
});

test('dispute positions stay four separate fields and are never merged', () => {
  for (const d of readData('dispute-records.json')) {
    assert.deepEqual(
      Object.keys(d.positions).sort(),
      ['french', 'moroccan', 'other', 'spanish'],
      `dispute "${d.slug}" has the wrong position fields`
    );
    for (const [k, v] of Object.entries(d.positions)) {
      assert.ok(v === null || typeof v === 'string', `dispute "${d.slug}" position ${k} is not a string or null`);
    }
  }
  // The distinction is only meaningful if some position really is absent.
  const someSilent = readData('dispute-records.json').some((d) =>
    Object.values(d.positions).some((v) => v === null)
  );
  assert.ok(someSilent, 'no dispute has an absent position — the em-dash case would be untested');
});

test('closed-with-an-answer is a distinct research status from stalled', () => {
  const questions = readData('open-questions.json');
  const answered = questions.filter((q) => q.researchStatus === 'Closed - answer found');
  assert.ok(
    answered.length > 0,
    'no question is closed with an answer — the success state would never render'
  );
  // Anfa is the case: establishing that no verbatim record exists IS the answer.
  for (const q of answered) {
    assert.ok(q.whatWeKnow, `answered question "${q.slug}" records no answer`);
  }
});

test('the graph namespaces node ids so slugs cannot collide across kinds', () => {
  const graph = JSON.parse(readFileSync(join(DATA, 'graph.json'), 'utf8'));
  const ids = new Set();
  for (const n of graph.nodes) {
    assert.match(n.id, /^(person|claim|source|archive):/, `node id "${n.id}" is not namespaced`);
    assert.ok(!ids.has(n.id), `duplicate node id ${n.id}`);
    ids.add(n.id);
  }
  for (const e of graph.edges) {
    assert.ok(ids.has(e.source), `edge ${e.id} has unresolved source ${e.source}`);
    assert.ok(ids.has(e.target), `edge ${e.id} has unresolved target ${e.target}`);
  }
});

test('node kind is encoded as shape, never as a fourth colour slot', () => {
  const graph = JSON.parse(readFileSync(join(DATA, 'graph.json'), 'utf8'));
  const GROUPS = new Set(['moroccan', 'french', 'spanish', 'other', 'unaligned']);
  const shapes = new Set();
  for (const n of graph.nodes) {
    assert.ok(GROUPS.has(n.group), `node ${n.id} uses colour slot "${n.group}" outside the palette`);
    shapes.add(n.shape);
  }
  assert.ok(shapes.size >= 4, 'the four node kinds must be distinguishable by shape');
});
