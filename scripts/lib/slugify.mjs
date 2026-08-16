/**
 * Slug and diacritic helpers shared by the ingestion and search-index scripts.
 *
 * Two distinct operations live here and must not be confused:
 *
 *   slugify()  — produces a URL segment. Lossy by design.
 *   fold()     — produces a search key. Lossy by design, in a different way.
 *
 * Neither is ever used to render a name to the reader. Display always uses the
 * verbatim string from the corpus, diacritics intact, because the diacritics
 * are the scholarship.
 */

/**
 * Characters the corpus actually uses that NFD + combining-mark stripping does
 * not handle, because they are not decomposable: the Arabic transliteration
 * letters (ʿayn, hamza), the Amazigh emphatics, and the Turkish dotless i.
 */
const NON_DECOMPOSABLE = {
  ʿ: '', // U+02BF modifier letter left half ring — ʿayn
  ʾ: '', // U+02BE modifier letter right half ring — hamza
  '‘': '', // left single quote, used for ayn in some entries
  '’': '', // right single quote, used for hamza in some entries
  ẓ: 'z',
  Ẓ: 'Z',
  ḥ: 'h',
  Ḥ: 'H',
  ṣ: 's',
  Ṣ: 'S',
  ḍ: 'd',
  Ḍ: 'D',
  ṭ: 't',
  Ṭ: 'T',
  ḏ: 'd',
  ḡ: 'g',
  ṛ: 'r',
  ǧ: 'g',
  ı: 'i',
  İ: 'I',
  ş: 's',
  Ş: 'S',
  ğ: 'g',
  Ğ: 'G',
  ð: 'd',
  þ: 'th',
  ø: 'o',
  Ø: 'O',
  æ: 'ae',
  Æ: 'AE',
  œ: 'oe',
  Œ: 'OE',
  ß: 'ss',
  đ: 'd',
  ł: 'l',
  Ł: 'L',
};

const NON_DECOMPOSABLE_RE = new RegExp(
  `[${Object.keys(NON_DECOMPOSABLE).join('')}]`,
  'g'
);

/**
 * Fold a string to a diacritic-free, lowercase search key.
 *
 * This is what makes `Ma al-Aynayn` find `Māʾ al-ʿAynayn` and vice versa: both
 * fold to `ma al-aynayn`. Arabic-script strings are left alone — folding them
 * to Latin would require transliteration, which is a scholarly act, not a
 * string operation. They are indexed as their own terms instead.
 */
export function fold(input) {
  if (!input) return '';
  return String(input)
    .replace(NON_DECOMPOSABLE_RE, (c) => NON_DECOMPOSABLE[c])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining marks
    .toLowerCase()
    .trim();
}

/** True if the string contains Arabic-script characters. */
export function hasArabic(input) {
  return /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/.test(
    String(input || '')
  );
}

/**
 * Kebab-case slug. Punctuation the corpus uses heavily as a separator
 * (·, /, —, –) collapses to a single hyphen rather than disappearing, so
 * "Ajdir and Alhucemas bay" and "Casablanca 1907 — killings" stay readable.
 */
export function slugify(input) {
  const folded = fold(input);
  const slug = folded
    .replace(/[·/—–_,:;.'"()[\]{}]/g, '-')
    .replace(/[^a-z0-9؀-ۿ-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'untitled';
}

/**
 * Slugify with deduplication against a Map of already-taken slugs.
 * A collision gets a numeric suffix (-2, -3, …), never a random hash, so the
 * URL stays legible and stable across runs as long as insertion order holds.
 */
export function slugifyUnique(input, taken) {
  const base = slugify(input);
  if (!taken.has(base)) {
    taken.set(base, 1);
    return base;
  }
  const next = taken.get(base) + 1;
  taken.set(base, next);
  const candidate = `${base}-${next}`;
  // Guard against a title that literally ends in the suffix we just generated.
  return taken.has(candidate) ? `${candidate}-x` : candidate;
}

/**
 * Split a comma-separated run of quoted archival forms into its members.
 *
 * The corpus records archive traditions as one field holding several forms:
 *   Fr. archives: 'Moha ou Hammou', 'le caïd Hammou', 'Hammou des Zaïanes'
 *
 * Each of those is a distinct string a researcher may search for, so each has
 * to become its own term. Only quoted runs are split — an unquoted string that
 * happens to contain a comma is left whole, because splitting it would invent
 * variants nobody recorded.
 */
export function splitQuotedVariants(input) {
  const s = String(input || '').trim();
  if (!s) return [];

  // Only split when the field actually presents a list of quoted forms.
  // An unquoted string containing a comma stays whole, because splitting it
  // would invent variants nobody recorded.
  if (!/['‘’"“”]/.test(s)) return [s];

  // Walk the string, splitting on commas that sit outside quotes. This keeps
  // unquoted members (e.g. a bare "Mohamed Hammou" leading the list) instead
  // of discarding everything that happens not to be in quotes.
  const parts = [];
  let buf = '';
  let inQuote = false;
  for (const ch of s) {
    if (/['‘’"“”]/.test(ch)) {
      inQuote = !inQuote;
      continue; // drop the quote marks themselves
    }
    if (ch === ',' && !inQuote) {
      parts.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  parts.push(buf);

  const out = parts.map((p) => p.trim()).filter(Boolean);
  return out.length ? out : [s];
}

/** Extract the bare Notion page id from any of the URL shapes the API returns. */
export function notionId(url) {
  if (!url) return null;
  const m = String(url).match(/([0-9a-f]{32}|[0-9a-f-]{36})(?:\?|$|#)/i);
  return m ? m[1].replace(/-/g, '') : null;
}
