/**
 * Configuration.
 *
 * Database IDs and rule severities live in `mhka.config.ts` at the package
 * root; the token lives in `.env`. Severities are configurable because a rule
 * nobody can tune is a rule somebody eventually disables wholesale.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Severity } from './model/types.js';

export interface Config {
  databases: Record<string, string>;
  pages: Record<string, { id: string; title: string }>;
  severities: Record<string, Severity>;
  /** R10 thresholds, in days. */
  staleness: { default: number; fullDossier: number };
  /** R05 alias-match threshold. */
  aliasThreshold: number;
  /** Relationship self-loops that are legitimate — see R09. */
  allowedSelfLoops: string[];
  paths: { cache: string; snapshots: string; reports: string; data: string };
}

export const DEFAULT_CONFIG: Config = {
  databases: {
    people: '8645be5a1ebf44068dc8b6e8acd684ec',
    events: '0951dd9c4de44267835cf05c1167c04b',
    sources: '5c17df2c42cd41f483670da3ac293dfc',
    places: 'e234e8f8315645a68562f718036ef0a9',
    groups: 'd30e95d8dad64a92909586af0b282ed6',
    relationships: '9abd7d5bdfa24c938751c0288aee15ad',
    archives: '49f975b985c4478b8b1f4a7225cb62c2',
  },
  pages: {
    synthesis: { id: '3bd885d880428123ba90c0f1f9bd8b21', title: 'Synthesis' },
    timeline: { id: '3bd885d8804281eead73d6093e4b45ba', title: 'Timeline' },
    bias: { id: '3bd885d88042813b9ba3d83dff389e08', title: 'Source bias and contradictions' },
    discovered: {
      id: '3bd885d8804281eca780e7ec53faa346',
      title: 'Discovered and forgotten personalities',
    },
    'research-plan': { id: '3bd885d880428125b5d1fe6c899aa964', title: 'Archival research plan' },
    'cross-verification': {
      id: '3bd885d8804281ee8bd9f03c07b478a1',
      title: 'Global sources — cross-verification matrix',
    },
    'research-log': { id: '3bd885d8804281c98055ca13534bf337', title: 'Research log' },
  },
  severities: {
    R01: 'error',
    R02: 'error',
    R03: 'error',
    R04: 'warn',
    R05: 'error',
    R06: 'error',
    R07: 'warn',
    R08: 'error',
    R09: 'warn',
    R10: 'info',
    R11: 'warn',
    R12: 'error',
    R13: 'error',
  },
  staleness: { default: 90, fullDossier: 60 },
  aliasThreshold: 0.72,
  // Franco → launched the 1936 coup from → Morocco is recorded as a self-loop
  // because the corpus has no node for "Morocco"; the entry exists to record
  // that the Spanish Civil War began there.
  allowedSelfLoops: ['franco-launched-the-1936-coup-from-morocco'],
  paths: {
    cache: '.cache',
    snapshots: 'snapshots',
    reports: 'reports',
    data: 'data',
  },
};

/**
 * Load config. A `mhka.config.json` beside the package overrides the defaults
 * shallowly; the TS config file is documentation of the same shape.
 */
export function loadConfig(root = process.cwd()): Config {
  const jsonPath = join(root, 'mhka.config.json');
  if (!existsSync(jsonPath)) return DEFAULT_CONFIG;
  try {
    const override = JSON.parse(readFileSync(jsonPath, 'utf8')) as Partial<Config>;
    return {
      ...DEFAULT_CONFIG,
      ...override,
      databases: { ...DEFAULT_CONFIG.databases, ...(override.databases ?? {}) },
      pages: { ...DEFAULT_CONFIG.pages, ...(override.pages ?? {}) },
      severities: { ...DEFAULT_CONFIG.severities, ...(override.severities ?? {}) },
      staleness: { ...DEFAULT_CONFIG.staleness, ...(override.staleness ?? {}) },
      paths: { ...DEFAULT_CONFIG.paths, ...(override.paths ?? {}) },
    };
  } catch (e) {
    throw new Error(`mhka.config.json is not valid JSON: ${(e as Error).message}`);
  }
}

export function severityFor(
  config: Config,
  ruleId: string,
  fallback: Severity
): Severity {
  return config.severities[ruleId] ?? fallback;
}
