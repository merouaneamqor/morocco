/**
 * Convert a Notion view-mode query result into the shape of the raw cache.
 *
 * The MCP connector's view mode returns multi-selects and relations as
 * JSON-encoded strings and empty text as "". The raw cache uses real arrays
 * and null, because "" and "absent" mean different things everywhere
 * downstream — an empty Assessment is a judgement not yet made, and the site
 * renders that differently from one that is simply missing.
 *
 * This exists so the corpus is transformed by code rather than retyped. A
 * hand-copied id is how a relation silently points at nothing; that happened
 * once already and the normalizer's dangling-reference guard caught it.
 */
export function fromView(rows, { arrays = [], dates = {} } = {}) {
  return rows.map((row) => {
    const out = {};
    for (const [key, value] of Object.entries(row)) {
      if (key.startsWith('date:')) continue; // handled below
      if (arrays.includes(key)) {
        out[key] = parseArray(value);
      } else if (typeof value === 'string') {
        out[key] = value.trim() === '' ? null : value;
      } else {
        out[key] = value ?? null;
      }
    }
    for (const [prop, target] of Object.entries(dates)) {
      const v = row[`date:${prop}:start`];
      out[target] = v && String(v).trim() !== '' ? v : null;
    }
    for (const k of arrays) if (!(k in out)) out[k] = [];
    return out;
  });
}

function parseArray(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  const s = String(value).trim();
  if (!s) return [];
  if (s.startsWith('[')) {
    try {
      return JSON.parse(s);
    } catch {
      /* fall through */
    }
  }
  return [s];
}
