/**
 * Corpus health — the numbers worth watching over months.
 *
 * Reported as COUNTS, never as a percentage or a score.
 *
 * That is a deliberate refusal, not an oversight. A "corpus health: 78%" figure
 * would invite optimising the number instead of the history, and it would
 * flatten exactly the distinction — between thin and strong evidence — that the
 * whole base exists to preserve. Show the shape; refuse the summary.
 *
 * If you are here to add a score because a dashboard wants one, that is the
 * argument against it.
 */

import type { Snapshot } from '../model/types.js';
import {
  ARCHIVE_VERIFICATION,
  DOSSIER_STATUS,
  EVIDENCE_BASE,
  IMPACT,
  SOURCE_VERIFICATION,
  TIERS,
} from '../model/vocab.js';

export interface Health {
  counts: Record<string, number>;
  dossierStatus: Record<string, number>;
  evidenceBase: Record<string, number>;
  sourceVerification: Record<string, number>;
  archiveVerification: Record<string, number>;
  tiers: Record<string, number>;
  impact: { rated: number; total: number; byValue: Record<string, number> };
  assessments: { written: number; total: number; withFalsifier: number };
  stale: number;
  takenAt: string;
}

function tally(values: (string | null)[], vocabulary: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of vocabulary) out[v] = 0;
  let unset = 0;
  for (const v of values) {
    if (v == null) {
      unset++;
      continue;
    }
    out[v] = (out[v] ?? 0) + 1;
  }
  if (unset) out['(not recorded)'] = unset;
  return out;
}

export function computeHealth(snapshot: Snapshot, staleDays = 90): Health {
  const now = Date.now();
  const day = 86_400_000;

  const stale = snapshot.people.filter((p) => {
    if (!p.lastReviewed) return false;
    const age = (now - Date.parse(p.lastReviewed)) / day;
    return Number.isFinite(age) && age > staleDays;
  }).length;

  const assessments = snapshot.people.filter((p) => p.assessment);
  const withFalsifier = assessments.filter((p) =>
    /\b(would change|would revise|unless|if evidence showed|falsifi)\b/i.test(p.assessment ?? '')
  ).length;

  return {
    takenAt: snapshot.takenAt,
    counts: {
      People: snapshot.people.length,
      Events: snapshot.events.length,
      Sources: snapshot.sources.length,
      Archives: snapshot.archives.length,
      Relationships: snapshot.relationships.length,
      Places: snapshot.places.length,
      Groups: snapshot.groups.length,
      Pages: snapshot.pages.length,
    },
    dossierStatus: tally(
      snapshot.people.map((p) => p.dossierStatus),
      DOSSIER_STATUS
    ),
    evidenceBase: tally(
      snapshot.people.map((p) => p.evidenceBase),
      EVIDENCE_BASE
    ),
    sourceVerification: tally(
      snapshot.sources.map((s) => s.verification),
      SOURCE_VERIFICATION
    ),
    archiveVerification: tally(
      snapshot.archives.map((a) => a.verification),
      ARCHIVE_VERIFICATION
    ),
    tiers: tally(
      snapshot.sources.map((s) => s.tier),
      TIERS
    ),
    impact: {
      rated: snapshot.people.filter((p) => p.impact).length,
      total: snapshot.people.length,
      byValue: tally(
        snapshot.people.map((p) => p.impact),
        IMPACT
      ),
    },
    assessments: {
      written: assessments.length,
      total: snapshot.people.length,
      withFalsifier,
    },
    stale,
  };
}

/** Compact one-line-per-dimension rendering, for the terminal and Markdown. */
export function formatHealthLines(h: Health): string[] {
  const pairs = (rec: Record<string, number>) =>
    Object.entries(rec)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${shorten(k)} ${n}`)
      .join(' · ');

  return [
    Object.entries(h.counts)
      .map(([k, n]) => `${k} ${n}`)
      .join(' · '),
    `Dossier status:  ${pairs(h.dossierStatus)}`,
    `Evidence base:   ${pairs(h.evidenceBase)}`,
    `Source tier:     ${pairs(h.tiers)}`,
    `Verification:    ${pairs(h.sourceVerification)}`,
    `Archive verif.:  ${pairs(h.archiveVerification)}`,
    `Impact rated:    ${h.impact.rated} / ${h.impact.total}`,
    `Assessments:     ${h.assessments.written} / ${h.assessments.total} written · ${h.assessments.withFalsifier} name a falsifier`,
    `Stale:           ${h.stale}`,
  ];
}

/** Trim the long select labels to their distinguishing head. */
function shorten(label: string): string {
  return label
    .replace(' - archival + academic', '')
    .replace(' - academic', '')
    .replace(' - encyclopedic leads only', '')
    .replace(' - not yet researched', '')
    .replace(' dossier', '')
    .replace(' by named scholar', '')
    .replace('Described', 'Described')
    .replace('PRIMARY_', 'PRIM_');
}
