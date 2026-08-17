/**
 * Name folding — §6.
 *
 * A person appears under five to ten spellings across four scripts and three
 * archival traditions. `Mouha ou Hammou Zayani`, `Moha ou Hammou`,
 * `Muḥa u Ḥemmu Aẓayyi`, `Hammou des Zaïanes`, `el caíd Hammu` and
 * `محا أو حمو الزياني` are one man.
 *
 * These functions are for MATCHING ONLY. Display always uses the verbatim
 * string from the corpus: the diacritics are the scholarship, and a folded
 * form must never reach a reader.
 *
 * The folding is deliberately aggressive, which means it will bring together
 * names that are merely similar. That is why the matcher only ever warns, and
 * why `known-distinct` pairs are checked as negatives — see R05.
 */

/**
 * Marks that carry meaning in transliteration but not in a match key:
 * ʿayn, hamza, and the emphatic underdots.
 */
const TRANSLITERATION_MARKS: Record<string, string> = {
  'ʿ': '',
  'ʾ': '',
  'ʻ': '',
  'ʼ': '',
  '‘': '',
  '’': '',
  '‛': '',
  "'": '',
  '`': '',
  ẓ: 'z',
  Ẓ: 'z',
  ḥ: 'h',
  Ḥ: 'h',
  ṣ: 's',
  Ṣ: 's',
  ḍ: 'd',
  Ḍ: 'd',
  ṭ: 't',
  Ṭ: 't',
  ḏ: 'd',
  ṛ: 'r',
  ġ: 'g',
  ǧ: 'g',
  š: 'sh',
  ū: 'u',
  ī: 'i',
  ā: 'a',
  ʒ: 'z',
  ɣ: 'gh',
  ḵ: 'kh',
  ṯ: 'th',
  ẖ: 'h',
};

/**
 * Particles and honorifics. Stripped for the match key only — never for
 * display, where "Moulay" and "Sidi" carry real information about status.
 */
const PARTICLES = new Set([
  'ben',
  'bin',
  'ibn',
  'ould',
  'oul',
  'ou',
  'u',
  'si',
  'sidi',
  'moulay',
  'mulay',
  'mawlay',
  'lalla',
  'el',
  'al',
  'al-',
  'le',
  'la',
  'les',
  'de',
  'des',
  'du',
  'da',
  'don',
  'the',
  'cheikh',
  'sheikh',
  'shaykh',
  'caid',
  'qaid',
  'kaid',
  'general',
  'colonel',
  'sultan',
  'emir',
  'amir',
]);

/** Arabic-script letter normalisation. */
const ARABIC_NORMALISE: Record<string, string> = {
  أ: 'ا',
  إ: 'ا',
  آ: 'ا',
  ٱ: 'ا',
  ة: 'ه',
  ى: 'ي',
  ئ: 'ي',
  ؤ: 'و',
  ء: '',
};

const ARABIC_DIACRITICS = /[ً-ٰٟۖ-ۭـ]/g;
const ARABIC_RANGE = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

export function hasArabic(s: string): boolean {
  return ARABIC_RANGE.test(s);
}

