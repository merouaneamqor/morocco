# `mhka` — integrity toolkit

A read-only Node CLI that guards the *Moroccan History from the Archives*
knowledge base against silent degradation.

An unattended agent writes into that base every morning. Over months, without a
guard, it drifts: duplicate people under variant spellings, a range quietly
collapsing to one number, a verification status upgrading with no source behind
it, an opinion migrating into an evidence field. None of those would be noticed
by a human reading one page. All of them destroy the corpus.

**This tool makes that drift visible. It is the auditor, not the editor.**

## The hard constraint

> ### It never writes to Notion. Not once. Not "safe fixes". Not with a `--force` flag.

It reads, validates and reports. A human or the research agent acts on the
report. The only filesystem writes are to `.cache/`, `snapshots/` and
`reports/`.

`test/no-write.test.ts` asserts this mechanically: it greps the compiled bundle
for `pages.update`, `pages.create`, `blocks.children.append` and
`databases.update`, checks the sources with comments stripped, and fails if a
`--fix`/`--force`/`--apply` flag has been added to the CLI. If that test is
failing, the fix is to remove the write call, not to relax the test.

## Commands

```bash
mhka sync                      # Notion → .cache, write a dated snapshot
mhka sync --offline            # rebuild a snapshot from the existing cache
mhka validate [--rule R05 R06] # run rules against the latest snapshot
mhka diff [--since 2026-08-16] # compare snapshots, flag suspicious changes
mhka report [--markdown]       # full report, ready to paste into Notion
mhka aliases <name>            # resolve a name across transliterations
mhka stale [--days 90]         # records not reviewed recently
```

Exit code is `1` when any error-severity finding is present, so `validate` and
`diff` can gate a scheduled corpus job. Pass `--exit-zero` to report findings
without gating — that is for smoke-testing that the tool runs, and it is what
CI uses.

**CI does not gate on corpus findings, deliberately.** `mhka` audits a living
base that an agent writes to every morning, so findings are its normal output
rather than a broken build. Gating on them turns every unrelated pull request
red — a dependency bump cannot fix an unverified archival reference — and a
check that is red for reasons the author cannot act on is a check people learn
to ignore. CI therefore gates on build and tests, smoke-tests the rules against
the committed snapshot, and posts the findings to the run summary. A crash still
fails: `--exit-zero` forgives findings, never failures.

### Getting a first snapshot

```bash
npm install
cp .env.example .env          # add a read-only NOTION_TOKEN
npm run mhka -- sync
```

Without a token, bootstrap from the copy of the corpus already in the sibling
website repo:

```bash
node scripts/bootstrap-from-site.mjs
npm run mhka -- sync --offline
```

That is a bootstrap, not a substitute: a real `sync` also brings the Notion
property types with it, which is what lets **R06** see a schema change.

## The rules

| ID | Rule | Default |
|---|---|---|
| R01 | Unknown select value | error |
| R02 | Archival reference integrity | error |
| R03 | Bare figure where a range exists | error |
| R04 | Unmarked colonial vocabulary | warn |
| R05 | Name conflation and duplicates | error / warn |
| R06 | Date fields must stay verbatim | error |
| R07 | Claim-status coherence | warn |
| R08 | Assessment fencing | error |
| R09 | Relation integrity | warn |
| R10 | Staleness | info |
| R11 | Tier / verification coherence | warn |
| R12 | Evidence monotonicity | error *(diff)* |
| R13 | Range collapse | error *(diff)* |

Severities are configurable in `mhka.config.json`. R12 and R13 need two
snapshots; `validate` reports them as **not run** rather than letting silence
read as a pass.

### The three that carry the most weight

**R02** is the highest-value rule. A series-level range is a legitimate thing to
write down before you have been to the archive — you can read it off a published
guide. An item-level citation is not. A record marked `NOT YET VERIFIED` that
also carries `3H 1247` or `HR.SYS. 2392/2` means something produced a
precise-looking reference without consulting anything.

**R12** catches an unattended agent talking itself into confidence: a status may
not strengthen without a source appearing. `Contested` is deliberately outside
the evidence-base ladder, so moving into or out of it is never read as a
strengthening.

**R13** catches the signature failure mode of automated summarisation — a range
becoming a single number — which is invisible to anyone reading the page
afterwards.

