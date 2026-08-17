/**
 * How a query is ranked against a search record.
 *
 * Shared between the search page and the tests so the two cannot drift. That
 * matters more here than it looks: two men can carry the same string, and
 * which one a search reaches is a question about identity, not relevance.
 *
 * The case that forced this out into its own module: "Abd el-Krim" appears as
 * an exact alias on Mohammed ben Abdelkrim El Khattabi, and as a fragment on
 * his brother M'Hammad, whose Spanish-archive alias is literally "el hermano
 * de Abd-el-Krim" — the brother of Abd el-Krim. A substring match ranks the
 * brother first. An exact-alias match must therefore always beat a fragment,
 * or the site answers a question about one man with a record about another.
 */

/** Exact alias, then prefix, then fragment. Arabic script is matched unfolded. */
export function scoreRecord(rec, foldedQuery, rawQuery = '') {
  let best = 0;
  for (const term of rec.folded ?? []) {
    if (term === foldedQuery) return 100;
    if (term.startsWith(foldedQuery)) best = Math.max(best, 70);
    else if (term.includes(foldedQuery)) best = Math.max(best, 45);
  }
  // Arabic-script terms are not folded to Latin — transliteration is a
  // scholarly act, not a string operation — so they match directly.
  for (const term of rec.terms ?? []) {
    if (rawQuery && term === rawQuery) return 100;
    if (term.includes(rawQuery || foldedQuery)) best = Math.max(best, 60);
  }
  return best;
}

/** The best-ranked record, or null. Ties keep index order, which is stable. */
export function bestMatch(index, foldedQuery, rawQuery = '') {
  let top = null;
  let topScore = 0;
  for (const rec of index) {
    const s = scoreRecord(rec, foldedQuery, rawQuery);
    if (s > topScore) {
      topScore = s;
      top = rec;
    }
  }
  return topScore > 0 ? top : null;
}
