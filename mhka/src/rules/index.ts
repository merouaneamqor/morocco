import type { Config } from '../config.js';
import { severityFor as sev } from '../config.js';
import type { Finding, Rule, Severity, Snapshot } from '../model/types.js';
import { R01, R06 } from './schema-rules.js';
import { R02, R03, R08, R11 } from './evidence-rules.js';
import { R04, R05, R07, R09, R10 } from './corpus-rules.js';
import { R12, R13 } from './diff-rules.js';

export const ALL_RULES: Rule[] = [R01, R02, R03, R04, R05, R06, R07, R08, R09, R10, R11, R12, R13];

export interface RunOptions {
  snapshot: Snapshot;
  previous?: Snapshot;
  config: Config;
  /** Restrict to specific rule ids. */
  only?: string[];
}

export function runRules({ snapshot, previous, config, only }: RunOptions): Finding[] {
  const selected = ALL_RULES.filter((r) => {
    if (only?.length && !only.includes(r.id)) return false;
    // A diff rule with no previous snapshot has nothing to compare and is
    // skipped rather than reported as passing — see `skippedRules`.
    if (r.requiresDiff && !previous) return false;
    return true;
  });

  const ctx = {
    snapshot,
    previous,
    config,
    severityFor: (id: string, fallback: Severity) => sev(config, id, fallback),
  };

  const findings: Finding[] = [];
  for (const rule of selected) {
    try {
      findings.push(...rule.run(ctx));
    } catch (e) {
      // A rule that throws must not take the run down with it: the other
      // twelve still have something to say.
      findings.push({
        rule: rule.id,
        severity: 'error',
        message: `Rule ${rule.id} (${rule.title}) threw: ${(e as Error).message}`,
        detail: 'This is a bug in the toolkit, not necessarily a problem with the corpus.',
      });
    }
  }

  return sortFindings(findings);
}

/** Rules that could not run, and why — reported so silence is never mistaken for a pass. */
export function skippedRules(previous?: Snapshot, only?: string[]): { id: string; why: string }[] {
  return ALL_RULES.filter(
    (r) => r.requiresDiff && !previous && (!only?.length || only.includes(r.id))
  ).map((r) => ({
    id: r.id,
    why: 'needs a previous snapshot; run `mhka sync` on two different days, then `mhka diff`',
  }));
}

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.rule.localeCompare(b.rule) ||
      (a.slug ?? '').localeCompare(b.slug ?? '')
  );
}

export { R01, R02, R03, R04, R05, R06, R07, R08, R09, R10, R11, R12, R13 };
