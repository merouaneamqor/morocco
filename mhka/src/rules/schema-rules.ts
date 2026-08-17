/**
 * R01 — Unknown select value · error
 * R06 — Date fields must stay verbatim · error
 *
 * The cheap rules that catch the worst. R01 is the one that stops a
 * `NOT YET VERIFIED` being silently dropped by a schema edit; R06 is the one
 * that stops a disputed birth year being quietly resolved.
 */

import type { Finding, Rule, RuleContext } from '../model/types.js';
import {
  ARCHIVE_VERIFICATION,
  CATEGORIES,
  COUNTRIES,
  DIGITISED,
  DOSSIER_STATUS,
  EVENT_TYPES,
  EVIDENCE_BASE,
  EVIDENCE_STRENGTH,
  GROUP_LANGUAGES,
  GROUP_TYPES,
  IMPACT,
  PHASES,
  PRIORITY,
  REGIONS,
  RELATION_VERBS,
  SOURCE_LANGUAGES,
  SOURCE_VERIFICATION,
  TIERS,
  ZONES,
} from '../model/vocab.js';

/** field → allowed values, per collection. `multi` fields hold arrays. */
const VOCAB: Record<
  string,
  { field: string; allowed: readonly string[]; multi?: boolean; nullable?: boolean }[]
> = {
  people: [
    { field: 'category', allowed: CATEGORIES, multi: true },
    { field: 'region', allowed: REGIONS, multi: true },
    { field: 'phase', allowed: PHASES, multi: true },
    { field: 'dossierStatus', allowed: DOSSIER_STATUS },
    { field: 'evidenceBase', allowed: EVIDENCE_BASE },
    { field: 'impact', allowed: IMPACT, nullable: true },
  ],
  events: [
    { field: 'phase', allowed: PHASES },
    { field: 'type', allowed: EVENT_TYPES, multi: true },
    { field: 'dossierStatus', allowed: DOSSIER_STATUS },
  ],
  sources: [
    { field: 'tier', allowed: TIERS },
    { field: 'language', allowed: SOURCE_LANGUAGES, multi: true },
    // Nullable on purpose: sources added in the corpus's later sessions carry
    // no Verification at all. That is a recorded gap, not an invalid value —
    // R11 surfaces it rather than R01 failing the run.
    { field: 'verification', allowed: SOURCE_VERIFICATION, nullable: true },
  ],
  archives: [
    { field: 'country', allowed: COUNTRIES },
    { field: 'digitised', allowed: DIGITISED },
    { field: 'verification', allowed: ARCHIVE_VERIFICATION, nullable: true },
    { field: 'priority', allowed: PRIORITY },
  ],
  relationships: [
    { field: 'relation', allowed: RELATION_VERBS },
    { field: 'evidenceStrength', allowed: EVIDENCE_STRENGTH },
  ],
  places: [{ field: 'zone', allowed: ZONES, nullable: true }],
  groups: [
    { field: 'type', allowed: GROUP_TYPES },
    { field: 'language', allowed: GROUP_LANGUAGES, multi: true },
  ],
};

export const R01: Rule = {
  id: 'R01',
  title: 'Unknown select value',
  defaultSeverity: 'error',
  run({ snapshot, severityFor }: RuleContext): Finding[] {
    const findings: Finding[] = [];
    const severity = severityFor('R01', 'error');

    for (const [collection, checks] of Object.entries(VOCAB)) {
      const rows = (snapshot as any)[collection] as Record<string, unknown>[] | undefined;
      if (!rows) continue;

      for (const row of rows) {
        for (const check of checks) {
          const value = row[check.field];

          if (value == null || (Array.isArray(value) && value.length === 0)) {
            if (!check.nullable && !check.multi) {
              findings.push({
                rule: 'R01',
                severity,
                collection,
                slug: String(row.slug),
                field: check.field,
                message: `${check.field} is empty`,
                detail: `Expected one of: ${check.allowed.join(' · ')}`,
              });
            }
            continue;
          }

          const values = check.multi ? (value as string[]) : [value as string];
          for (const v of values) {
            if (!check.allowed.includes(v)) {
              findings.push({
                rule: 'R01',
                severity,
                collection,
                slug: String(row.slug),
                field: check.field,
                message: `${check.field} = "${v}" is not a recognised value`,
                detail:
                  `Allowed: ${check.allowed.join(' · ')}\n` +
                  `A silently dropped select value is the exact failure this corpus cannot survive.`,
              });
            }
          }
        }
      }
    }

    return findings;
  },
};

/**
 * Values that indicate a verbatim disputed date has been normalised away.
 * A bare ISO date in a Born/Died field is the signature.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T|$)/;

export const R06: Rule = {
  id: 'R06',
  title: 'Date fields must stay verbatim',
  defaultSeverity: 'error',
  run({ snapshot, severityFor }: RuleContext): Finding[] {
    const findings: Finding[] = [];
    const severity = severityFor('R06', 'error');

    // 1. The schema itself. If Notion now reports Born/Died as `date`, the
    //    property type has been changed and every disputed value is already
    //    lost or about to be.
    const peopleTypes = snapshot.propertyTypes?.people ?? {};
    for (const field of ['Born', 'Died'] as const) {
      const declared = peopleTypes[field];
      if (declared && declared !== 'rich_text') {
        findings.push({
          rule: 'R06',
          severity,
          collection: 'people',
          field,
          message: `People.${field} is declared as "${declared}", not rich_text`,
          detail:
            `Born and Died are text on purpose: many are disputed, e.g.\n` +
            `  "1836 (conventional). Some reference works give 1857"\n` +
            `A date property cannot hold that. Changing the type resolves the dispute silently.`,
        });
      }
    }

    // 2. The values. Even with the schema intact, a value may have been
    //    rewritten into an ISO date by an agent "tidying up".
    for (const p of snapshot.people) {
      for (const field of ['born', 'died'] as const) {
        const v = p[field];
        if (!v) continue;

        if (typeof v !== 'string') {
          findings.push({
            rule: 'R06',
            severity,
            collection: 'people',
            slug: p.slug,
            field,
            message: `${field} is not a string`,
            detail: `Got ${typeof v}. Any code parsing these into Date objects is a bug.`,
          });
          continue;
        }

        if (ISO_DATE.test(v.trim())) {
          findings.push({
            rule: 'R06',
            severity,
            collection: 'people',
            slug: p.slug,
            field,
            message: `${field} = "${v}" looks like a normalised date`,
            detail:
              `A verbatim value carries its own uncertainty. An ISO date cannot.\n` +
              `A disputed birth year silently resolved is a lie the corpus was built to prevent.`,
          });
        }
      }
    }

    return findings;
  },
};
