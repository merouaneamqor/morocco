/**
 * One fixture per rule: a failing case, a passing case, and an edge case.
 *
 * The passing cases matter as much as the failing ones. A rule that fires on
 * everything is as useless as one that fires on nothing, and the corpus is
 * full of legitimate constructions — an attributed single figure, a
 * series-level reference on an unverified record — that must not trip it.
 */

import { describe, expect, it } from 'vitest';
import { R01, R06 } from '../src/rules/schema-rules.js';
import { R02, R03, R08, R11 } from '../src/rules/evidence-rules.js';
import { R04, R05, R07, R09, R10 } from '../src/rules/corpus-rules.js';
import { R12, R13 } from '../src/rules/diff-rules.js';
import {
  archive,
  event,
  makeSnapshot,
  page,
  person,
  relationship,
  runRule,
  source,
} from './helpers.js';

describe('R01 — unknown select value', () => {
  it('fails on a value outside the vocabulary', () => {
    const snap = makeSnapshot({ people: [person({ dossierStatus: 'Almost done' })] });
    const f = runRule(R01, snap);
    expect(f.some((x) => x.rule === 'R01' && x.field === 'dossierStatus')).toBe(true);
    expect(f[0]?.severity).toBe('error');
  });

  it('passes on the real vocabulary', () => {
    const snap = makeSnapshot({ people: [person()] });
    expect(runRule(R01, snap)).toHaveLength(0);
  });

  it('edge: a source with no verification is a gap, not an invalid value', () => {
    const snap = makeSnapshot({ sources: [source({ verification: null })] });
    expect(runRule(R01, snap).filter((x) => x.field === 'verification')).toHaveLength(0);
  });
});

describe('R06 — dates stay verbatim', () => {
  it('fails when the schema declares Born as a date', () => {
    const snap = makeSnapshot({
      people: [person()],
      propertyTypes: { people: { Born: 'date', Died: 'rich_text' } },
    });
    const f = runRule(R06, snap);
    expect(f.some((x) => x.message.includes('declared as "date"'))).toBe(true);
  });

  it('fails when a disputed value has been normalised to an ISO date', () => {
    const snap = makeSnapshot({ people: [person({ born: '1836-01-01' })] });
    const f = runRule(R06, snap);
    expect(f.some((x) => x.field === 'born')).toBe(true);
  });

  it('passes on a verbatim disputed value', () => {
    const snap = makeSnapshot({
      people: [person({ born: '1836 (conventional). Some reference works give 1857' })],
    });
    expect(runRule(R06, snap)).toHaveLength(0);
  });

  it('edge: a bare year is not an ISO date and stays verbatim', () => {
    const snap = makeSnapshot({ people: [person({ born: '1915', died: '1990' })] });
    expect(runRule(R06, snap)).toHaveLength(0);
  });
});

describe('R02 — archival reference integrity', () => {
  it('fails on item-level precision at NOT YET VERIFIED', () => {
    const snap = makeSnapshot({
      sources: [
        source({
          verification: 'NOT YET VERIFIED',
          archivalReference: 'SHD 3H 1247. NOT YET VERIFIED.',
        }),
      ],
    });
    const f = runRule(R02, snap);
    expect(f.some((x) => x.message.includes('Item-level citation'))).toBe(true);
  });

  it('fails when the literal words are absent', () => {
    const snap = makeSnapshot({
      sources: [source({ verification: 'NOT YET VERIFIED', archivalReference: 'n/a' })],
    });
    const f = runRule(R02, snap);
    expect(f.some((x) => x.message.includes('literal words appear nowhere'))).toBe(true);
  });

  it('passes: a series-level range is legitimate at NOT YET VERIFIED', () => {
    const snap = makeSnapshot({
      sources: [
        source({
          verification: 'NOT YET VERIFIED',
          archivalReference:
            'SHD, sous-série GR 3H, 3H 314–752, c. 3,000 articles. NOT YET VERIFIED.',
        }),
      ],
    });
    expect(runRule(R02, snap)).toHaveLength(0);
  });

  it('edge: item-level precision on a VERIFIED record is fine', () => {
    const snap = makeSnapshot({
      sources: [
        source({ verification: 'Cited by named scholar', archivalReference: 'BOA HR.SYS. 2392/2' }),
      ],
    });
    expect(runRule(R02, snap)).toHaveLength(0);
  });
});

