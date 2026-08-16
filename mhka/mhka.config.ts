/**
 * Configuration reference.
 *
 * The runtime reads `mhka.config.json` (optional) and merges it over the
 * defaults in `src/config.ts`. This file documents the shape and is the place
 * to reason about severities before changing them.
 *
 * Severities are configurable because a rule nobody can tune is a rule
 * somebody eventually disables wholesale — and the brief is explicit that a
 * disabled rule guards nothing.
 */
import type { Config } from './src/config.js';

export const config: Partial<Config> = {
  severities: {
    R01: 'error', // unknown select value
    R02: 'error', // archival reference integrity — the highest-value rule
    R03: 'error', // bare figure where a range exists
    R04: 'warn', // unmarked colonial vocabulary
    R05: 'error', // name conflation
    R06: 'error', // dates stay verbatim
    R07: 'warn', // claim-status coherence
    R08: 'error', // assessment fencing
    R09: 'warn', // relation integrity
    R10: 'info', // staleness
    R11: 'warn', // tier / verification coherence
    R12: 'error', // evidence monotonicity (diff)
    R13: 'error', // range collapse (diff)
  },

  // A Full dossier gets a shorter fuse than a stub: there is more to rot.
  staleness: { default: 90, fullDossier: 60 },

  // Above this, the matcher proposes a duplicate. It never merges.
  aliasThreshold: 0.72,

  // Franco → launched the 1936 coup from → Morocco is recorded as a self-loop
  // because the corpus has no node for "Morocco"; the entry exists to record
  // that the Spanish Civil War began there.
  allowedSelfLoops: ['franco-launched-the-1936-coup-from-morocco'],
};

export default config;
