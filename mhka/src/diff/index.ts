/**
 * diff — the daily guard.
 *
 * Classifies every change between two snapshots into additions, benign edits
 * and suspicious changes. The suspicious set is printed first: a daily reader
 * should see it in the first ten lines or the tool has failed.
 */

import type { Finding, Snapshot } from '../model/types.js';
import { HEDGES } from '../model/vocab.js';

export interface RecordChange {
  collection: string;
  slug: string;
  title: string;
  kind: 'added' | 'removed' | 'edited';
  fields: { field: string; before: unknown; after: unknown }[];
}

export interface DiffResult {
  from: string;
  to: string;
  additions: RecordChange[];
  removals: RecordChange[];
  edits: RecordChange[];
  /** Changes that need a human eye, independent of the rule findings. */
  suspicious: Finding[];
}

const COLLECTIONS = [
  ['people', 'name'],
  ['events', 'event'],
  ['sources', 'title'],
  ['archives', 'institution'],
  ['relationships', 'label'],
  ['places', 'place'],
  ['groups', 'group'],
  ['pages', 'title'],
] as const;

export function diffSnapshots(before: Snapshot, after: Snapshot): DiffResult {
  const additions: RecordChange[] = [];
  const removals: RecordChange[] = [];
  const edits: RecordChange[] = [];
  const suspicious: Finding[] = [];

  for (const [collection, titleKey] of COLLECTIONS) {
    const beforeRows = new Map(
      ((before[collection] ?? []) as any[]).map((r) => [r.slug as string, r])
    );
    const afterRows = new Map(((after[collection] ?? []) as any[]).map((r) => [r.slug as string, r]));

    for (const [slug, row] of afterRows) {
      if (!beforeRows.has(slug)) {
        additions.push({
          collection,
          slug,
          title: String(row[titleKey] ?? slug),
          kind: 'added',
          fields: [],
        });
      }
    }

    for (const [slug, row] of beforeRows) {
      if (afterRows.has(slug)) continue;
      removals.push({
        collection,
        slug,
        title: String(row[titleKey] ?? slug),
        kind: 'removed',
        fields: [],
      });
      // A deleted record is always suspicious. The corpus grows; it does not
      // tidy itself.
      suspicious.push({
        rule: 'DIFF',
        severity: 'error',
        collection,
        slug,
        message: `Record deleted: "${row[titleKey] ?? slug}"`,
        detail: 'Deletions are never routine here. Confirm this was intended.',
      });
    }

    for (const [slug, nowRow] of afterRows) {
      const thenRow = beforeRows.get(slug);
      if (!thenRow) continue;
      if (thenRow.hash === nowRow.hash) continue;

      const changed: { field: string; before: unknown; after: unknown }[] = [];
      const keys = new Set([...Object.keys(thenRow), ...Object.keys(nowRow)]);
      for (const key of keys) {
        if (key === 'hash' || key === 'lastEdited') continue;
        const a = thenRow[key];
        const b = nowRow[key];
        if (JSON.stringify(a) === JSON.stringify(b)) continue;
        changed.push({ field: key, before: a, after: b });
      }
      if (!changed.length) continue;

      edits.push({
        collection,
        slug,
        title: String(nowRow[titleKey] ?? slug),
        kind: 'edited',
        fields: changed,
      });

      suspicious.push(...classifyEdit(collection, slug, String(nowRow[titleKey] ?? slug), thenRow, nowRow, changed));
    }
  }

  return {
    from: before.takenAt,
    to: after.takenAt,
    additions,
    removals,
    edits,
    suspicious,
  };
}

function classifyEdit(
  collection: string,
  slug: string,
  title: string,
  before: any,
  after: any,
  changed: { field: string; before: unknown; after: unknown }[]
): Finding[] {
  const out: Finding[] = [];

  for (const change of changed) {
    // An assessment edited or deleted. Assessments are meant to be revised
    // visibly, so every change is surfaced with its before/after.
    if (change.field === 'assessment') {
      out.push({
        rule: 'DIFF',
        severity: after.assessment ? 'warn' : 'error',
        collection,
        slug,
        field: 'assessment',
        message: after.assessment
          ? `Assessment revised on "${title}"`
          : `Assessment DELETED from "${title}"`,
        detail:
          `Before: ${truncate(String(change.before ?? '(none)'))}\n` +
          `After:  ${truncate(String(change.after ?? '(none)'))}\n` +
          `Assessments are revised visibly by design. Confirm the revision is signed.`,
      });
    }

    // Contested points emptied.
    if (change.field === 'contestedPoints' && change.before && !change.after) {
      out.push({
        rule: 'DIFF',
        severity: 'error',
        collection,
        slug,
        field: 'contestedPoints',
        message: `Contested points emptied on "${title}"`,
        detail:
          `Was: ${truncate(String(change.before))}\n` +
          `A dispute does not usually stop existing. Confirm it was resolved rather than dropped.`,
      });
    }

    // Archival reference changed while verification stayed put.
    if (
      (change.field === 'archivalReference' || change.field === 'fonds') &&
      before.verification === after.verification
    ) {
      out.push({
        rule: 'DIFF',
        severity: 'warn',
        collection,
        slug,
        field: change.field,
        message: `Archival reference changed but verification did not, on "${title}"`,
        detail:
          `Before: ${truncate(String(change.before ?? '(none)'))}\n` +
          `After:  ${truncate(String(change.after ?? '(none)'))}\n` +
          `Verification is still "${after.verification ?? '(none)'}". If the reference improved,\n` +
          `the verification status probably should have moved too — or the reference was\n` +
          `written without consulting anything.`,
      });
    }

    // A hedge removed from beside a number.
    if (typeof change.before === 'string' && typeof change.after === 'string') {
      const lost = hedgesLostNearNumber(change.before, change.after);
      for (const hedge of lost) {
        out.push({
          rule: 'DIFF',
          severity: 'warn',
          collection,
          slug,
          field: change.field,
          message: `Hedge "${hedge}" removed from beside a number on "${title}"`,
          detail:
            `Before: ${truncate(change.before)}\n` +
            `After:  ${truncate(change.after)}\n` +
            `Removing a hedge turns an estimate into a fact without new evidence.`,
        });
      }
    }
  }

  return out;
}

/** Hedges present next to a number before, and absent after. */
function hedgesLostNearNumber(before: string, after: string): string[] {
  const lost: string[] = [];
  for (const hedge of HEDGES) {
    const re = new RegExp(`\\b${hedge.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b[^.]{0,40}?\\d`, 'i');
    const reRev = new RegExp(`\\d[^.]{0,40}?\\b${hedge.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const hadIt = re.test(before) || reRev.test(before);
    const hasIt = re.test(after) || reRev.test(after);
    if (hadIt && !hasIt) lost.push(hedge);
  }
  return lost;
}

function truncate(s: string, n = 160): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > n ? `${flat.slice(0, n)}…` : flat;
}
