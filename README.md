# Moroccan History from the Archives

A public, static research website presenting a source-critical reconstruction of
Moroccan history, c. 1830–present, built from French, Spanish, Moroccan, British,
American, German and Ottoman archival sources.

It is not a blog and not a wiki. It is closest to a critical edition, and its
primary design achievement is making **epistemic status visible and navigable** —
so a reader can always answer *"what do we actually know about this, and how do we
know it?"* without leaving the page they are on.

## The four rules that govern every screen

1. **Every substantive claim carries a visible status** — Established · Highly
   probable · Disputed · Unknown — rendered with colour *and* an icon *and* a text
   label. Never colour alone.
2. **"Withheld" is not a rung on the confidence ladder.** It is a separate flag
   that can co-occur with any status. The location of Mehdi Ben Barka's body is not
   low-confidence; it is known to someone who will not say. Roughly 1,800 CIA
   documents were acknowledged in 1976 and remain undisclosed. Filing that under
   "unknown" would be lying by taxonomy.
3. **Where French, Spanish and Moroccan accounts diverge, they appear side by
   side.** No column is styled as the answer; the layout never resolves a dispute.
4. **An unverified archival reference never looks verified.** It renders dashed,
   textured, and carries the literal words `NOT YET VERIFIED` followed by the fonds
   a researcher should request. It looks like an IOU because that is what it is.

## Getting started

```bash
npm install
npm run build      # normalize → extract claims → astro build
npm run dev        # local dev server
npm run verify     # build + content integrity + tests
```

## Content pipeline

Content originates in Notion and is committed to this repo as JSON and MDX. **The
built site has no runtime dependency on Notion**, and a stale build still serves.

```
Notion  ──sync.mjs──▶  .cache/notion-raw/*.json
                              │
                    normalize.mjs
                              ▼
                   src/content/data/*.json   (typed collections + graph, timeline, search index)
                              │
                  extract-claims.mjs
                              ▼
                   src/content/data/claims.json   (powers /evidence)
                              │
                        astro build
                              ▼
                            dist/
```

| Command | What it does |
|---|---|
| `npm run sync` | Pulls Notion via the API. Needs `NOTION_TOKEN`. Caches responses under `.cache/notion/`; `--fresh` bypasses, `--no-bodies` fetches properties only. On failure it exits without touching the cache, so the last good corpus survives. |
| `npm run normalize` | Raw cache → typed collections. Resolves relations to slugs and **throws on a dangling edge** rather than dropping it. |
| `npm run check` | The content-integrity rules (below). Reads `dist/`, so build first. |
| `npm test` | Unit tests, including proof that each integrity rule actually fires. |

The corpus currently in `.cache/notion-raw/` was pulled through the Notion MCP
connector rather than the API. `sync.mjs` is the canonical path for future
refreshes; if you have no token, edit the raw cache and run `npm run normalize`.

### Verbatim fields

`Born` and `Died` are **text, not dates, on purpose** — many are disputed
("c. 1857 or c. 1863, Middle Atlas — not established"). They are never parsed.
Where a sort key is needed it is emitted separately as `_derivedBornYear`, named
so it can never be mistaken for the recorded value. A test asserts this corpus-wide.

## Content integrity, enforced in CI

| # | Rule | Level |
|---|---|---|
| 1 | An unrecognised select value anywhere in the corpus | **error** |
| 2 | A page renders a bare figure that also appears in a `FigureRange` | **error** |
| 3 | An unverified `ArchivalRef` missing the literal words `NOT YET VERIFIED` | **error** |
| 4 | Colonial vocabulary outside `<ColonialTerm>`, a blockquote or quotation marks | warn |
| 5 | A dossier with `Contested points` but no `Disputed` marker in its body | warn |
| 6 | `Born`/`Died` render verbatim, never reformatted | test |

Rule 1 is enforced twice — once by the Zod schemas at build time, once by
`integrity.mjs` over the JSON — because a silently dropped
`Verification: NOT YET VERIFIED` is the exact failure this project exists to prevent.

Note that the vocabularies are transcribed from the **Notion select definitions,
not from the build brief**. Where they disagree, Notion is the corpus and wins: the
Archives database uses `Described by named scholar` and `Reported`, which the
brief's four-value list does not contain.

## Architecture

- **Astro**, islands only. A dossier page ships **no external JavaScript** —
  measured at 738 bytes of inline JS gzipped against a 30 KB budget.
- Plain CSS with custom properties. Dark values are declared under both
  `prefers-color-scheme` and `[data-theme]`, so an explicit choice wins either way.
- The timeline degrades to an ordered list grouped by phase; the graph and map each
  ship a mandatory table view. These are requirements, not niceties — the network
  palette sits below 3:1 on the light surface, so the relief rule applies.

### The evidence primitives

Built first and reviewable in isolation at **`/dev/components`**:
`ClaimStatus`, `SourceTier`, `ArchivalRef`, `NarrativeComparison`, `FigureRange`,
`ColonialTerm`, `EvidenceNote`.

A remark plugin (`src/lib/remark-claim-markers.mjs`) lifts the corpus's own inline
conventions — `**Established:**`, `` `ARCHIVAL REFERENCE NOT YET VERIFIED` ``,
tier tokens, `> **Evidence note.**` — into semantic DOM rather than styled spans.
It and the claims extractor import the same patterns from `src/lib/markers.mjs`, so
the rendered page and the Evidence Index cannot drift apart.

### Colour

- **Claim status** is fixed and never reused as a series colour. `Unknown` is muted
  ink, not a status hue — absence of evidence gets absence of colour.
- **Categorical** has exactly three slots plus a recessive grey. A network is an
  all-pairs form and only the first three slots clear the colour-vision separation
  floors; a fourth fails. "Other foreign" is deliberately recessive, which is also
  semantically right.
- **Sequential** (tier, evidence strength, archive priority) is one blue ramp.
- **Texture** is reserved for "outside protectorate control", uncertainty bands and
  the forced-colors/print fallback. Never decorative.

## Routes

```
/                      /people  /people/[slug]     /events  /events/[slug]
/timeline              /network                    /atlas
/evidence  ★           /disputes  ★                /method
/sources   /archives   /places  /groups            /search
/synthesis /bias /cross-verification               /dev/components
```

★ The two routes that do not exist on any comparable site, and the reason to build
this one.

## State of the corpus

65 people (9 full dossiers, 4 substantial, 51 stubs), 10 events, 14 sources,
20 archives, 8 places, 8 groups, 22 documented relationships, 16 mapped disputes.

**The site says a thin dossier is thin rather than padding it out.** Dossier bodies
for the remaining stubs have not yet been pulled from Notion; those pages render
their identification and framing and state their own depth.

The corpus's own statement about itself, reproduced on every page footer: this is a
source-critical synthesis of the accessible secondary and catalogue literature with
a precise map of where the primary evidence sits. It is **not yet archival
research** — no carton has been opened, and no archival reference has been
reconstructed from memory or inferred. Its largest single weakness is that the
Moroccan-side documentary base is currently zero.

## What this deliberately does not do

No AI summarisation, no chat, no confidence percentages, no embedding-similarity
"related content", and no smoothing of the gaps. The corpus's value is that every
claim is traceable; each of those would destroy it in one move.
