#!/usr/bin/env node
/**
 * mhka — integrity toolkit for the Moroccan History from the Archives base.
 *
 * Read-only. It pulls, validates, compares and reports. A human or the
 * research agent acts on the report.
 */

import { Command } from 'commander';
import { config as loadEnv } from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './config.js';
import { listSnapshots, loadSnapshot, sync } from './notion/sync.js';
import { runRules, skippedRules } from './rules/index.js';
import { diffSnapshots } from './diff/index.js';
import { renderJson, renderMarkdown, renderTerminal } from './report/render.js';
import { resolveAlias } from './alias/match.js';
import { splitAliases } from './alias/fold.js';
import { loadKnownDistinct } from './rules/corpus-rules.js';
import { computeHealth, formatHealthLines } from './report/health.js';
import type { Finding } from './model/types.js';

loadEnv();

const program = new Command();
const ROOT = process.cwd();

program
  .name('mhka')
  .description(
    'Read-only integrity toolkit for the Moroccan History knowledge base.\n' +
      'It never writes to Notion — it reports, and a human acts.'
  )
  .version('0.1.0');

// ───────────────────────────────────────────────────────────────── sync

program
  .command('sync')
  .description('Pull Notion into .cache and write a dated snapshot')
  .option('--offline', 'Build a snapshot from the existing .cache without contacting Notion')
  .option('--bodies', 'Also fetch page bodies (slower; several rules read them)')
  .action(async (opts) => {
    const config = loadConfig(ROOT);
    try {
      const { snapshot, path } = await sync({
        root: ROOT,
        config,
        offline: opts.offline,
        bodies: opts.bodies,
      });
      console.log(`Snapshot written: ${path}`);
      console.log('');
      for (const line of formatHealthLines(computeHealth(snapshot))) console.log(`  ${line}`);
    } catch (e) {
      console.error(`sync failed — the existing cache is untouched.\n${(e as Error).message}`);
      process.exitCode = 1;
    }
  });

// ───────────────────────────────────────────────────────────── validate

program
  .command('validate')
  .description('Run rules against the latest snapshot')
  .option('--rule <ids...>', 'Restrict to specific rules, e.g. --rule R05 R06')
  .option('--snapshot <file>', 'Validate a specific snapshot instead of the latest')
  .option('--json', 'Machine-readable output')
  .option('--markdown', 'Markdown output')
  .option(
    '--exit-zero',
    'Report findings but exit 0. For smoke-testing that the tool runs against ' +
      'real data; NOT for gating a corpus, where a finding is the point.'
  )
  .action((opts) => {
    const config = loadConfig(ROOT);
    try {
      const snapshot = loadSnapshot(ROOT, config, opts.snapshot);
      const findings = runRules({ snapshot, config, only: opts.rule });
      const skipped = skippedRules(undefined, opts.rule);

      const input = { snapshot, findings, skipped, staleDays: config.staleness.default };
      console.log(
        opts.json ? renderJson(input) : opts.markdown ? renderMarkdown(input) : renderTerminal(input)
      );
      // A crash is always a failure. Corpus findings are a failure only when
      // the caller is auditing the corpus rather than exercising the tool —
      // see the note on --exit-zero above, and .github/workflows/mhka.yml.
      process.exitCode = opts.exitZero ? 0 : exitCodeFor(findings);
    } catch (e) {
      console.error((e as Error).message);
      process.exitCode = 1;
    }
  });

// ────────────────────────────────────────────────────────────────── diff

program
  .command('diff')
  .description('Compare two snapshots and flag suspicious changes')
  .option('--since <date>', 'Compare against the snapshot from this date (YYYY-MM-DD)')
  .option('--from <file>', 'Explicit earlier snapshot')
  .option('--to <file>', 'Explicit later snapshot')
  .option('--json', 'Machine-readable output')
  .option('--markdown', 'Markdown output')
  .action((opts) => {
    const config = loadConfig(ROOT);
    try {
      const snaps = listSnapshots(ROOT, config);
      if (snaps.length < 2 && !(opts.from && opts.to)) {
        console.error(
          `Need two snapshots to diff; found ${snaps.length} in ${config.paths.snapshots}.\n` +
            'Run `mhka sync` on two different days.'
        );
        process.exitCode = 1;
        return;
      }

      const toFile = opts.to ?? snaps[snaps.length - 1]!;
      const fromFile =
        opts.from ?? (opts.since ? `${opts.since}.json` : snaps[snaps.length - 2]!);

      const before = loadSnapshot(ROOT, config, fromFile);
      const after = loadSnapshot(ROOT, config, toFile);

      const result = diffSnapshots(before, after);
      const findings = runRules({ snapshot: after, previous: before, config });

      const input = {
        snapshot: after,
        findings,
        diff: result,
        staleDays: config.staleness.default,
      };
      console.log(
        opts.json ? renderJson(input) : opts.markdown ? renderMarkdown(input) : renderTerminal(input)
      );
      process.exitCode = exitCodeFor([...findings, ...result.suspicious]);
    } catch (e) {
      console.error((e as Error).message);
      process.exitCode = 1;
    }
  });

