/**
 * remark plugin: turn the corpus's inline conventions into semantic markup.
 *
 * The brief's requirement is that the distinction between a verified and an
 * unverified archival reference "must survive into the DOM". So this emits
 * elements carrying data attributes and semantic class names — not styled
 * spans — and the accessible text of an unverified reference always contains
 * the literal words NOT YET VERIFIED.
 *
 * It rewrites four things:
 *
 *   1. `**Established:**` (and the other lead-ins) opening a paragraph
 *      → a gutter claim marker + data-status on the paragraph.
 *   2. Inline code holding a verification or tier token
 *      → a chip carrying data-verification / data-tier.
 *   3. Inline code holding `ARCHIVAL REFERENCE NOT YET VERIFIED`
 *      → the unverified reference treatment, with the literal words kept.
 *   4. A blockquote opening `**Terminology warning.**` / `**Evidence note.**`
 *      → the corresponding callout treatment.
 *
 * Everything it emits is static HTML. No hydration, no client JS.
 */

import { visit } from 'unist-util-visit';
import {
  CLAIM_LEAD_IN_RE,
  resolveLeadIn,
  NOT_YET_VERIFIED,
  VERIFICATION_TOKENS,
  TIER_TOKENS,
  CALLOUT_OPENERS,
  STATUS_KEYS,
  STATUS_ICONS,
  WITHHELD_ICON,
  looksWithheld,
} from './markers.mjs';

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Flatten an mdast subtree to its text content. */
function toText(node) {
  if (!node) return '';
  if (node.value) return node.value;
  if (!node.children) return '';
  return node.children.map(toText).join('');
}

export function remarkClaimMarkers() {
  return (tree, file) => {
    const claims = [];
    let counter = 0;

    // ------------------------------------------------ 1. claim lead-ins
    visit(tree, 'paragraph', (node) => {
      const first = node.children?.[0];
      if (!first || first.type !== 'strong') return;

      const leadText = toText(first).trim();
      if (!CLAIM_LEAD_IN_RE.test(leadText)) return;

      const resolved = resolveLeadIn(leadText);
      if (!resolved) return;
      const { canonical, status } = resolved;

      // The claim body is everything after the lead-in.
      const bodyText = node.children.slice(1).map(toText).join('').trim();
      const withheld = resolved.withheld || looksWithheld(bodyText);

      const index = counter++;
      const anchor = `claim-${index}`;

      claims.push({
        index,
        anchor,
        leadIn: canonical,
        status,
        withheld,
        text: bodyText,
      });

      // Replace the bold lead-in with a gutter marker. The paragraph carries
      // the status as a data attribute so the Evidence Index, the dossier
      // footer counts and CSS all read the same source of truth.
      node.data = node.data || {};
      node.data.hProperties = {
        ...(node.data.hProperties || {}),
        class: 'claim-block',
        id: anchor,
        'data-status': status ?? canonical,
        ...(withheld ? { 'data-withheld': 'true' } : {}),
      };

      const key = status ? STATUS_KEYS[status] : 'stated';
      const icon = status ? STATUS_ICONS[status] : '▸';
      const label = status ?? canonical;

      node.children[0] = {
        type: 'html',
        value:
          `<span class="claim claim--${key} claim--gutter" data-status="${esc(label)}"` +
          `${withheld ? ' data-withheld="true"' : ''}>` +
          `<span class="claim__icon" aria-hidden="true">${icon}</span>` +
          `<span class="claim__label">${esc(label)}</span>` +
          (withheld
            ? `<span class="claim__withheld"><span class="claim__icon" aria-hidden="true">${WITHHELD_ICON}</span>` +
              `<span class="claim__label">Withheld</span></span>`
            : '') +
          `</span>`,
      };
    });

    // -------------------------------- 2 & 3. inline code → semantic chips
    visit(tree, 'inlineCode', (node, index, parent) => {
      const value = node.value.trim();

      // The unverified-reference token. The literal words are preserved in the
      // accessible text — CI fails the build if they are ever missing.
      if (value === NOT_YET_VERIFIED || value === 'NOT YET VERIFIED') {
        parent.children[index] = {
          type: 'html',
          value:
            `<span class="ref-token ref-token--unverified" data-verification="NOT YET VERIFIED">` +
            `<span class="ref-token__icon" aria-hidden="true">⊘</span>` +
            `<span class="ref-token__text">${esc(value)}</span>` +
            `</span>`,
        };
        return;
      }

      if (VERIFICATION_TOKENS.includes(value)) {
        parent.children[index] = {
          type: 'html',
          value:
            `<span class="ref-token" data-verification="${esc(value)}">` +
            `<span class="ref-token__text">${esc(value)}</span>` +
            `</span>`,
        };
        return;
      }

      if (TIER_TOKENS.includes(value)) {
        const step = TIER_TOKENS.indexOf(value) + 1;
        parent.children[index] = {
          type: 'html',
          value:
            `<span class="tier-token" data-tier="${esc(value)}" data-step="${step}">` +
            `<span class="tier-token__swatch" aria-hidden="true" style="background:var(--seq-${
              9 - step
            })"></span>` +
            `<span class="tier-token__text">${esc(value)}</span>` +
            `<span class="visually-hidden"> — source tier ${step} of ${TIER_TOKENS.length}</span>` +
            `</span>`,
        };
      }
    });

    // ---------------------------------------------- 4. blockquote callouts
    visit(tree, 'blockquote', (node) => {
      const firstPara = node.children?.[0];
      if (!firstPara || firstPara.type !== 'paragraph') return;
      const strong = firstPara.children?.[0];
      if (!strong || strong.type !== 'strong') return;

      const opener = toText(strong).trim();
      const kind = CALLOUT_OPENERS[opener];
      if (!kind) return;

      node.data = node.data || {};
      node.data.hName = 'aside';
      node.data.hProperties = {
        class: `enote enote--${kind}`,
        role: 'note',
        'aria-label': opener.replace(/[.:]$/, ''),
      };

      // Promote the opener into a labelled head, matching <EvidenceNote>.
      firstPara.children[0] = {
        type: 'html',
        value:
          `<span class="enote__head"><span class="enote__icon" aria-hidden="true">` +
          `${kind === 'evidence' ? '▤' : '⚠'}</span>${esc(opener.replace(/[.:]$/, ''))}</span>`,
      };
    });

    // Expose for any consumer that wants it during the same build pass.
    file.data ??= {};
    file.data.claims = claims;
  };
}