### R03 needs topical context, and that is not incidental

Every contested quantity in `data/contested-quantities.json` carries `context`
terms, and a bare figure is only a finding when the surrounding text is actually
about that quantity. Without it, `2,000` matches three different contested
quantities at once — Casablanca 1947, the Rif in 1958–59, and the German
estimate for Casablanca 1907 — and the rule becomes noise. A noisy rule gets
disabled, and a disabled rule guards nothing.

## The alias matcher

A person appears under five to ten spellings across four scripts and three
archival traditions:

```
Mouha ou Hammou Zayani = Moha ou Hammou = Muḥa u Ḥemmu Aẓayyi
                       = Hammou des Zaïanes = el caíd Hammu = محا أو حمو الزياني
```

Folding strips transliteration marks and underdots, folds `ou`↔`u`,
`ai`↔`aï`↔`ay`, `ch`↔`sh`, `dj`↔`j` and Spanish `j`↔`kh` (`Jenífra` =
`Khénifra`), strips particles and honorifics for the key only, and normalises
Arabic script in-script. Scoring is Jaro-Winkler on the folded key plus
token-set overlap.

Two deliberate refusals:

- **Cross-script pairs are never scored.** Transliterating Arabic to Latin is a
  scholarly act, not a string operation, and a bad automatic transliteration
  would produce exactly the confident-looking false positive this tool exists to
  prevent. Records carrying both scripts link them explicitly.
- **A name that merely extends another is penalised, not merged.** `Mohamed
  Ameziane` is a strict subset of `Mohammed Sellam Ameziane` and they are
  different men, half a century apart.

The matcher proposes; a human disposes. There is no auto-merge.
`data/known-distinct.json` records the pairs the corpus insists are different
people, and every one is tested as a negative.

```
$ mhka aliases "Ameziane"
"Ameziane" resolves to 2 people:
  Mohamed Ameziane           …
  Mohammed Sellam Ameziane   …
  ⚠ KNOWN DISTINCT — these are different people, not duplicates.
```

## Corpus health

Reported as **counts, never a percentage or a score**. A "corpus health: 78%"
figure would invite optimising the number instead of the history, and would
flatten exactly the distinction — between thin and strong evidence — that the
base exists to preserve. Show the shape; refuse the summary. A test asserts no
percentage appears in the output.

```
People 70 · Events 14 · Sources 26 · Archives 25 · Relationships 22
Dossier status:  Full 9 · Substantial 5 · Stub 54 · Identified 2
Evidence base:   Strong 2 · Moderate 22 · Thin 40 · Contested 6
Verification:    Consulted 1 · Catalogue 4 · Cited 7 · NOT YET VERIFIED 2 · (not recorded) 12
```

Note `(not recorded)` is its own bucket. A source with no `Verification` value
is not the same as one marked `NOT YET VERIFIED`: the first is a judgement the
corpus has not made, the second is one it has.

## Tests

```bash
npm test          # 81 tests
npm run verify    # build + test
```

One fixture per rule — failing, passing and edge — because a rule that fires on
everything is as useless as one that fires on nothing. The alias matcher gets
the corpus's real alias strings as positives and every `known-distinct` pair as
a negative. `diff` gets synthetic snapshot pairs for R12 and R13. The Markdown
report has a golden test on its section structure. `cli.test.ts` pins the
exit-code contract — including that a crash still exits non-zero under
`--exit-zero`, which is what makes the CI smoke test worth running.

## What this deliberately does not have

- **No write path.** Stated at the top and again here, because it is the thing
  most likely to get added later "just for convenience".
- **No auto-merge of people.** Two men named Ameziane are the reason.
- **No LLM summarisation of findings.** The report is generated from rules,
  deterministically. A model paraphrasing violations would reintroduce exactly
  the drift this tool exists to catch.
- **No quality score.**
- **No scheduler.** The daily research agent exists elsewhere; this is a tool it
  and the user invoke, not a competing loop.

---

This corpus is defensible because a reader can always ask *what do we actually
know, and how do we know it* — and get an honest answer, including "we don't"
and "someone knows and won't say". Every rule here defends one of those answers
against the slow pressure toward confidence that any automated process applies.
**The tool is not improving the history. It is making sure nobody improves it
quietly.**
