/**
 * The alias matcher, against the corpus's real alias strings.
 *
 * Both directions are the test: it must find the true positives *and* keep the
 * known-distinct pairs apart. A matcher that scores everything highly would
 * pass the first half and destroy the corpus.
 */

import { describe, expect, it } from 'vitest';
import { foldKey, foldArabic, hasArabic, splitAliases } from '../src/alias/fold.js';
import { resolveAlias, scoreNames } from '../src/alias/match.js';
import { loadKnownDistinct } from '../src/rules/corpus-rules.js';
import { TEST_CONFIG } from './helpers.js';

/** Every alias string the corpus currently carries for the hard cases. */
const ZAYANI_ALIASES = [
  'Mouha ou Hammou Zayani',
  'Muḥa u Ḥemmu Aẓayyi',
  'Moha ou Hammou',
  'Mouha ou Hammou Zaïani',
  'Moha ou Hammou Azayi',
  'le caïd Hammou',
  'Hammou des Zaïanes',
  'le chef zaïan',
  'Mohamed Hammou',
  'el caíd Hammu',
  'los zayanes',
  'محا أو حمو الزياني',
];

const AYNAYN_ALIASES = [
  "Ma al-'Aynayn",
  'Māʾ al-ʿAynayn',
  'Ma el Ainïn',
  'Ma El Aininn',
  'Cheikh Ma el Ainín',
  'Ma-el-Ainin',
  'le marabout Ma el Aïnin',
  'le cheikh du Sahara',
  'ماء العينين',
];

describe('folding', () => {
  it('strips transliteration marks and diacritics', () => {
    expect(foldKey('Māʾ al-ʿAynayn')).toBe(foldKey('Ma al-Aynayn'));
    expect(foldKey('Muḥa u Ḥemmu Aẓayyi')).toBe(foldKey('Muha u Hemmu Azayyi'));
  });

  it('folds ou↔u', () => {
    expect(foldKey('Mouha')).toBe(foldKey('Muha'));
    expect(foldKey('Hammou')).toBe(foldKey('Hammu'));
  });

  it('folds ai↔aï↔ay', () => {
    expect(foldKey('Zaïani')).toBe(foldKey('Zayani'));
    expect(foldKey('Zaïanes')).toBe(foldKey('Zayanes'));
    // Ainïn and Aynayn are NOT expected to fold identically — they differ by
    // a syllable, not by orthography. What matters is that the matcher still
    // brings them together, which the resolution tests assert.
    expect(foldKey('Ainïn')).not.toBe(foldKey('Aynayn'));
  });

  it('folds Spanish j to kh — Jenífra is Khénifra', () => {
    expect(foldKey('Jenífra')).toBe(foldKey('Khénifra'));
  });

  it('strips particles for the key but they remain in the source string', () => {
    const withParticles = 'Sidi Moulay ben Hammou';
    expect(foldKey(withParticles)).not.toContain('sidi');
    expect(foldKey(withParticles)).not.toContain('ben');
    expect(withParticles).toContain('Sidi'); // display is untouched
  });

  it('normalises Arabic script', () => {
    expect(hasArabic('محا أو حمو الزياني')).toBe(true);
    expect(foldArabic('أحمد')).toBe(foldArabic('احمد'));
    expect(foldArabic('ة')).toBe('ه');
  });

  it('splits the corpus alias field into individual variants', () => {
    const field =
      "Tamazight: Muḥa u Ḥemmu Aẓayyi · Moha ou Hammou · Fr. archives: 'Moha ou Hammou', " +
      "'le caïd Hammou', 'Hammou des Zaïanes' · Sp.: Mohamed Hammou, 'el caíd Hammu', 'los zayanes'";
    const parts = splitAliases(field);
    expect(parts).toContain('Hammou des Zaïanes');
    expect(parts).toContain('los zayanes');
    // An unquoted member leading a quoted list must survive.
    expect(parts).toContain('Mohamed Hammou');
  });
});

describe('true positives — one man, many spellings', () => {
  const index = [{ slug: 'mouha-ou-hammou-zayani', display: 'Mouha ou Hammou Zayani', names: ZAYANI_ALIASES }];

  for (const query of ['Zaïanes', 'Zayani', 'Zaiani', 'Aẓayyi', 'el caíd Hammu', 'Hammou des Zaïanes']) {
    it(`resolves "${query}"`, () => {
      const hits = resolveAlias(query, index, TEST_CONFIG.aliasThreshold);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]?.slug).toBe('mouha-ou-hammou-zayani');
    });
  }

  it('resolves the Arabic form', () => {
    const hits = resolveAlias('محا أو حمو', index, TEST_CONFIG.aliasThreshold);
    expect(hits[0]?.slug).toBe('mouha-ou-hammou-zayani');
  });

  it('resolves Ma al-Aynayn across transliterations', () => {
    const idx = [{ slug: 'ma-al-aynayn', display: "Ma al-'Aynayn", names: AYNAYN_ALIASES }];
    for (const q of ['Ma al-Aynayn', 'Māʾ al-ʿAynayn', 'Ma el Ainïn']) {
      expect(resolveAlias(q, idx, TEST_CONFIG.aliasThreshold)[0]?.slug).toBe('ma-al-aynayn');
    }
  });
});

describe('negatives — known-distinct pairs must stay apart', () => {
  const known = loadKnownDistinct(TEST_CONFIG.paths.data);

  for (const pair of known.pairs) {
    it(`"${pair.a}" is not "${pair.b}"`, () => {
      const { score } = scoreNames(pair.a, pair.b);
      // They may be similar — that is why the corpus warns about them — but
      // they must not reach the threshold at which the tool proposes a merge.
      expect(score).toBeLessThan(TEST_CONFIG.aliasThreshold);
    });
  }

  it('a query matching both Amezianes returns two people, not one', () => {
    const index = [
      { slug: 'mohamed-ameziane', display: 'Mohamed Ameziane', names: ['Mohamed Ameziane', 'Mohand Ameziane'] },
      {
        slug: 'mohammed-sellam-ameziane',
        display: 'Mohammed Sellam Ameziane',
        names: ['Mohammed Sellam Ameziane', 'Sellam Amezian'],
      },
    ];
    const hits = resolveAlias('Ameziane', index, TEST_CONFIG.aliasThreshold);
    expect(hits).toHaveLength(2);
    expect(new Set(hits.map((h) => h.slug)).size).toBe(2);
  });

  it('cross-script pairs are never scored — transliteration is not a string operation', () => {
    const { score, comparable } = scoreNames('محا أو حمو الزياني', 'Mouha ou Hammou Zayani');
    expect(comparable).toBe(false);
    expect(score).toBe(0);
  });

  it('a name that merely extends another is penalised, not merged', () => {
    const { extensionPenalty } = scoreNames('Mohamed Ameziane', 'Mohammed Sellam Ameziane');
    expect(extensionPenalty).toBe(true);
  });
});
