/**
 * Report rendering, including a golden file.
 *
 * The golden test exists to catch an accidental change to the report's shape.
 * The report is the thing a returning user reads first, and a rule that stops
 * appearing in it is a rule that has silently stopped guarding anything.
 */

import { describe, expect, it } from 'vitest';
import { computeHealth, formatHealthLines } from '../src/report/health.js';
import { renderJson, renderMarkdown, renderTerminal } from '../src/report/render.js';
import { diffSnapshots } from '../src/diff/index.js';
import { event, makeSnapshot, person, source } from './helpers.js';
import type { Finding } from '../src/model/types.js';

const SNAPSHOT = makeSnapshot({
  people: [
    person({ slug: 'a', name: 'A', dossierStatus: 'Full dossier', evidenceBase: 'Strong - archival + academic' }),
    person({ slug: 'b', name: 'B' }),
  ],
  sources: [
    source({ slug: 's1', verification: 'Catalogue verified' }),
    source({ slug: 's2', verification: null }),
  ],
  events: [event()],
});

const FINDINGS: Finding[] = [
  {
    rule: 'R02',
    severity: 'error',
    collection: 'sources',
    slug: 's1',
    field: 'archivalReference',
    message: 'Item-level citation "3H 1247" on a record marked NOT YET VERIFIED',
    detail: 'Series-level ranges are fine at this status.',
  },
  {
    rule: 'R11',
    severity: 'warn',
    collection: 'sources',
    slug: 's2',
    message: 'No verification status recorded',
  },
];

describe('corpus health', () => {
  it('reports counts, never a percentage or a score', () => {
    const lines = formatHealthLines(computeHealth(SNAPSHOT));
    const joined = lines.join('\n');
    expect(joined).not.toMatch(/\d+\s*%/);
    expect(joined.toLowerCase()).not.toContain('score');
    expect(joined).toContain('People 2');
  });

  it('counts a missing verification as its own bucket, not as NOT YET VERIFIED', () => {
    const h = computeHealth(SNAPSHOT);
    expect(h.sourceVerification['(not recorded)']).toBe(1);
    expect(h.sourceVerification['NOT YET VERIFIED']).toBe(0);
  });
});

describe('terminal report', () => {
  it('carries severity as a word, never colour alone', () => {
    const out = renderTerminal({ snapshot: SNAPSHOT, findings: FINDINGS });
    expect(out).toContain('ERROR');
    expect(out).toContain('WARN');
  });

  it('puts suspicious changes first', () => {
    const before = makeSnapshot({ people: [person({ slug: 'a', contestedPoints: 'His birth year.' })] });
    const after = makeSnapshot({ people: [person({ slug: 'a', contestedPoints: null })] });
    const diff = diffSnapshots(before, after);
    const out = renderTerminal({ snapshot: after, findings: FINDINGS, diff });
    const suspiciousAt = out.indexOf('SUSPICIOUS CHANGES');
    const errorsAt = out.indexOf('ERRORS');
    expect(suspiciousAt).toBeGreaterThanOrEqual(0);
    expect(suspiciousAt).toBeLessThan(errorsAt);
    // And it must be near the top: a daily reader should see it in the first
    // ten lines or the tool has failed.
    expect(out.slice(0, suspiciousAt).split('\n').length).toBeLessThanOrEqual(3);
  });

  it('names rules that could not run rather than implying they passed', () => {
    const out = renderTerminal({
      snapshot: SNAPSHOT,
      findings: [],
      skipped: [{ id: 'R12', why: 'needs a previous snapshot' }],
    });
    expect(out).toContain('NOT RUN');
    expect(out).toContain('R12');
  });
});

describe('markdown report — golden', () => {
  it('matches the expected structure', () => {
    const md = renderMarkdown({ snapshot: SNAPSHOT, findings: FINDINGS });

    // Section headings, in order, as the brief specifies.
    const headings = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(headings).toEqual([
      'Suspicious changes since last run',
      'Errors',
      'Warnings',
      'Notes',
      'Corpus health',
    ]);

    expect(md).toContain('# Integrity report — 2026-08-16');
    expect(md).toContain('it never writes to Notion');
    expect(md).toContain('**ERROR** `R02`');
    expect(md).toContain('**WARN** `R11`');
    expect(md).toContain('Counts, never a percentage or a score');
    // No score anywhere.
    expect(md).not.toMatch(/health:\s*\d+%/i);
  });

  it('says so plainly when there is nothing to report', () => {
    const md = renderMarkdown({ snapshot: SNAPSHOT, findings: [] });
    expect(md).toContain('_None._');
  });
});

describe('json report', () => {
  it('is machine-readable and carries the health block', () => {
    const parsed = JSON.parse(renderJson({ snapshot: SNAPSHOT, findings: FINDINGS }));
    expect(parsed.findings).toHaveLength(2);
    expect(parsed.health.counts.People).toBe(2);
    expect(parsed.health).not.toHaveProperty('score');
  });
});

describe('diff classification', () => {
  it('flags a deleted record', () => {
    const before = makeSnapshot({ people: [person({ slug: 'gone', name: 'Gone' })] });
    const after = makeSnapshot({ people: [] });
    const d = diffSnapshots(before, after);
    expect(d.removals).toHaveLength(1);
    expect(d.suspicious.some((f) => f.message.includes('Record deleted'))).toBe(true);
  });

  it('flags an assessment being deleted more severely than one revised', () => {
    const before = makeSnapshot({ people: [person({ slug: 'a', assessment: 'A judgement.' })] });
    const deleted = diffSnapshots(before, makeSnapshot({ people: [person({ slug: 'a', assessment: null })] }));
    const revised = diffSnapshots(
      before,
      makeSnapshot({ people: [person({ slug: 'a', assessment: 'A revised judgement.' })] })
    );
    expect(deleted.suspicious.find((f) => f.field === 'assessment')?.severity).toBe('error');
    expect(revised.suspicious.find((f) => f.field === 'assessment')?.severity).toBe('warn');
  });

  it('flags a hedge removed from beside a number', () => {
    const before = makeSnapshot({
      events: [event({ summary: 'At least 182 Zaian dead were counted.' })],
    });
    const after = makeSnapshot({ events: [event({ summary: '182 Zaian dead were counted.' })] });
    const d = diffSnapshots(before, after);
    expect(d.suspicious.some((f) => f.message.includes('Hedge'))).toBe(true);
  });

  it('does not flag prose merely being expanded', () => {
    const before = makeSnapshot({ people: [person({ slug: 'a', oneLine: 'A qaid.' })] });
    const after = makeSnapshot({
      people: [person({ slug: 'a', oneLine: 'A qaid of the Zaian confederation.' })],
    });
    const d = diffSnapshots(before, after);
    expect(d.edits).toHaveLength(1);
    expect(d.suspicious).toHaveLength(0);
  });
});