/** Normalise an Arabic-script string for matching. */
export function foldArabic(s: string): string {
  return s
    .replace(ARABIC_DIACRITICS, '')
    .replace(/[أإآٱةىئؤء]/g, (c) => ARABIC_NORMALISE[c] ?? c)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Orthographic folding across French, Spanish and English renderings of the
 * same Arabic or Tamazight sounds.
 *
 * The Spanish `j` → `kh` rule is the one that earns its place: `Jenífra` and
 * `Khénifra` are the same town, and no amount of edit-distance tuning finds
 * that without knowing the convention.
 *
 * Order matters — digraphs must be handled before the single letters they
 * contain.
 */
function foldOrthography(s: string): string {
  let out = s;

  // Digraphs first.
  out = out.replace(/tch/g, 'ch');
  out = out.replace(/sch/g, 'sh');
  out = out.replace(/ch/g, 'sh'); // French ch = English sh
  out = out.replace(/dj/g, 'j');
  out = out.replace(/kh/g, 'j'); // Spanish j renders Arabic kh
  out = out.replace(/gh/g, 'g');
  out = out.replace(/ph/g, 'f');
  out = out.replace(/qu/g, 'k');
  out = out.replace(/ck/g, 'k');
  out = out.replace(/th/g, 't');

  // Vowel-cluster equivalences: ou/u, ai/ay, ei/ey, ie/i.
  out = out.replace(/ou/g, 'u');
  out = out.replace(/oo/g, 'u');
  out = out.replace(/aou/g, 'au');
  out = out.replace(/ay/g, 'ai');
  out = out.replace(/ey/g, 'ei');
  out = out.replace(/ie/g, 'i');

  // Consonant equivalences.
  out = out.replace(/q/g, 'k');
  out = out.replace(/c/g, 'k'); // after ch/ck handled
  out = out.replace(/z/g, 's');
  out = out.replace(/y/g, 'i');
  out = out.replace(/w/g, 'u');
  out = out.replace(/v/g, 'f');
  out = out.replace(/x/g, 'ks');

  // Collapse doubled letters: Hammou/Hamu, Zaïani/Zayani.
  out = out.replace(/(.)\1+/g, '$1');

  return out;
}

/**
 * The primary match key: aggressively folded, particles stripped, tokens
 * sorted so word order does not matter.
 */
export function foldKey(input: string): string {
  if (!input) return '';
  const raw = String(input);

  if (hasArabic(raw)) {
    // Arabic script is normalised in-script. Transliterating it to Latin would
    // be a scholarly act, not a string operation, so the two scripts are
    // indexed separately and linked by the record that carries both.
    const folded = foldArabic(raw);
    return tokens(folded).sort().join(' ');
  }

  const stripped = raw
    .replace(/[ʿʾʻʼ''‛'`ẓẒḥḤṣṢḍḌṭṮṭḏṛġǧšūīāʒɣḵṯẖ]/g, (c) => TRANSLITERATION_MARKS[c] ?? c)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

  const folded = foldOrthography(stripped);
  const parts = tokens(folded).filter((t) => !PARTICLES.has(t) && t.length > 1);
  // If stripping particles emptied the name, keep the unstripped tokens: a
  // name that is only particles is still a name.
  const kept = parts.length ? parts : tokens(folded);
  return kept.sort().join(' ');
}

/** A looser key that preserves word order, used for prefix comparisons. */
export function foldOrdered(input: string): string {
  if (!input) return '';
  const raw = String(input);
  if (hasArabic(raw)) return foldArabic(raw);
  const stripped = raw
    .replace(/[ʿʾʻʼ''‛'`ẓẒḥḤṣṢḍḌṭṮṭḏṛġǧšūīāʒɣḵṯẖ]/g, (c) => TRANSLITERATION_MARKS[c] ?? c)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  return foldOrthography(stripped)
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !PARTICLES.has(t))
    .join(' ');
}

function tokens(s: string): string[] {
  return s.split(/[^a-z0-9؀-ۿ]+/i).filter(Boolean);
}

export function tokenSet(input: string): Set<string> {
  const key = foldKey(input);
  return new Set(key.split(' ').filter(Boolean));
}

/**
 * Split a corpus alias field into individual variants.
 *
 * The corpus separates variants with `·` and tags tradition inline
 * (`Fr. archives: 'Moha ou Hammou', 'le caïd Hammou'`). One tagged field may
 * hold several forms; each is a distinct string a researcher may search for.
 * Prose trailing a variant (`Not to be confused with…`) is dropped from the
 * variant but the sentence is preserved by the caller if it needs it.
 */
export function splitAliases(field: string | null | undefined): string[] {
  if (!field) return [];
  const out: string[] = [];

  for (const chunk of String(field).split('·')) {
    let rest = chunk.trim();
    if (!rest) continue;

    // Drop an explanatory sentence appended to the variant list.
    rest = rest.replace(/\.\s+(Not to be confused|Spelling not standardised)[\s\S]*$/i, '');

    // Strip a leading tradition tag.
    rest = rest.replace(
      /^(Tamazight|Tarifit|Tashelhit|Fr\.?\s*archives?|Fr\.?|Sp\.?|Ar\.?|Eng\.?|Sp\.\/Eng\.|Fr\.\/Eng\.|birth name)\s*:\s*/i,
      ''
    );

    if (!/['‘’"“”]/.test(rest)) {
      const v = rest.trim();
      if (v) out.push(v);
      continue;
    }

    // A quoted list: split on commas outside quotes, keeping unquoted members.
    let buf = '';
    let inQuote = false;
    for (const ch of rest) {
      if (/['‘’"“”]/.test(ch)) {
        inQuote = !inQuote;
        continue;
      }
      if (ch === ',' && !inQuote) {
        if (buf.trim()) out.push(buf.trim());
        buf = '';
        continue;
      }
      buf += ch;
    }
    if (buf.trim()) out.push(buf.trim());
  }

  return out.filter((v) => v.length > 1);
}
