import { describe, expect, it } from 'vitest';

import { resolveEmbedDecision } from './embed-policy';
import { type EmbedPermission } from './font-ops';

/**
 * Phase 4 `_shared/fonts/embed-policy.ts` — maps a font's OS/2 `fsType`
 * permission bucket to a concrete Broadset embed decision every
 * format exporter (SVG `@font-face`, PDF font subtable, PPTX font
 * table) and the Phase 5 preflight panel can read.
 *
 * Policy per the Phase 4 plan bullet: refuse `restricted`, warn on
 * `preview-print`, embed freely otherwise. `null` (unknown OS/2 table)
 * defaults to installable per the OpenType spec — but surfaces a
 * warning so preflight can flag it.
 */

describe('resolveEmbedDecision', () => {
  /**
   * @description `installable` fonts may be freely embedded with no
   * warning. This is the most permissive bucket (fsType bit 0 clear).
   */
  it('embeds installable fonts with no warning', () => {
    const decision = resolveEmbedDecision('installable');

    expect(decision.action).toBe('embed');
    expect(decision.permission).toBe('installable');
    expect(decision.warning).toBeUndefined();
    expect(decision.reason).toBeUndefined();
  });

  /**
   * @description `editable` fonts (fsType bit 3) behave like
   * installable from Broadset's perspective — the recipient may edit
   * embedded documents, which is the current export use case.
   */
  it('embeds editable fonts with no warning', () => {
    const decision = resolveEmbedDecision('editable');

    expect(decision.action).toBe('embed');
    expect(decision.permission).toBe('editable');
    expect(decision.warning).toBeUndefined();
  });

  /**
   * @description `preview-print` fonts (fsType bit 2) may be embedded
   * but editing and copying are licensed-restricted. Every exporter
   * that embeds such a font surfaces the warning to preflight.
   */
  it('embeds preview-print fonts with a warning', () => {
    const decision = resolveEmbedDecision('preview-print');

    expect(decision.action).toBe('embed');
    expect(decision.permission).toBe('preview-print');
    expect(typeof decision.warning).toBe('string');
    expect(decision.warning?.length ?? 0).toBeGreaterThan(0);
  });

  /**
   * @description `restricted` fonts (fsType bit 1) refuse embedding
   * per the font vendor's license. Exporters MUST skip the embed and
   * fall back to the reference path (unicode escape + best-effort
   * family match at the opening tool).
   */
  it('refuses restricted fonts with a reason', () => {
    const decision = resolveEmbedDecision('restricted');

    expect(decision.action).toBe('refuse');
    expect(decision.permission).toBe('restricted');
    expect(typeof decision.reason).toBe('string');
    expect(decision.reason?.length ?? 0).toBeGreaterThan(0);
    expect(decision.warning).toBeUndefined();
  });

  /**
   * @description `null` permission (the OS/2 table is missing or the
   * font bytes are unparseable) defaults to installable per the
   * OpenType spec. Surfaces a warning so preflight can flag the
   * missing metadata — silent-drop would hide a real issue.
   */
  it('defaults null permission to installable with a warning', () => {
    const decision = resolveEmbedDecision(null);

    expect(decision.action).toBe('embed');
    expect(decision.permission).toBe('installable');
    expect(typeof decision.warning).toBe('string');
  });

  /**
   * @description The decision object is a pure function of the input
   * — no hidden state, safe to call from any exporter or preflight
   * run in any order.
   */
  it('returns the same decision for the same permission', () => {
    const a = resolveEmbedDecision('preview-print');
    const b = resolveEmbedDecision('preview-print');

    expect(a).toEqual(b);
  });

  /**
   * @description Exhaustive permission coverage — every
   * `EmbedPermission` variant plus `null` maps to a decision whose
   * `action` / `warning` / `reason` fields stay internally consistent
   * (refuse-carries-reason, embed-may-carry-warning). Guards against
   * a new `EmbedPermission` variant landing without a matching policy
   * branch or regressing the invariant between `action` and the
   * companion message field.
   */
  it.each<EmbedPermission | null>(['installable', 'editable', 'preview-print', 'restricted', null])(
    'maps %s to an internally consistent decision',
    (permission) => {
      const decision = resolveEmbedDecision(permission);

      if (decision.action === 'refuse') {
        expect(typeof decision.reason).toBe('string');
        expect(decision.warning).toBeUndefined();
      } else {
        expect(decision.reason).toBeUndefined();
      }
    },
  );
});