describe('R03 — bare figure where a range exists', () => {
  it('fails on a bare contested figure in context', () => {
    const snap = makeSnapshot({
      events: [
        event({
          slug: 'annual',
          body: 'At Annual in 1921 the Spanish lost 13363 men.',
        }),
      ],
    });
    const f = runRule(R03, snap);
    expect(f.some((x) => x.rule === 'R03')).toBe(true);
  });

  it('passes when the range is stated', () => {
    const snap = makeSnapshot({
      events: [
        event({
          slug: 'annual',
          body: 'Spanish dead at Annual in 1921 are given variously as 7,875 to 13,363.',
        }),
      ],
    });
    expect(runRule(R03, snap)).toHaveLength(0);
  });

  it('passes when the figure is attributed', () => {
    const snap = makeSnapshot({
      events: [
        event({
          slug: 'annual',
          body: 'Per the Expediente Picasso, Annual 1921 cost 13,363 dead.',
        }),
      ],
    });
    expect(runRule(R03, snap)).toHaveLength(0);
  });

  it('edge: the same number in an unrelated subject is not this quantity', () => {
    // 2,000 belongs to several contested quantities. Without topical context
    // the rule cross-contaminates and becomes noise.
    const snap = makeSnapshot({
      events: [event({ slug: 'other', body: 'A crowd of 2,000 gathered at the mosque.' })],
    });
    expect(runRule(R03, snap)).toHaveLength(0);
  });
});

describe('R08 — assessment fencing', () => {
  it('fails on opinion language in an evidence field', () => {
    const snap = makeSnapshot({ people: [person({ oneLine: 'I think he was the decisive figure.' })] });
    const f = runRule(R08, snap);
    expect(f.some((x) => x.field === 'oneLine' && x.severity === 'error')).toBe(true);
  });

  it('warns when an assessment names no falsifier', () => {
    const snap = makeSnapshot({
      people: [person({ assessment: 'He was the most consequential figure of the period.' })],
    });
    const f = runRule(R08, snap);
    expect(f.some((x) => x.message.includes('no falsifier') && x.severity === 'warn')).toBe(true);
  });

  it('passes when the assessment names its falsifier', () => {
    const snap = makeSnapshot({
      people: [
        person({
          assessment:
            'He was the decisive figure. I would revise this if the Khénifra BAI bulletins showed the submissions were negotiated without him.',
        }),
      ],
    });
    expect(runRule(R08, snap)).toHaveLength(0);
  });

  it('edge: "I think" inside the assessment field is allowed — that is its purpose', () => {
    const snap = makeSnapshot({
      people: [
        person({
          assessment: 'I think the fratricide account is a story. I would change my mind unless...',
        }),
      ],
    });
    expect(runRule(R08, snap).filter((x) => x.severity === 'error')).toHaveLength(0);
  });
});

describe('R05 — name conflation', () => {
  it('fails when a known-distinct pair is merged into one record', () => {
    const snap = makeSnapshot({
      people: [person({ slug: 'ameziane', name: 'Mohamed Ameziane', aliases: ['Mohammed Sellam Ameziane'] })],
    });
    const f = runRule(R05, snap);
    expect(f.some((x) => x.severity === 'error')).toBe(true);
  });

  it('passes when the two Amezianes are separate records', () => {
    const snap = makeSnapshot({
      people: [
        person({ slug: 'mohamed-ameziane', name: 'Mohamed Ameziane' }),
        person({ slug: 'mohammed-sellam-ameziane', name: 'Mohammed Sellam Ameziane' }),
      ],
    });
    expect(runRule(R05, snap).filter((x) => x.severity === 'error')).toHaveLength(0);
  });

  it('edge: Moha ou Said and Mouha ou Hammou Zayani stay apart', () => {
    const snap = makeSnapshot({
      people: [
        person({ slug: 'moha-ou-said', name: 'Moha ou Said' }),
        person({ slug: 'mouha-ou-hammou-zayani', name: 'Mouha ou Hammou Zayani' }),
      ],
    });
    expect(runRule(R05, snap).filter((x) => x.severity === 'error')).toHaveLength(0);
  });
});

describe('R04 — unmarked colonial vocabulary', () => {
  it('fails on an unmarked term', () => {
    const snap = makeSnapshot({ people: [person({ oneLine: 'A dissident chief of the Atlas.' })] });
    expect(runRule(R04, snap).length).toBeGreaterThan(0);
  });

  it('passes when the term is quoted', () => {
    const snap = makeSnapshot({
      people: [person({ oneLine: 'French reporting filed him as "dissident".' })],
    });
    expect(runRule(R04, snap)).toHaveLength(0);
  });

  it('edge: attribution counts as marking', () => {
    const snap = makeSnapshot({
      people: [
        person({ oneLine: 'Active after France declared the pacification of Morocco complete.' }),
      ],
    });
    expect(runRule(R04, snap)).toHaveLength(0);
  });
});

describe('R07 — claim-status coherence', () => {
  it('warns when contested points have no marker in the body', () => {
    const snap = makeSnapshot({
      people: [person({ contestedPoints: 'His birth year.', body: 'He was born in the Atlas.' })],
    });
    expect(runRule(R07, snap).length).toBe(1);
  });

  it('passes when the body carries a Disputed marker', () => {
    const snap = makeSnapshot({
      people: [
        person({ contestedPoints: 'His birth year.', body: '**Disputed:** the year of his birth.' }),
      ],
    });
    expect(runRule(R07, snap)).toHaveLength(0);
  });

  it('edge: no body means nothing to disagree with', () => {
    const snap = makeSnapshot({ people: [person({ contestedPoints: 'His birth year.', body: null })] });
    expect(runRule(R07, snap)).toHaveLength(0);
  });
});

