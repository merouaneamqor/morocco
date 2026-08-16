/**
 * Alias scoring — §6.6.
 *
 * A hybrid of Jaro-Winkler on the folded key and token-set overlap. Neither
 * alone is enough: Jaro-Winkler catches `Zaiani`/`Zayani` but not
 * `Hammou des Zaïanes`/`Mouha ou Hammou Zayani`, where the shared token is
 * buried in different surrounding words; token-set catches the second but
 * scores `Mohamed Ameziane` and `Mohammed Sellam Ameziane` far too high —
 * and those are two different men, half a century apart.
 *
 * Every score is a proposal. The matcher never merges. See R05.
 */

import { foldKey, foldOrdered, hasArabic, tokenSet } from './fold.js';

/** Jaro similarity. */
function jaro(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;

  const matchWindow = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatched = new Array<boolean>(a.length).fill(false);
  const bMatched = new Array<boolean>(b.length).fill(false);

  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bMatched[j] || a[i] !== b[j]) continue;
      aMatched[i] = true;
      bMatched[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatched[i]) continue;
    while (!bMatched[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }

  const m = matches;
  return (m / a.length + m / b.length + (m - transpositions / 2) / m) / 3;
}

/** Jaro-Winkler, boosting a shared prefix. */
export function jaroWinkler(a: string, b: string, prefixScale = 0.1): number {
  const j = jaro(a, b);
  if (j < 0.7) return j; // standard: no boost for weak matches
  let prefix = 0;
  const max = Math.min(4, a.length, b.length);
  while (prefix < max && a[prefix] === b[prefix]) prefix++;
  return j + prefix * prefixScale * (1 - j);
}

/** Jaccard overlap of folded token sets. */
export function tokenOverlap(a: string, b: string): number {
  const sa = tokenSet(a);
  const sb = tokenSet(b);
  if (!sa.size || !sb.size) return 0;
  let shared = 0;
  for (const t of sa) if (sb.has(t)) shared++;
  return shared / (sa.size + sb.size - shared);
}

/**
 * True when one name's tokens are wholly contained in the other's.
 *
 * This is the dangerous case rather than the reassuring one. "Mohamed
 * Ameziane" is a strict subset of "Mohammed Sellam Ameziane" and they are
 * different people; containment therefore *lowers* confidence rather than
 * raising it, because a real alias pair usually differs by transliteration
 * rather than by an extra given name.
 */
export function isTokenSubset(a: string, b: string): boolean {
  const sa = tokenSet(a);
  const sb = tokenSet(b);
  if (!sa.size || !sb.size) return false;
  const [small, large] = sa.size <= sb.size ? [sa, sb] : [sb, sa];
  if (small.size === large.size) return false;
  for (const t of small) if (!large.has(t)) return false;
  return true;
}

export interface ScoreResult {
  score: number;
  jw: number;
  overlap: number;
  /** Set when the pair looks like a name-extension rather than a variant. */
  extensionPenalty: boolean;
  /** Both names are Arabic script, or both Latin. Cross-script scores 0. */
  comparable: boolean;
}

/**
 * Score two names for being the same person.
 *
 * Cross-script pairs are not scored: transliterating Arabic to Latin is a
 * scholarly act, not a string operation, and a bad automatic transliteration
 * would produce exactly the confident-looking false positive this tool exists
 * to prevent. Records carrying both scripts link them explicitly instead.
 */
export function scoreNames(a: string, b: string): ScoreResult {
  const aArabic = hasArabic(a);
  const bArabic = hasArabic(b);
  if (aArabic !== bArabic) {
    return { score: 0, jw: 0, overlap: 0, extensionPenalty: false, comparable: false };
  }

  const ka = foldKey(a);
  const kb = foldKey(b);
  if (!ka || !kb) {
    return { score: 0, jw: 0, overlap: 0, extensionPenalty: false, comparable: true };
  }

  if (ka === kb) {
    return { score: 1, jw: 1, overlap: 1, extensionPenalty: false, comparable: true };
  }

  const jw = jaroWinkler(foldOrdered(a).replace(/\s/g, ''), foldOrdered(b).replace(/\s/g, ''));
  const overlap = tokenOverlap(a, b);
  const extensionPenalty = isTokenSubset(a, b);

  // Weighted toward token overlap, which is the more reliable signal for
  // multi-word names, with Jaro-Winkler carrying single-token comparisons.
  let score = 0.45 * jw + 0.55 * overlap;

  // A name that merely extends another is likelier to be a different person
  // than a spelling variant. This is the Ameziane case and it is the reason
  // the penalty exists at all.
  if (extensionPenalty) score *= 0.55;

  return { score, jw, overlap, extensionPenalty, comparable: true };
}

export interface AliasCandidate {
  name: string;
  slug: string;
  /** Which recorded string matched. */
  via: string;
}

/**
 * Resolve a query against an index of {slug, names[]}.
 * Returns candidates above `threshold`, best first.
 */
export function resolveAlias(
  query: string,
  index: { slug: string; display: string; names: string[] }[],
  threshold = 0.72
): (AliasCandidate & { score: number })[] {
  const hits: (AliasCandidate & { score: number })[] = [];

  for (const rec of index) {
    let best = 0;
    let via = '';
    for (const name of rec.names) {
      const { score } = scoreNames(query, name);
      if (score > best) {
        best = score;
        via = name;
      }
      const fq = foldKey(query);
      const fn = foldKey(name);
      if (!fq || !fn) continue;

      // A whole-token match is strong evidence regardless of how long the
      // surrounding name is. "Aẓayyi" is a token of "Muḥa u Ḥemmu Aẓayyi" and
      // scoring it by length ratio buries it — a short distinctive element is
      // exactly what a researcher searches with.
      const nameTokens = new Set(fn.split(' ').filter(Boolean));
      const queryTokens = fq.split(' ').filter(Boolean);
      const wholeTokenHit =
        queryTokens.length > 0 && queryTokens.every((t) => nameTokens.has(t));
      if (wholeTokenHit) {
        const boosted = Math.max(best, 0.85);
        if (boosted > best) {
          best = boosted;
          via = name;
        }
        continue;
      }

      // Otherwise a substring hit on the folded form, scored by how much of
      // the longer string the shorter one accounts for. This catches
      // "Zaïanes" inside "Hammou des Zaïanes" without loosening the score.
      if (fn.includes(fq) || fq.includes(fn)) {
        const containment = Math.min(fq.length, fn.length) / Math.max(fq.length, fn.length);
        const boosted = Math.max(best, 0.6 + 0.4 * containment);
        if (boosted > best) {
          best = boosted;
          via = name;
        }
      }
    }
    if (best >= threshold) hits.push({ slug: rec.slug, name: rec.display, via, score: best });
  }

  return hits.sort((x, y) => y.score - x.score);
}