// ──────────────────────────────────────────────────────────────── report

program
  .command('report')
  .description('Full report — findings, suspicious changes and corpus health')
  .option('--markdown', 'Markdown, ready to paste as a Research-log appendix')
  .option('--json', 'Machine-readable output')
  .option('--out <file>', 'Write to reports/<file> instead of stdout')
  .action((opts) => {
    const config = loadConfig(ROOT);
    try {
      const snaps = listSnapshots(ROOT, config);
      const snapshot = loadSnapshot(ROOT, config);
      const previous = snaps.length >= 2 ? loadSnapshot(ROOT, config, snaps[snaps.length - 2]) : undefined;

      const findings = runRules({ snapshot, previous, config });
      const diff = previous ? diffSnapshots(previous, snapshot) : undefined;
      const input = {
        snapshot,
        findings,
        diff,
        skipped: skippedRules(previous),
        staleDays: config.staleness.default,
      };

      const text = opts.json
        ? renderJson(input)
        : opts.markdown
          ? renderMarkdown(input)
          : renderTerminal(input);

      if (opts.out) {
        const dir = join(ROOT, config.paths.reports);
        mkdirSync(dir, { recursive: true });
        const path = join(dir, opts.out);
        writeFileSync(path, text);
        console.log(`Report written: ${path}`);
      } else {
        console.log(text);
      }
      process.exitCode = exitCodeFor([...findings, ...(diff?.suspicious ?? [])]);
    } catch (e) {
      console.error((e as Error).message);
      process.exitCode = 1;
    }
  });

// ─────────────────────────────────────────────────────────────── aliases

program
  .command('aliases <name>')
  .description('Resolve a name across transliterations')
  .option('--threshold <n>', 'Match threshold, 0-1', parseFloat)
  .action((name: string, opts) => {
    const config = loadConfig(ROOT);
    try {
      const snapshot = loadSnapshot(ROOT, config);
      const known = loadKnownDistinct(config.paths.data);

      const index = snapshot.people.map((p) => ({
        slug: p.slug,
        display: p.name,
        names: [p.name, ...p.aliases, ...splitAliases(p.aliasesRaw)],
      }));

      const hits = resolveAlias(name, index, opts.threshold ?? config.aliasThreshold);

      if (!hits.length) {
        console.log(`No match for "${name}".`);
        console.log('Try a different spelling, or lower --threshold.');
        return;
      }

      console.log(`"${name}" resolves to ${hits.length} ${hits.length === 1 ? 'person' : 'people'}:`);
      console.log('');
      for (const hit of hits) {
        console.log(`  ${hit.name}`);
        console.log(`    slug     ${hit.slug}`);
        console.log(`    score    ${hit.score.toFixed(3)}`);
        console.log(`    matched  "${hit.via}"`);
        console.log('');
      }

      // If two or more hits are a declared-distinct pair, say so loudly:
      // returning two people is the correct answer, and the reader must not
      // read it as a duplicate to be merged.
      if (hits.length > 1) {
        for (const pair of known.pairs) {
          const names = hits.map((h) => h.name);
          if (names.includes(pair.a) && names.includes(pair.b)) {
            console.log(`  ⚠ KNOWN DISTINCT — these are different people, not duplicates.`);
            console.log(`    ${pair.why}`);
            console.log('');
          }
        }
        for (const nm of known.neverMerge) {
          if (hits.some((h) => h.name.includes(nm.name.split(' ')[0] ?? ''))) {
            console.log(`  ⚠ ${nm.name}: ${nm.why}`);
            console.log('');
          }
        }
      }
    } catch (e) {
      console.error((e as Error).message);
      process.exitCode = 1;
    }
  });

// ───────────────────────────────────────────────────────────────── stale

program
  .command('stale')
  .description('Records not reviewed recently')
  .option('--days <n>', 'Threshold in days', (v) => parseInt(v, 10))
  .action((opts) => {
    const config = loadConfig(ROOT);
    try {
      const snapshot = loadSnapshot(ROOT, config);
      const days = opts.days ?? config.staleness.default;
      const findings = runRules({
        snapshot,
        config: { ...config, staleness: { default: days, fullDossier: Math.floor(days * 0.67) } },
        only: ['R10'],
      });

      if (!findings.length) {
        console.log(`Nothing unreviewed beyond ${days} days.`);
        return;
      }
      console.log(`${findings.length} record(s) not reviewed in ${days} days:`);
      console.log('');
      for (const f of findings) console.log(`  ${f.slug}  —  ${f.message}`);
    } catch (e) {
      console.error((e as Error).message);
      process.exitCode = 1;
    }
  });

function exitCodeFor(findings: Finding[]): number {
  return findings.some((f) => f.severity === 'error') ? 1 : 0;
}

program.parse();