describe('R09 — relation integrity', () => {
  it('warns on a dangling relation', () => {
    const snap = makeSnapshot({
      people: [person({ slug: 'a' })],
      relationships: [relationship({ from: 'a', to: 'missing' })],
    });
    expect(runRule(R09, snap).some((f) => f.field === 'to')).toBe(true);
  });

  it('edge: an allowlisted self-loop is not a finding', () => {
    const snap = makeSnapshot({
      people: [person({ slug: 'franco' })],
      relationships: [
        relationship({
          slug: 'franco-launched-the-1936-coup-from-morocco',
          from: 'franco',
          to: 'franco',
        }),
      ],
    });
    expect(runRule(R09, snap).some((f) => f.message.includes('Self-loop'))).toBe(false);
  });
});

describe('R10 — staleness', () => {
  it('reports a record past its limit', () => {
    const old = new Date(Date.now() - 200 * 86_400_000).toISOString();
    const snap = makeSnapshot({
      people: [person({ dossierStatus: 'Full dossier', lastReviewed: old })],
    });
    expect(runRule(R10, snap).length).toBe(1);
  });

  it('passes on a recently reviewed record', () => {
    const recent = new Date(Date.now() - 5 * 86_400_000).toISOString();
    const snap = makeSnapshot({
      people: [person({ dossierStatus: 'Full dossier', lastReviewed: recent })],
    });
    expect(runRule(R10, snap)).toHaveLength(0);
  });
});

describe('R11 — tier / verification coherence', () => {
  it('surfaces a PRIMARY_ARCHIVAL source that is NOT YET VERIFIED', () => {
    const snap = makeSnapshot({
      sources: [source({ tier: 'PRIMARY_ARCHIVAL', verification: 'NOT YET VERIFIED' })],
    });
    expect(runRule(R11, snap).some((f) => f.message.includes('PRIMARY_ARCHIVAL'))).toBe(true);
  });

  it('distinguishes "no verification recorded" from NOT YET VERIFIED', () => {
    const snap = makeSnapshot({ sources: [source({ verification: null })] });
    const f = runRule(R11, snap);
    expect(f.some((x) => x.message.includes('No verification status recorded'))).toBe(true);
  });
});

describe('R12 — evidence monotonicity (diff)', () => {
  it('fails when verification strengthens with no new source', () => {
    const before = makeSnapshot({ sources: [source({ verification: 'NOT YET VERIFIED' })] });
    const after = makeSnapshot({ sources: [source({ verification: 'Catalogue verified' })] });
    const f = runRule(R12, after, before);
    expect(f.some((x) => x.severity === 'error' && x.message.includes('no new source'))).toBe(true);
  });

  it('passes when a new source accompanies the strengthening', () => {
    const before = makeSnapshot({ sources: [source({ verification: 'NOT YET VERIFIED' })] });
    const after = makeSnapshot({
      sources: [
        source({ verification: 'Catalogue verified' }),
        source({ slug: 'new-source', title: 'A newly added source' }),
      ],
    });
    const f = runRule(R12, after, before);
    expect(f.filter((x) => x.severity === 'error')).toHaveLength(0);
  });

  it('edge: weakening is never a finding', () => {
    const before = makeSnapshot({ sources: [source({ verification: 'Catalogue verified' })] });
    const after = makeSnapshot({ sources: [source({ verification: 'NOT YET VERIFIED' })] });
    expect(runRule(R12, after, before)).toHaveLength(0);
  });

  it('edge: Contested is not a rung, so moving out of it is not a strengthening', () => {
    const before = makeSnapshot({ people: [person({ evidenceBase: 'Contested' })] });
    const after = makeSnapshot({ people: [person({ evidenceBase: 'Moderate - academic' })] });
    expect(runRule(R12, after, before)).toHaveLength(0);
  });
});

describe('R13 — range collapse (diff)', () => {
  it('fails when a range becomes a single number', () => {
    const before = makeSnapshot({
      events: [event({ mainDispute: 'Total Spanish dead (7,875 to 13,363).' })],
    });
    const after = makeSnapshot({ events: [event({ mainDispute: 'Total Spanish dead: 13,363.' })] });
    const f = runRule(R13, after, before);
    expect(f.some((x) => x.rule === 'R13' && x.severity === 'error')).toBe(true);
  });

  it('passes when the range survives', () => {
    const before = makeSnapshot({
      events: [event({ mainDispute: 'Total Spanish dead (7,875 to 13,363).' })],
    });
    const after = makeSnapshot({
      events: [event({ mainDispute: 'Total Spanish dead, still disputed (7,875 to 13,363).' })],
    });
    expect(runRule(R13, after, before)).toHaveLength(0);
  });

  it('edge: removing the passage entirely is not a collapse', () => {
    const before = makeSnapshot({
      events: [event({ mainDispute: 'Total Spanish dead (7,875 to 13,363).' })],
    });
    const after = makeSnapshot({ events: [event({ mainDispute: 'Under revision.' })] });
    expect(runRule(R13, after, before)).toHaveLength(0);
  });
});
