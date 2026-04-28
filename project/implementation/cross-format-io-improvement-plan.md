# Cross-Format I/O Improvement Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the highest-leverage gaps surfaced by the 2026-04-28 cross-format analysis of PDF, PSD, PPTX, and SVG import/export — UI surfacing of existing backend capability, security closures, shared utility extraction, and per-format feature parity — so all four formats reach a common, defensible production-grade bar.

**Architecture:** Three execution waves. **Wave 1 (Phases 1–3)** is detailed bite-sized TDD work that lights up already-built backend capability through wired UI, closes open security findings, and consolidates duplicated text-shaping code into `_shared/`. **Wave 2 (Phase 4)** is a roadmap of per-format feature-parity efforts (PSD CMYK, PDF real shading, PSD/PDF effects parity); each sub-phase needs its own detailed plan when picked up. **Wave 3 (Phase 5)** is operational hardening (telemetry, real-licensed-fixture mounts, accessibility audits) — also roadmap-form.

**Tech Stack:** TypeScript strict mode, Vitest, Playwright CT, HeroUI v3, Zustand, pdf-lib, ag-psd, fast-xml-parser, css-tree, fontkit, `_shared/` infrastructure (color, fonts, fingerprint, reconcile, xmp, text-layout, sanitize, asset-dedup).

**Source of analysis:** Cross-format report 2026-04-28 (in conversation; covers all four format implementations + UI integration map).

**Sub-plan policy:** Phases 1–3 are executable as written. Each Phase 4/5 sub-bullet expects its own bite-sized plan (drafted via `superpowers:writing-plans`) before execution. Do **not** execute Phase 4/5 from this document directly — use it as the brief.

---

## Spec & gap-file index

This plan touches five gap-tracking surfaces. Update each one when the relevant work lands per Phase 6:

| File | Sections impacted |
|---|---|
| [packages/formats/src/svg/KNOWN-GAPS.md](../../packages/formats/src/svg/KNOWN-GAPS.md) | H2, M2 (closed in Phase 2) |
| [project/implementation/pptx-known-gaps.md](pptx-known-gaps.md) | A1 (Phase 1.3), A4, B1, B3, B4 (Phase 5) |
| [project/spec/formats/psd.md](../spec/formats/psd.md) §Spec Gaps | CMYK/Lab/Grayscale, bevel/satin/pattern overlay, bitmap mask, text rotation, 16/32-bpc (Phase 4) |
| [project/spec/formats/pdf.md](../spec/formats/pdf.md) §Spec Gaps | P6.3 real shading patterns, real ICC CMYK, font subsetting, per-element OCG (Phase 4) |
| [project/implementation/plan-progress.md](plan-progress.md) | Register this plan + each phase as it closes |

---

# Phase 1 — Wire existing UI capability (highest leverage)

The biggest immediate win: **the modals already exist** ([format-export-options.tsx](../../packages/ui/src/modals/format-export-options.tsx), [format-reconciliation.tsx](../../packages/ui/src/modals/format-reconciliation.tsx), [format-import-warnings.tsx](../../packages/ui/src/modals/format-import-warnings.tsx)) and are exported from [`packages/ui/src/modals/index.ts:26-38`](../../packages/ui/src/modals/index.ts) but two of them are unwired. This phase costs ~1 day and unlocks the substantial backend work already shipped (preflight reports, PDF/A flavors, font embedding, reconciliation).

## Task 1.1: Wire `FormatExportOptionsModal` into export flow

**Files:**
- Modify: [packages/ui/src/modals/core-modals.tsx](../../packages/ui/src/modals/core-modals.tsx) — `ExportModal` (~line 264-527)
- Modify: [packages/demo/src/formatBridge.ts](../../packages/demo/src/formatBridge.ts) — extend `ExportContext` with `pdfOptions`, `psdOptions`, `pptxOptions`
- Modify: [packages/demo/src/demo-app/use-demo-file-handlers.ts](../../packages/demo/src/demo-app/use-demo-file-handlers.ts) — pass options through to bridge
- Test: [packages/ui/test-ct/format-export-options-flow.spec.tsx](../../packages/ui/test-ct/format-export-options-flow.spec.tsx) (new)

- [ ] **Step 1: Write failing CT test for SVG options round-trip**

```tsx
// packages/ui/test-ct/format-export-options-flow.spec.tsx
import { test, expect } from '@playwright/experimental-ct-react';
import { ExportModal } from '../src/modals/core-modals';

test('SVG export surfaces font-embed selector and forwards choice', async ({ mount }) => {
  let captured: { exporter: string; data: Record<string, unknown> } | null = null;
  const component = await mount(
    <ExportModal
      isOpen={true}
      enabledExporters={['svg']}
      dynamicData={{}}
      animations={undefined}
      exportProgress={null}
      onExport={(exporter, data) => { captured = { exporter, data }; }}
      onClose={() => {}}
    />,
  );
  await component.getByRole('button', { name: 'SVG' }).click();
  await component.getByRole('button', { name: /options/i }).click();
  await component.getByLabel('Font embedding').click();
  await component.getByRole('option', { name: /flatten/i }).click();
  await component.getByRole('button', { name: /export$/i }).click();
  expect(captured?.exporter).toBe('svg');
  expect((captured?.data as { svgOptions?: { fontEmbedding?: string } }).svgOptions?.fontEmbedding).toBe('flatten');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix packages/ui run ct -- format-export-options-flow`
Expected: FAIL — "options button not found" or similar.

- [ ] **Step 3: Add per-format `supportedFields` registry to ExportModal**

In [core-modals.tsx](../../packages/ui/src/modals/core-modals.tsx) above `ExportModal`:

```tsx
import type { FormatExportOptionsValue } from './format-export-options';

const FORMAT_OPTION_SUPPORT: Record<string, ReadonlySet<keyof FormatExportOptionsValue>> = {
  svg: new Set(['fontEmbedding', 'includeMetadata', 'includeElementTagging']),
  psd: new Set(['colorSpace', 'bitDepth', 'embedIccProfile', 'linkSmartObjects', 'preserveVisibility']),
  pdf: new Set(['pdfaConformance', 'colorSpace', 'embedIccProfile']),
  pptx: new Set(['embedFonts', 'includeAnimations']),
};
```

(Note: `pdfaConformance`, `embedFonts`, `includeAnimations` need to be added to `FormatExportOptionsValue` in Step 4.)

- [ ] **Step 4: Extend `FormatExportOptionsValue` with PDF + PPTX fields**

Modify [format-export-options.tsx](../../packages/ui/src/modals/format-export-options.tsx):

```tsx
export type PdfAConformance = 'none' | '2b' | '2u' | '2a';

export interface FormatExportOptionsValue {
  readonly colorSpace: FormatExportColorSpace;
  readonly bitDepth: 8 | 16;
  readonly embedIccProfile: boolean;
  readonly linkSmartObjects: boolean;
  readonly preserveVisibility: boolean;
  readonly fontEmbedding: FormatExportFontEmbedding;
  readonly includeMetadata: boolean;
  readonly includeElementTagging: boolean;
  /** PDF-only: PDF/A conformance level. Default `'none'`. */
  readonly pdfaConformance: PdfAConformance;
  /** PPTX-only: subset & embed referenced font assets into `ppt/fonts/`. */
  readonly embedFonts: boolean;
  /** PPTX-only: emit `<p:timing>` for supported animation presets. */
  readonly includeAnimations: boolean;
}
```

Add the rendering branches inside the modal body — `Select` for `pdfaConformance` (when `supportedFields.has('pdfaConformance')`), `Switch` for `embedFonts`, `Switch` for `includeAnimations`. Mirror the existing field patterns.

- [ ] **Step 5: Add Options button + state to ExportModal**

In [core-modals.tsx](../../packages/ui/src/modals/core-modals.tsx) `ExportModal`:

```tsx
import { FormatExportOptionsModal, type FormatExportOptionsValue } from './format-export-options';

const DEFAULT_FORMAT_OPTIONS: FormatExportOptionsValue = {
  colorSpace: 'rgb', bitDepth: 8, embedIccProfile: true,
  linkSmartObjects: false, preserveVisibility: true,
  fontEmbedding: 'embed', includeMetadata: true, includeElementTagging: true,
  pdfaConformance: 'none', embedFonts: false, includeAnimations: true,
};

// inside component:
const [showFormatOptions, setShowFormatOptions] = useState(false);
const [formatOptions, setFormatOptions] = useState<FormatExportOptionsValue>(DEFAULT_FORMAT_OPTIONS);
const supportedFields = selectedExporter !== null ? FORMAT_OPTION_SUPPORT[selectedExporter] : undefined;
```

Render an HeroUI `Button` labelled "Options…" next to the format buttons when `supportedFields !== undefined && supportedFields.size > 0`. On press: `setShowFormatOptions(true)`. Render `<FormatExportOptionsModal>` conditionally with the selected format's `supportedFields`, current `formatOptions`, and an `onConfirm` that calls `setFormatOptions(next); setShowFormatOptions(false);`.

- [ ] **Step 6: Forward chosen options through `handleExport`**

Modify the existing `handleExport` (line ~324) to add format-specific keys:

```tsx
const handleExport = useCallback(() => {
  if (selectedExporter === null) return;
  const formatScopedOptions: Record<string, unknown> = {};
  if (selectedExporter === 'svg') {
    formatScopedOptions.svgOptions = {
      fontEmbedding: formatOptions.fontEmbedding,
      includeMetadata: formatOptions.includeMetadata,
      includeElementTagging: formatOptions.includeElementTagging,
    };
  } else if (selectedExporter === 'psd') {
    formatScopedOptions.psdOptions = {
      colorSpace: formatOptions.colorSpace, bitDepth: formatOptions.bitDepth,
      embedIccProfile: formatOptions.embedIccProfile,
      linkSmartObjects: formatOptions.linkSmartObjects,
      preserveVisibility: formatOptions.preserveVisibility,
    };
  } else if (selectedExporter === 'pdf') {
    formatScopedOptions.pdfOptions = {
      pdfaConformance: formatOptions.pdfaConformance,
      colorSpace: formatOptions.colorSpace,
      embedIccProfile: formatOptions.embedIccProfile,
    };
  } else if (selectedExporter === 'pptx') {
    formatScopedOptions.pptxOptions = {
      embedFonts: formatOptions.embedFonts,
      includeAnimations: formatOptions.includeAnimations,
    };
  }
  onExport(selectedExporter, {
    ...dynamicData, pixelRatio, jpegQuality, videoFrameRate, videoQuality,
    selectedAnimationIds: [...selectedAnimationIds],
    ...formatScopedOptions,
  });
}, [/* …existing deps + formatOptions */]);
```

- [ ] **Step 7: Extend `ExportContext` and bridge plumbing**

In [packages/demo/src/formatBridge.ts](../../packages/demo/src/formatBridge.ts) above `ExportContext`:

```tsx
export interface PdfExportOptionsInput {
  readonly pdfaConformance?: 'none' | '2b' | '2u' | '2a';
  readonly colorSpace?: 'rgb' | 'cmyk' | 'lab' | 'grayscale';
  readonly embedIccProfile?: boolean;
}
export interface PsdExportOptionsInput {
  readonly colorSpace?: 'rgb' | 'cmyk' | 'lab' | 'grayscale';
  readonly bitDepth?: 8 | 16;
  readonly embedIccProfile?: boolean;
  readonly linkSmartObjects?: boolean;
  readonly preserveVisibility?: boolean;
}
export interface PptxExportOptionsInput {
  readonly embedFonts?: boolean;
  readonly includeAnimations?: boolean;
}
```

Add to `ExportContext`:

```tsx
readonly pdfOptions?: PdfExportOptionsInput;
readonly psdOptions?: PsdExportOptionsInput;
readonly pptxOptions?: PptxExportOptionsInput;
```

In the `case 'pdf':` switch arm, replace `formats.exportPdfBytes(doc)` with:

```tsx
case 'pdf': {
  const pdfOpts = context.pdfOptions ?? {};
  const pdfBytes = await formats.exportPdfBytes(doc, {
    ...(pdfOpts.pdfaConformance !== undefined && pdfOpts.pdfaConformance !== 'none'
      ? { pdfaConformance: pdfOpts.pdfaConformance } : {}),
    ...(pdfOpts.colorSpace !== undefined ? { outputIntent: { colorSpace: pdfOpts.colorSpace } } : {}),
  });
  /* …existing blob + download */
  break;
}
```

Mirror the same pattern for `case 'psd':` (passing options to `exportPsdBytesAsync`) and `case 'pptx':` (passing options to `exportPptxWithReportAsync`). Verify the actual option key names against [packages/formats/src/pdf/index.ts](../../packages/formats/src/pdf/index.ts), [packages/formats/src/psd/index.ts](../../packages/formats/src/psd/index.ts), [packages/formats/src/pptx/index.ts](../../packages/formats/src/pptx/index.ts) before writing the code — the type names above are intent, not contract.

- [ ] **Step 8: Wire dynamicData passthrough in use-demo-file-handlers**

In [use-demo-file-handlers.ts](../../packages/demo/src/demo-app/use-demo-file-handlers.ts) at line ~671, the existing `bridge.exportDocument(...)` call needs to forward the new option objects from `dynamicData`:

```tsx
const dyn = dynamicData as Record<string, unknown>;
const exportResult = await bridge.exportDocument(exporter as ExportFormat, {
  document, snapshotCanvas, renderFrame, playbackDurationMs,
  pixelRatio: typeof dyn.pixelRatio === 'number' ? dyn.pixelRatio : undefined,
  /* …existing keys */
  pdfOptions: dyn.pdfOptions as PdfExportOptionsInput | undefined,
  psdOptions: dyn.psdOptions as PsdExportOptionsInput | undefined,
  pptxOptions: dyn.pptxOptions as PptxExportOptionsInput | undefined,
  svgOptions: dyn.svgOptions as SvgExportOptionsInput | undefined,
});
```

- [ ] **Step 9: Run CT test to verify it passes**

Run: `npm --prefix packages/ui run ct -- format-export-options-flow`
Expected: PASS.

- [ ] **Step 10: Run quality gate**

Run: `npm run quality:strict`
Expected: PASS (lint, prettier, typecheck, vitest).

- [ ] **Step 11: Commit**

```bash
git add packages/ui/src/modals/format-export-options.tsx packages/ui/src/modals/core-modals.tsx packages/ui/test-ct/format-export-options-flow.spec.tsx packages/demo/src/formatBridge.ts packages/demo/src/demo-app/use-demo-file-handlers.ts
git commit -m "feat(ui): wire FormatExportOptionsModal into ExportModal for all four formats"
```

## Task 1.2: Generalize reconciliation modal beyond PPTX

**Files:**
- Modify: [packages/demo/src/formatBridge.ts](../../packages/demo/src/formatBridge.ts) — populate `reconciliation` for PSD, SVG, PDF (not only PPTX)
- Test: [packages/formats/src/cross-format-reconciliation.test.ts](../../packages/formats/src/cross-format-reconciliation.test.ts) (new) — proves all four format importers can populate the field shape

Each of `reconcilePdf`, `reconcilePsd`, `reconcileSvg`, `reconcilePptx` is exported and returns the same `DocumentReconciliation` shape from [`_shared/reconcile/`](../../packages/formats/src/_shared/reconcile/). Today only PPTX populates `ImportDocumentResult.reconciliation`. Generalize.

- [ ] **Step 1: Write failing test asserting reconciliation populated for all four importers**

```ts
// packages/formats/src/cross-format-reconciliation.test.ts
import { describe, expect, it } from 'vitest';
import { exportPdfBytes, importPdfDocument } from './pdf';
import { exportPsdBytesAsync, importPsdDocument } from './psd';
import { exportPptxBytesAsync, importPptxDocument } from './pptx';
import { exportSvgDocument, importSvgDocument } from './svg';
import { makeMinimalDocument } from './_shared/test-infrastructure';

describe('cross-format reconciliation populates after Broadset round-trip', () => {
  it('PDF re-import populates reconciliation', async () => {
    const doc = makeMinimalDocument();
    const bytes = await exportPdfBytes(doc);
    const result = await importPdfDocument(bytes);
    expect(result.reconciliation).not.toBeNull();
    expect(result.reconciliation?.modifications).toEqual([]);
  });
  it('PSD re-import populates reconciliation', async () => {
    const doc = makeMinimalDocument();
    const bytes = await exportPsdBytesAsync(doc);
    const result = await importPsdDocument(bytes);
    expect(result.reconciliation).not.toBeNull();
  });
  it('SVG re-import populates reconciliation', async () => {
    const doc = makeMinimalDocument();
    const { svg } = await exportSvgDocument(doc);
    const result = await importSvgDocument(svg, 'test.svg');
    expect(result.reconciliation).not.toBeNull();
  });
  it('PPTX re-import populates reconciliation (regression)', async () => {
    const doc = makeMinimalDocument();
    const bytes = await exportPptxBytesAsync(doc);
    const result = await importPptxDocument(bytes);
    expect(result.reconciliation).not.toBeNull();
  });
});
```

(`makeMinimalDocument` may need to be added to `_shared/test-infrastructure/` — single text + rect element with `id`s the formats will round-trip. Match the existing helper conventions if one already exists.)

- [ ] **Step 2: Run test to verify failure**

Run: `npm --prefix packages/formats test -- cross-format-reconciliation`
Expected: FAIL — three of four assertions return `null`.

- [ ] **Step 3: Extend each importer's `DocumentImportResult` to call its `reconcileXxx`**

Each format's `import.ts` already produces a `DocumentImportResult`. Add the reconciliation step:

```ts
// packages/formats/src/pdf/import.ts (sketch — match real names)
import { reconcilePdf } from './roundtrip';
import { readPdfRoundTripMetadata } from './import/...';

export async function importPdfDocument(bytes, options): Promise<DocumentImportResult> {
  /* …existing parse → document, warnings */
  const preserved = readPdfRoundTripMetadata(bytes);
  const reconciliation = preserved !== null ? reconcilePdf(preserved.document, document) : null;
  return { document, warnings, reconciliation };
}
```

Apply the same pattern to `importPsdDocument`, `importSvgDocument`. Verify against each importer's existing structure — the `readPreservedXxxDocument` / `readDocumentXmpPacket` / metadata-extraction call already exists for each format.

- [ ] **Step 4: Update `ImportDocumentResult.reconciliation` doc comment in `formatBridge.ts`**

Replace the PPTX-only sentence at [formatBridge.ts:79-84](../../packages/demo/src/formatBridge.ts#L79-L84) with the generalized statement: "Populated for any format re-import where the input carried Broadset metadata. `null` for arbitrary third-party files."

- [ ] **Step 5: Run test to verify pass**

Run: `npm --prefix packages/formats test -- cross-format-reconciliation`
Expected: PASS.

- [ ] **Step 6: Update PPTX known-gap A1 wording**

Open [pptx-known-gaps.md](pptx-known-gaps.md) §A1. Note that the read-only nature still stands but reconciliation is no longer PPTX-only. (Phase 6 will rewrite this fully.)

- [ ] **Step 7: Commit**

```bash
git add packages/formats/src/pdf/import.ts packages/formats/src/psd/import.ts packages/formats/src/svg/import.ts packages/formats/src/cross-format-reconciliation.test.ts packages/demo/src/formatBridge.ts
git commit -m "feat(formats): populate reconciliation buckets for all four format re-imports"
```

## Task 1.3: Surface preflight + validation results in a dedicated modal

**Files:**
- Create: [packages/ui/src/modals/format-preflight.tsx](../../packages/ui/src/modals/format-preflight.tsx)
- Modify: [packages/ui/src/modals/index.ts](../../packages/ui/src/modals/index.ts) — barrel export
- Modify: [packages/demo/src/formatBridge.ts](../../packages/demo/src/formatBridge.ts) — `ExportDocumentResult.preflight` field
- Modify: [packages/demo/src/demo-app/use-demo-file-handlers.ts](../../packages/demo/src/demo-app/use-demo-file-handlers.ts) — open modal when preflight non-empty
- Test: [packages/ui/test-ct/format-preflight.spec.tsx](../../packages/ui/test-ct/format-preflight.spec.tsx) (new)

Today only flat-string warnings reach the user. Backend produces structured data: `PptxExportReport` (code + message + severity), `validatePsdBytes` (issues with severity), `validatePdfA2b` (rule violations). Surface them.

- [ ] **Step 1: Define the modal's structural prop shape (decoupled from formats)**

```tsx
// packages/ui/src/modals/format-preflight.tsx
import { Accordion, Button, Chip } from '@heroui/react';
import type { JSX } from 'react';
import { ModalShell } from './modal-shell';

export type PreflightSeverity = 'info' | 'warning' | 'error';
export interface PreflightFinding {
  readonly code: string;
  readonly message: string;
  readonly severity: PreflightSeverity;
  readonly elementId?: string;
  readonly hint?: string;
}
export interface FormatPreflightModalProps {
  readonly isOpen: boolean;
  readonly formatLabel: string;
  readonly findings: readonly PreflightFinding[];
  readonly onClose: () => void;
  readonly onProceed?: () => void;
  /** When `proceedLabel === undefined`, this is post-export and only shows Close. */
  readonly proceedLabel?: string;
}

const SEVERITY_COLOR: Record<PreflightSeverity, 'default' | 'warning' | 'danger'> = {
  info: 'default', warning: 'warning', error: 'danger',
};

export function FormatPreflightModal({
  isOpen, formatLabel, findings, onClose, onProceed, proceedLabel,
}: FormatPreflightModalProps): JSX.Element {
  const groups = new Map<PreflightSeverity, PreflightFinding[]>();
  for (const f of findings) {
    const list = groups.get(f.severity) ?? [];
    list.push(f);
    groups.set(f.severity, list);
  }
  return (
    <ModalShell isOpen={isOpen} size="lg" title={`${formatLabel} preflight`} onClose={onClose}>
      <Accordion aria-label="Preflight findings">
        {(['error', 'warning', 'info'] as const).map((sev) => {
          const items = groups.get(sev) ?? [];
          if (items.length === 0) return null;
          return (
            <Accordion.Item key={sev} aria-label={`${sev} (${String(items.length)})`}
              title={<>{sev.toUpperCase()} <Chip color={SEVERITY_COLOR[sev]} size="sm">{items.length}</Chip></>}>
              <ul>
                {items.map((f) => (
                  <li key={`${f.code}:${f.elementId ?? ''}:${f.message}`}>
                    <strong>{f.code}</strong> — {f.message}
                    {f.hint !== undefined && <em> ({f.hint})</em>}
                  </li>
                ))}
              </ul>
            </Accordion.Item>
          );
        })}
      </Accordion>
      <footer style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button variant="ghost" onPress={onClose}>{proceedLabel === undefined ? 'Close' : 'Cancel'}</Button>
        {proceedLabel !== undefined && onProceed !== undefined && (
          <Button variant="primary" onPress={onProceed}>{proceedLabel}</Button>
        )}
      </footer>
    </ModalShell>
  );
}
```

- [ ] **Step 2: Add to barrel export**

```tsx
// packages/ui/src/modals/index.ts (add to existing export block)
export {
  FormatPreflightModal,
  type FormatPreflightModalProps,
  type PreflightFinding,
  type PreflightSeverity,
} from './format-preflight';
```

- [ ] **Step 3: Write failing CT test**

```tsx
// packages/ui/test-ct/format-preflight.spec.tsx
import { test, expect } from '@playwright/experimental-ct-react';
import { FormatPreflightModal } from '../src/modals/format-preflight';

test('preflight modal groups findings by severity and chips show counts', async ({ mount }) => {
  const component = await mount(
    <FormatPreflightModal
      isOpen={true} formatLabel="PSD"
      findings={[
        { code: 'missing-font', message: 'Inter not embedded', severity: 'warning' },
        { code: 'cmyk-downgrade', message: 'CMYK downgraded to RGB', severity: 'warning' },
        { code: 'large-document', message: '>200MB', severity: 'error' },
      ]}
      onClose={() => {}}
    />,
  );
  await expect(component.getByText('ERROR')).toBeVisible();
  await expect(component.getByText('WARNING')).toBeVisible();
  await component.getByText('WARNING').click();
  await expect(component.getByText(/missing-font/)).toBeVisible();
});
```

- [ ] **Step 4: Run CT test — expect FAIL (modal file imports not yet linked)**

Run: `npm --prefix packages/ui run ct -- format-preflight`

- [ ] **Step 5: Run CT test — expect PASS after Steps 1+2**

Run: `npm --prefix packages/ui run ct -- format-preflight`
Expected: PASS.

- [ ] **Step 6: Extend `ExportDocumentResult` with structured preflight findings**

Modify [formatBridge.ts:97-99](../../packages/demo/src/formatBridge.ts):

```tsx
export interface ExportDocumentResult {
  readonly warnings: readonly string[];  // legacy flat strings, kept for back-compat
  readonly preflight: readonly PreflightFinding[];
}
```

Import the type at the top: `import type { PreflightFinding } from '@broadset/ui';` (re-export the type from `@broadset/ui` already done in Step 2).

- [ ] **Step 7: Map per-format reports to `PreflightFinding[]` in `exportDocument`**

In [formatBridge.ts](../../packages/demo/src/formatBridge.ts) `exportDocument`, after each format's emit, build `findings`:

```tsx
const findings: PreflightFinding[] = [];
// PPTX:
for (const w of pptxReport.warnings) {
  findings.push({ code: w.code, message: w.message, severity: 'warning',
    ...(w.elementId !== undefined ? { elementId: w.elementId } : {}) });
}
// PSD: switch to exportPsdBytesAsyncWithPreflight, map result.warnings similarly
// PDF: call collectPreflightWarnings(doc, pdfOptions); map
// SVG: result.warnings → findings (severity: 'warning')
return { warnings, preflight: findings };
```

- [ ] **Step 8: Open modal in demo when findings non-empty**

In [use-demo-file-handlers.ts](../../packages/demo/src/demo-app/use-demo-file-handlers.ts) post-export path (line ~675), after `exportResult` resolves:

```tsx
if (exportResult.preflight.length > 0) {
  setPreflightModalState({ isOpen: true, formatLabel: exporter.toUpperCase(), findings: exportResult.preflight });
}
```

(Add `preflightModalState` and its setter to the demo's modal-state hook alongside the existing reconciliation/warnings state.) Render `<FormatPreflightModal>` in [layout.tsx](../../packages/demo/src/demo-app/layout.tsx) at the same level as the other modals.

- [ ] **Step 9: Quality gate**

Run: `npm run quality:strict && npm --prefix packages/ui run ct`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/ui/src/modals/format-preflight.tsx packages/ui/src/modals/index.ts packages/ui/test-ct/format-preflight.spec.tsx packages/demo/src/formatBridge.ts packages/demo/src/demo-app/use-demo-file-handlers.ts packages/demo/src/demo-app/layout.tsx
git commit -m "feat(ui): surface structured preflight + validation findings in dedicated modal"
```

---

# Phase 2 — Close open security findings

Both findings live in [packages/formats/src/svg/KNOWN-GAPS.md](../../packages/formats/src/svg/KNOWN-GAPS.md). Both block "production for anonymous public uploads" per their close-triggers.

## Task 2.1: SVG H2 — run full element-schema validation on import

**Files:**
- Modify: [packages/formats/src/svg/import-document.ts](../../packages/formats/src/svg/import-document.ts) — validate every imported element through the full schema
- Test: [packages/formats/src/svg/security-audit.test.ts](../../packages/formats/src/svg/security-audit.test.ts) — add H2 regression case

- [ ] **Step 1: Write failing regression test**

```ts
// add to packages/formats/src/svg/security-audit.test.ts
it('H2: <image href="javascript:…"> is rejected by full schema validation', async () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
    <image href="javascript:alert(1)" width="100" height="100"/>
  </svg>`;
  const { document, warnings } = await importSvgDocument(svg, 'evil.svg');
  const imageEls = document.elements.filter((e) => e.type === 'image');
  // Either the element was dropped, OR its href was sanitized to empty / safe
  if (imageEls.length > 0) {
    for (const el of imageEls) {
      const href = (el.content as { href?: string })?.href ?? '';
      expect(href).not.toMatch(/javascript:/i);
    }
  }
  expect(warnings.some((w) => w.toLowerCase().includes('schema') || w.toLowerCase().includes('href'))).toBe(true);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm --prefix packages/formats test -- security-audit`
Expected: FAIL — element survives with `javascript:` href.

- [ ] **Step 3: Add full-schema validation pass in `import-document.ts`**

In [import-document.ts](../../packages/formats/src/svg/import-document.ts) at the createDefaultElement call site (line 18-40 per KNOWN-GAPS), wrap with full schema validation:

```ts
import { broadsetElementSchema } from '@broadset/model';

// Replace the styleSchema-only path:
const candidate = createDefaultElement({ /* …existing args */ });
const parsed = broadsetElementSchema.safeParse(candidate);
if (!parsed.success) {
  warnings.push(`Element "${candidate.id}" failed schema validation: ${parsed.error.message}; element dropped`);
  continue;
}
elements.push(parsed.data);
```

(Verify `broadsetElementSchema` is exported from `@broadset/model`. If not, add the export to [packages/model/src/index.ts](../../packages/model/src/index.ts) — the schema must already exist internally since `superRefine` is referenced in KNOWN-GAPS.)

- [ ] **Step 4: Run test — expect PASS**

Run: `npm --prefix packages/formats test -- security-audit`
Expected: PASS.

- [ ] **Step 5: Quality gate**

Run: `npm run quality:strict`

- [ ] **Step 6: Commit**

```bash
git add packages/formats/src/svg/import-document.ts packages/formats/src/svg/security-audit.test.ts packages/model/src/index.ts
git commit -m "fix(svg): close H2 — run full element-schema validation on every imported element"
```

## Task 2.2: SVG M2 — strip dangerous CSS from preserved outerHTML

**Files:**
- Modify: [packages/formats/src/svg/import-walk.ts](../../packages/formats/src/svg/import-walk.ts) — sanitize `style="…"` content before capturing `preservedOuterHTML`
- Test: [packages/formats/src/svg/security-audit.test.ts](../../packages/formats/src/svg/security-audit.test.ts) — add M2 regression case

- [ ] **Step 1: Write failing regression test**

```ts
it('M2: CSS url(javascript:…) does not survive preservation roundtrip', async () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
    <rect width="50" height="50" style="background:url(javascript:alert(1));filter:url(http://attacker/leak.svg)"/>
  </svg>`;
  const { document } = await importSvgDocument(svg, 'evil.svg');
  const serialized = JSON.stringify(document);
  expect(serialized).not.toMatch(/url\(javascript:/i);
  expect(serialized).not.toMatch(/filter:\s*url\(http:/i);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm --prefix packages/formats test -- security-audit`
Expected: FAIL.

- [ ] **Step 3: Add CSS sanitization to `_shared/sanitize/`**

Create [packages/formats/src/_shared/sanitize/css-url-allowlist.ts](../../packages/formats/src/_shared/sanitize/css-url-allowlist.ts):

```ts
const SAFE_URL_SCHEMES = ['data:image/', 'https://', 'http://', '#'];
const URL_PATTERN = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;

export function sanitizeCssUrls(cssText: string): string {
  return cssText.replace(URL_PATTERN, (match, quote: string, url: string) => {
    const lower = url.toLowerCase().trim();
    const safe = SAFE_URL_SCHEMES.some((scheme) => lower.startsWith(scheme));
    return safe ? match : '';
  });
}

export function sanitizeStyleAttribute(styleText: string): string {
  return sanitizeCssUrls(styleText);
}
```

- [ ] **Step 4: Apply sanitizer in `import-walk.ts` before capturing outerHTML**

In [import-walk.ts](../../packages/formats/src/svg/import-walk.ts) lines 48-79 where `preservedOuterHTML` is captured:

```ts
import { sanitizeStyleAttribute } from '../_shared/sanitize/css-url-allowlist';

// before el.outerHTML capture:
const styledEls = el.querySelectorAll('[style]');
for (const styled of [el, ...Array.from(styledEls)]) {
  if (!(styled instanceof Element)) continue;
  const original = styled.getAttribute('style');
  if (original === null) continue;
  const sanitized = sanitizeStyleAttribute(original);
  if (sanitized !== original) styled.setAttribute('style', sanitized);
}
const preservedOuterHTML = el.outerHTML;
```

- [ ] **Step 5: Run test — expect PASS**

Run: `npm --prefix packages/formats test -- security-audit`

- [ ] **Step 6: Quality gate**

Run: `npm run quality:strict`

- [ ] **Step 7: Commit**

```bash
git add packages/formats/src/_shared/sanitize/css-url-allowlist.ts packages/formats/src/svg/import-walk.ts packages/formats/src/svg/security-audit.test.ts
git commit -m "fix(svg): close M2 — strip dangerous CSS url() from preserved outerHTML"
```

---

# Phase 3 — Cross-format reuse: extract shared utilities

Three duplications surfaced in the analysis. Each has clear seams.

## Task 3.1: Promote text shaping (UAX #9 + UAX #14) to `_shared/text-layout`

Today: [pdf/uax14-linebreak.ts](../../packages/formats/src/pdf/uax14-linebreak.ts) + [pdf/bidi-reorder.ts](../../packages/formats/src/pdf/bidi-reorder.ts) live under PDF; [psd/text-unicode.ts](../../packages/formats/src/psd/text-unicode.ts) implements parallel logic; PPTX and SVG re-implement minimally. Consolidate.

**Files:**
- Create: [packages/formats/src/_shared/text-layout/uax14-linebreak.ts](../../packages/formats/src/_shared/text-layout/uax14-linebreak.ts) (move from pdf/)
- Create: [packages/formats/src/_shared/text-layout/bidi-reorder.ts](../../packages/formats/src/_shared/text-layout/bidi-reorder.ts) (move from pdf/)
- Create: [packages/formats/src/_shared/text-layout/text-unicode.ts](../../packages/formats/src/_shared/text-layout/text-unicode.ts) (move from psd/)
- Modify: [packages/formats/src/_shared/text-layout/index.ts](../../packages/formats/src/_shared/text-layout/index.ts) — barrel
- Modify: [packages/formats/src/pdf/uax14-linebreak.ts](../../packages/formats/src/pdf/uax14-linebreak.ts) → re-export from `_shared`
- Modify: [packages/formats/src/pdf/bidi-reorder.ts](../../packages/formats/src/pdf/bidi-reorder.ts) → re-export from `_shared`
- Modify: [packages/formats/src/psd/text-unicode.ts](../../packages/formats/src/psd/text-unicode.ts) → re-export from `_shared`
- Test: [packages/formats/src/_shared/text-layout/text-shaping.test.ts](../../packages/formats/src/_shared/text-layout/text-shaping.test.ts) (new — assertions on exposed surface)

- [ ] **Step 1: Audit existing tests in pdf/cjk-wrapping.test.ts and pdf/bidi-and-cjk.test.ts**

Read [pdf/cjk-wrapping.test.ts](../../packages/formats/src/pdf/cjk-wrapping.test.ts) and [pdf/bidi-and-cjk.test.ts](../../packages/formats/src/pdf/bidi-and-cjk.test.ts) to confirm the public surface before moving. Note the exported symbols.

- [ ] **Step 2: Move files via `git mv`**

```bash
git mv packages/formats/src/pdf/uax14-linebreak.ts packages/formats/src/_shared/text-layout/uax14-linebreak.ts
git mv packages/formats/src/pdf/bidi-reorder.ts packages/formats/src/_shared/text-layout/bidi-reorder.ts
git mv packages/formats/src/psd/text-unicode.ts packages/formats/src/_shared/text-layout/text-unicode.ts
```

- [ ] **Step 3: Add barrel exports**

In [packages/formats/src/_shared/text-layout/index.ts](../../packages/formats/src/_shared/text-layout/index.ts) add:

```ts
export { wrapTextWithLineBreaks, prepareLineBreaker } from './uax14-linebreak';
export { reorderForBidi } from './bidi-reorder';
export { analyseTextUnicodeProfile } from './text-unicode';
```

(Confirm the actual exported names against the moved files; the analysis report named these but a final read of each file is mandatory.)

- [ ] **Step 4: Update internal callers**

Grep for the moved imports across `packages/formats/src/`:

```bash
grep -rn "from './uax14-linebreak'\|from './bidi-reorder'\|from './text-unicode'\|from '../pdf/uax14-linebreak'" packages/formats/src/
```

For each hit, update the import to `from '../_shared/text-layout'` (or appropriate relative path).

- [ ] **Step 5: Move corresponding tests**

```bash
git mv packages/formats/src/psd/text-unicode.test.ts packages/formats/src/_shared/text-layout/text-unicode.test.ts
```

(If the test file doesn't exist under that name, find the actual test file via `grep -l text-unicode packages/formats/src/psd/`.) Update its imports.

The PDF tests `pdf/cjk-wrapping.test.ts` and `pdf/bidi-and-cjk.test.ts` exercise the PDF export pipeline that uses these utilities — leave them in `pdf/` since they cover integration, not the utility in isolation. Add a thin unit-only test:

```ts
// packages/formats/src/_shared/text-layout/text-shaping.test.ts
import { describe, expect, it } from 'vitest';
import { reorderForBidi, wrapTextWithLineBreaks, prepareLineBreaker, analyseTextUnicodeProfile } from './';

describe('shared text-layout barrel', () => {
  it('reorderForBidi handles pure-LTR fast path', () => {
    expect(reorderForBidi('hello world')).toBe('hello world');
  });
  it('analyseTextUnicodeProfile detects CJK', () => {
    const profile = analyseTextUnicodeProfile('日本語');
    expect(profile.hasCjk).toBe(true);
  });
  it('wrapTextWithLineBreaks splits at break opportunities', async () => {
    await prepareLineBreaker();
    const lines = wrapTextWithLineBreaks('hello world goodbye world', 80, () => 1);
    expect(lines.length).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 6: Run all formats tests + quality gate**

Run: `npm --prefix packages/formats test && npm run quality:strict`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A packages/formats/src/_shared/text-layout/ packages/formats/src/pdf/ packages/formats/src/psd/
git commit -m "refactor(formats): promote UAX #9 + UAX #14 + unicode profile to _shared/text-layout"
```

## Task 3.2: Extract shadow/glow parsing to `_shared/effects`

Today: [psd/effects.ts](../../packages/formats/src/psd/effects.ts) `parseBoxShadow` + `parseGlow` are PSD-only; SVG `<feDropShadow>`/`<feGaussianBlur>` builder in [svg/import-defs.ts](../../packages/formats/src/svg/import-defs.ts) and PDF shadow handling in [pdf/](../../packages/formats/src/pdf/) re-implement equivalent CSS-shadow parsing.

**Files:**
- Create: [packages/formats/src/_shared/effects/parse-shadow.ts](../../packages/formats/src/_shared/effects/parse-shadow.ts)
- Create: [packages/formats/src/_shared/effects/parse-glow.ts](../../packages/formats/src/_shared/effects/parse-glow.ts)
- Create: [packages/formats/src/_shared/effects/types.ts](../../packages/formats/src/_shared/effects/types.ts)
- Create: [packages/formats/src/_shared/effects/index.ts](../../packages/formats/src/_shared/effects/index.ts)
- Modify: [packages/formats/src/psd/effects.ts](../../packages/formats/src/psd/effects.ts) — re-export shared, keep PSD-specific glue
- Test: [packages/formats/src/_shared/effects/parse-shadow.test.ts](../../packages/formats/src/_shared/effects/parse-shadow.test.ts)

- [ ] **Step 1: Write failing test for shared parser**

```ts
// packages/formats/src/_shared/effects/parse-shadow.test.ts
import { describe, expect, it } from 'vitest';
import { parseBoxShadow } from './';

describe('parseBoxShadow (shared)', () => {
  it('parses single CSS box-shadow value', () => {
    expect(parseBoxShadow('2px 4px 8px rgba(0,0,0,0.5)')).toEqual({
      offsetX: 2, offsetY: 4, blur: 8, spread: 0,
      color: { r: 0, g: 0, b: 0, a: 0.5 }, inset: false,
    });
  });
  it('parses inset shadow', () => {
    const result = parseBoxShadow('inset 0 0 4px black');
    expect(result?.inset).toBe(true);
  });
  it('returns null for malformed input', () => {
    expect(parseBoxShadow('not-a-shadow')).toBeNull();
  });
});
```

- [ ] **Step 2: Read current `parseBoxShadow` / `parseGlow` in psd/effects.ts**

Open [packages/formats/src/psd/effects.ts](../../packages/formats/src/psd/effects.ts) and read the full file. Identify the pure parsing logic (input string → structured shadow/glow descriptor) vs the PSD-specific consumer (which converts the descriptor to PSD effect entries).

- [ ] **Step 3: Define shared types**

```ts
// packages/formats/src/_shared/effects/types.ts
export interface ParsedColor {
  readonly r: number; readonly g: number; readonly b: number; readonly a: number;
}
export interface ParsedShadow {
  readonly offsetX: number; readonly offsetY: number;
  readonly blur: number; readonly spread: number;
  readonly color: ParsedColor; readonly inset: boolean;
}
export interface ParsedGlow {
  readonly blur: number; readonly spread: number;
  readonly color: ParsedColor; readonly inner: boolean;
}
```

- [ ] **Step 4: Move pure parsing logic to shared**

Create [parse-shadow.ts](../../packages/formats/src/_shared/effects/parse-shadow.ts) and [parse-glow.ts](../../packages/formats/src/_shared/effects/parse-glow.ts) by extracting the regex/tokenizer body from `psd/effects.ts`. Export through [`index.ts`](../../packages/formats/src/_shared/effects/index.ts):

```ts
export { parseBoxShadow } from './parse-shadow';
export { parseGlow } from './parse-glow';
export type { ParsedShadow, ParsedGlow, ParsedColor } from './types';
```

- [ ] **Step 5: Replace psd/effects.ts internals with shared imports**

Update [psd/effects.ts](../../packages/formats/src/psd/effects.ts) to import the parsers from `../_shared/effects` and keep only the PSD-specific descriptor → PSD-effect-entry mapping.

- [ ] **Step 6: Run shared test + PSD effects regression**

Run: `npm --prefix packages/formats test -- effects`
Expected: PASS — shared tests pass, existing PSD `export-effects.test.ts` and `export-effects-expanded.test.ts` still pass.

- [ ] **Step 7: Update SVG `<feDropShadow>` builder to consume shared parser**

In [svg/import-defs.ts](../../packages/formats/src/svg/import-defs.ts) (or whichever file builds `<feDropShadow>` from CSS), replace any local shadow-parsing regex with `import { parseBoxShadow } from '../_shared/effects';`.

- [ ] **Step 8: Quality gate + commit**

Run: `npm run quality:strict`

```bash
git add -A packages/formats/src/_shared/effects/ packages/formats/src/psd/effects.ts packages/formats/src/svg/import-defs.ts
git commit -m "refactor(formats): extract CSS shadow/glow parsing to _shared/effects"
```

## Task 3.3: Extract canvas-unit conversion + transform decomposition to `_shared/geometry`

Today: [pdf/geometry.ts](../../packages/formats/src/pdf/geometry.ts) `canvasToPoints` is PDF-public-API but is a pure unit conversion the other exporters re-implement. [svg/transform.ts](../../packages/formats/src/svg/transform.ts) matrix decomposition is SVG-only but applicable to PSD shape rotation.

**Files:**
- Create: [packages/formats/src/_shared/geometry/units.ts](../../packages/formats/src/_shared/geometry/units.ts)
- Create: [packages/formats/src/_shared/geometry/matrix.ts](../../packages/formats/src/_shared/geometry/matrix.ts)
- Create: [packages/formats/src/_shared/geometry/index.ts](../../packages/formats/src/_shared/geometry/index.ts)
- Modify: [packages/formats/src/pdf/geometry.ts](../../packages/formats/src/pdf/geometry.ts) — wrap shared
- Modify: [packages/formats/src/svg/transform.ts](../../packages/formats/src/svg/transform.ts) — wrap shared
- Test: [packages/formats/src/_shared/geometry/units.test.ts](../../packages/formats/src/_shared/geometry/units.test.ts)

- [ ] **Step 1: Write failing tests for unit conversion**

```ts
// packages/formats/src/_shared/geometry/units.test.ts
import { describe, expect, it } from 'vitest';
import { canvasUnitToPoints, pointsToCanvasUnit } from './';

describe('canvasUnitToPoints', () => {
  it('converts mm → pt at 72/25.4', () => {
    expect(canvasUnitToPoints(25.4, 'mm', 96)).toBeCloseTo(72, 5);
  });
  it('converts in → pt at 72/in', () => {
    expect(canvasUnitToPoints(1, 'in', 96)).toBeCloseTo(72, 5);
  });
  it('converts px → pt using dpi', () => {
    expect(canvasUnitToPoints(96, 'px', 96)).toBeCloseTo(72, 5);
  });
});
```

- [ ] **Step 2: Move unit-conversion logic from pdf/geometry.ts**

Open [pdf/geometry.ts](../../packages/formats/src/pdf/geometry.ts), copy the pure unit-conversion arithmetic into [_shared/geometry/units.ts](../../packages/formats/src/_shared/geometry/units.ts) under the names `canvasUnitToPoints(value, unit, dpi)` and `pointsToCanvasUnit(value, unit, dpi)`.

- [ ] **Step 3: Re-export from pdf/geometry.ts as compat**

In [pdf/geometry.ts](../../packages/formats/src/pdf/geometry.ts):

```ts
import { canvasUnitToPoints } from '../_shared/geometry';

export function canvasToPoints(value: number, canvas: { unit: string; dpi: number }): number {
  return canvasUnitToPoints(value, canvas.unit as 'mm' | 'in' | 'px', canvas.dpi);
}
```

(Keep the existing public API — this is just delegation. PDF is exported via [packages/formats/src/index.ts](../../packages/formats/src/index.ts) so the external surface stays stable.)

- [ ] **Step 4: Move matrix decomposition from svg/transform.ts**

Identify the matrix-decompose function in [svg/transform.ts](../../packages/formats/src/svg/transform.ts) (decomposing 2D affine into translate/rotate/scale/skew). Move to [_shared/geometry/matrix.ts](../../packages/formats/src/_shared/geometry/matrix.ts) with name `decompose2dMatrix`.

- [ ] **Step 5: Run shared + downstream tests**

Run: `npm --prefix packages/formats test -- geometry transform units-colors`
Expected: PASS.

- [ ] **Step 6: Quality gate + commit**

Run: `npm run quality:strict`

```bash
git add -A packages/formats/src/_shared/geometry/ packages/formats/src/pdf/geometry.ts packages/formats/src/svg/transform.ts
git commit -m "refactor(formats): extract unit conversion + matrix decomposition to _shared/geometry"
```

---

# Phase 4 — Per-format feature parity (ROADMAP — needs sub-plans)

Each sub-bullet below is a multi-day effort that warrants its own bite-sized plan written via `superpowers:writing-plans` when picked up. The phase brief here is enough to scope the sub-plan and identify owner files.

## 4.1: PSD CMYK / Lab / Grayscale + ICC profile round-trip

**Why high leverage:** PSD is the only format whose primary use case (print prep) demands CMYK — currently RGB-only export. Closes [psd.md spec gap §3](../spec/formats/psd.md).

**Sub-plan brief:**
- Wire `_shared/color/lcms-wasm` (PDF P6.3 brings this online — coordinate timing) into PSD export pipeline.
- Honor `document.outputIntent.colorSpace` in [packages/formats/src/psd/export.ts](../../packages/formats/src/psd/export.ts).
- Embed ICC profile via `IccProfileAsset` (P4.4 ready) into PSD `Image Resource Block` 1039.
- Update [packages/formats/src/psd/preflight.ts](../../packages/formats/src/psd/preflight.ts) — drop the "downgrade" warning when CMYK now emits natively.
- Add tests against `validatePsdBytes` confirming CMYK structural floor + Photoshop-import round-trip.

**Sub-plan owner files:** `packages/formats/src/psd/export.ts`, `psd/preflight.ts`, `psd/types.ts`, `_shared/color/`, new `psd/cmyk-roundtrip.test.ts`.

## 4.2: PDF P6.3 — real type-2 / type-3 shading patterns + per-element OCG wrappers

**Why high leverage:** Closes [pdf.md spec gap §3](../spec/formats/pdf.md) — gradients today degrade to first-stop colour with a warning.

**Sub-plan brief:**
- In [packages/formats/src/pdf/export/](../../packages/formats/src/pdf/export/), implement `registerLinearOrRadialShading` against pdf-lib's low-level `pdf.context` API (mentioned in current code as the seam).
- Register one OCG per page already done ([pdf.md:538](../spec/formats/pdf.md)); add per-element `/OC` marked-content wrappers around content-stream emissions.
- Conic-gradient fallback: keep raster path, document trade-off in spec.
- Tests in [packages/formats/src/pdf/](../../packages/formats/src/pdf/) — parity with veraPDF, visual regression confirming gradients paint.

## 4.3: PSD effects parity — bevel / satin / pattern overlay (preserve), inner glow / color overlay / gradient overlay (native)

**Why moderate leverage:** Closes [psd.md spec gap §1](../spec/formats/psd.md). Today drop shadow + outer glow + inner shadow + stroke emit natively; the rest are silently dropped.

**Sub-plan brief:**
- Native emit for inner glow + color overlay + gradient overlay in [psd/export/effects.ts](../../packages/formats/src/psd/export/effects.ts).
- Preservation blob path in `extensions.psd.unmappedEffects` with `dirty: false` for bevel / satin / pattern overlay so untouched re-export is byte-identical.
- Use shared `_shared/effects` from Phase 3.2 for parsing.

## 4.4: PSD bitmap layer mask round-trip — DONE

**Closed (commit pending).** Closes [psd.md spec gap §Mask Round-Trip](../spec/formats/psd.md).

- Bitmap alpha-channel masks (`Layer.mask.imageData` / `Layer.mask.canvas`) ride a base64-encoded one-byte-per-pixel blob in `extensions.psd.bitmapMask` on import via [packages/formats/src/psd/bitmap-mask.ts](../../packages/formats/src/psd/bitmap-mask.ts).
- Vector mask still wins as the editable Broadset surface (`style.borderRadius` / `style.customClipPath`); the bitmap rides as preservation when both are present.
- Re-emission via `applyBitmapMask` in [packages/formats/src/psd/export/masks.ts](../../packages/formats/src/psd/export/masks.ts), wired alongside `applyVectorMasks` in [packages/formats/src/psd/export/layer.ts](../../packages/formats/src/psd/export/layer.ts).
- Validator now counts `{ vector, bitmap }` masks per [packages/formats/src/psd/validate-psd.ts](../../packages/formats/src/psd/validate-psd.ts) → `PsdValidationResult.masks`.

## 4.5: PSD text rotation through ag-psd's text-transform field

**Why low leverage but easy:** Closes [psd.md spec gap §5](../spec/formats/psd.md). Affects axis-aligned text only, today.

**Sub-plan brief:**
- Use ag-psd's `text.transform` field to encode rotation matrix.
- Read back on import to reconstruct `style.transform.rotation`.
- Drop the existing preflight warning when rotation now round-trips.

## 4.6: PSD 16/32-bpc bit-depth preservation

**Why low leverage:** Closes [psd.md spec gap §4](../spec/formats/psd.md). Mainly preservation, not active use.

## 4.7: PPTX font weight/style variants (A4)

**Why moderate leverage:** Closes [pptx-known-gaps A4](pptx-known-gaps.md).

**Sub-plan brief:**
- Add `weight` + `italic` to `FontAsset` in [packages/model/src/font.ts](../../packages/model/src/font.ts) (or wherever `FontAsset` is defined).
- Group `FontAsset[]` by `familyName` in [pptx/export/fonts.ts](../../packages/formats/src/pptx/export/fonts.ts), emit one `<p:embeddedFont>` with regular/bold/italic/boldItalic relationships.
- Update [packages/formats/src/pptx/font-embedding.test.ts](../../packages/formats/src/pptx/font-embedding.test.ts).

## 4.8: PPTX page-override extension (A2)

**Why moderate leverage:** Closes [pptx-known-gaps A2](pptx-known-gaps.md). Requires model-level change.

**Sub-plan brief:**
- Add `content`, `style`, `assetId` to `PageElementInstance` in [packages/model/src/](../../packages/model/src/).
- Propagate through `applyPageOverrides` in [pptx/export/package.ts](../../packages/formats/src/pptx/export/package.ts).
- Update demo + renderer + properties panel to honour the new fields.

## 4.9: PPTX reconciliation conflict-resolution UI (A1)

**Why moderate leverage:** Closes [pptx-known-gaps A1](pptx-known-gaps.md). Builds on Phase 1.2's generalization.

**Sub-plan brief:**
- Extend `FormatReconciliationModalProps` with `onUsePreserved` / `onUseVisual` callbacks per modification.
- Defer `loadTemplate` in demo until user acknowledges per-element choice.

## 4.10: Cross-format `_shared/css` extraction

**Why low leverage today:** [svg/import-css.ts](../../packages/formats/src/svg/import-css.ts) (779 lines, css-tree-based selector resolution) is reusable when PPTX gains DrawingML CSS support. Not blocking today; defer until needed per YAGNI.

---

# Phase 5 — Operational hardening (ROADMAP — needs sub-plans)

## 5.1: PPTX visual-fidelity CI gate (S3)

Closes [pptx-known-gaps S3](pptx-known-gaps.md). Add `pptx-visual-snapshot` job: `libreoffice --headless --convert-to png` → pixelmatch vs reference PNG (<1% threshold). Pin LibreOffice apt version.

## 5.2: PowerPoint-on-Windows manual sanity check protocol (S2)

Closes [pptx-known-gaps S2](pptx-known-gaps.md). Document a release-checklist procedure for opening canonical fixture in PowerPoint + capturing Inspect Document results.

## 5.3: Real licensed fixture mounts in CI for PPTX + PSD

Both formats have local-extension `__fixtures__/external/` directories that are git-ignored. Land a private mount strategy (encrypted release-only mount, GitHub Actions secret-driven) so CI gates against real-world drift. Closes [pptx-known-gaps "real-world external-tool golden files"](pptx-known-gaps.md) and [psd.md spec gap §6](../spec/formats/psd.md).

## 5.4: Telemetry on warning codes (B1)

Closes [pptx-known-gaps B1](pptx-known-gaps.md), generalize across all four formats. Structured-event sink that the demo emits each `PreflightFinding.code` count to (no payload bytes — counts only). Aggregate counts inform which gap to prioritize next.

## 5.5: Accessibility audit on new modals (B3)

Closes [pptx-known-gaps B3](pptx-known-gaps.md). Run VoiceOver/NVDA on all four new modals (`FormatPreflightModal`, `FormatReconciliationModal`, `FormatImportWarningsModal`, `FormatExportOptionsModal`). Add CT keyboard-navigation tests.

## 5.6: Sister-format audits (B4)

Closes [pptx-known-gaps B4](pptx-known-gaps.md). Apply the PPTX Phase 8 audit lens (silent drops, lazy-boundary checks, perf scaling, async resource resolvers) to PSD, SVG, PDF tracks. Each produces its own follow-up plan.

## 5.7: Real-world large-deck load tests (B2)

Closes [pptx-known-gaps B2](pptx-known-gaps.md). Acquire 3–5 large permissive-license decks; pin per-fixture import + export budgets in `pptx-perf-suite`.

## 5.8: PDF font subsetting wiring (P6.3)

Closes [pdf.md spec gap §4](../spec/formats/pdf.md). Wire `_shared/fonts/subsetFont` to drive `@pdf-lib/fontkit` for subset emission with ToUnicode CMap.

---

# Phase 6 — Update gap files and plan registry (after each phase lands)

This phase keeps the gap files honest. Run after each Phase 1–5 task closes.

## Task 6.1: Update SVG KNOWN-GAPS.md after Phase 2

**Files:**
- Modify: [packages/formats/src/svg/KNOWN-GAPS.md](../../packages/formats/src/svg/KNOWN-GAPS.md)

- [ ] **Step 1: Delete H2 + M2 sections (lines 17-79) when Phase 2 closes**

Per the file's own self-instruction at lines 177-179: "Closing a finding: delete the entry and reference the closing commit in the commit message. Don't mark sections as 'DONE' — the entry's absence is the documentation."

- [ ] **Step 2: Add a new "Spec" section entry referencing this plan**

Replace the existing "Spec" section (lines 135-149) with a pointer to the merged spec at [project/spec/formats/svg.md](../spec/formats/svg.md) once that lands.

- [ ] **Step 3: Commit when Phase 2 closes**

```bash
git add packages/formats/src/svg/KNOWN-GAPS.md
git commit -m "docs(svg): close H2 + M2 entries — fixed in <commit-sha>"
```

## Task 6.2: Update pptx-known-gaps.md as Phase 1.2 + Phase 4.7-4.9 + Phase 5 land

**Files:**
- Modify: [project/implementation/pptx-known-gaps.md](pptx-known-gaps.md)

- [ ] **Step 1: A1 update after Phase 1.2 lands**

Rewrite §A1 to note reconciliation modal is no longer PPTX-only; conflict-resolution gap remains until Phase 4.9.

- [ ] **Step 2: A4 deletion when Phase 4.7 closes**

Delete §A4 entry; add corresponding "Spec Gaps" entry to [pptx.md](../spec/formats/pptx.md) per the file's instructions at lines 188-197.

- [ ] **Step 3: A2 deletion when Phase 4.8 closes**

Same pattern as A4.

- [ ] **Step 4: B1, B3, B4 deletion when Phase 5.4, 5.5, 5.6 close**

Same pattern.

- [ ] **Step 5: S3 deletion when Phase 5.1 closes**

Same pattern.

## Task 6.3: Update PSD spec gaps section as Phase 4.1, 4.3, 4.4, 4.5, 4.6 land

**Files:**
- Modify: [project/spec/formats/psd.md](../spec/formats/psd.md) §Spec Gaps (lines 387-396)

- [ ] **Step 1: Delete each closed bullet in turn, reference closing commit**

For each Phase 4.x sub-task that closes, remove its bullet from the Spec Gaps section. Per [CONTRIBUTING.md](../../CONTRIBUTING.md) "Backpropagate Into Specs": "Remove any related item from `## Spec Gaps` only when it is genuinely covered."

## Task 6.4: Update PDF spec gaps section as Phase 4.2 + Phase 5.8 land

**Files:**
- Modify: [project/spec/formats/pdf.md](../spec/formats/pdf.md) §Spec Gaps (lines 529-553)

- [ ] **Step 1: Delete each closed bullet in turn, reference closing commit**

Same pattern as Task 6.3.

## Task 6.5: Register this plan in plan-progress.md

**Files:**
- Modify: [project/implementation/plan-progress.md](plan-progress.md)

- [ ] **Step 1: Add an entry referencing this plan**

Add a new section to plan-progress.md:

```md
## Cross-format I/O improvement plan (2026-04-28)

Tracks: [cross-format-io-improvement-plan.md](cross-format-io-improvement-plan.md).

- [ ] Phase 1 — UI wiring (export options, reconciliation generalization, preflight modal)
- [ ] Phase 2 — SVG security closures (H2, M2)
- [ ] Phase 3 — Shared utility extraction (text-layout, effects, geometry)
- [ ] Phase 4 — Per-format feature parity (sub-plans)
- [ ] Phase 5 — Operational hardening (sub-plans)
- [ ] Phase 6 — Gap-file updates (rolling)
```

- [ ] **Step 2: Commit**

```bash
git add project/implementation/plan-progress.md
git commit -m "docs(plan): register cross-format I/O improvement plan"
```

---

# Self-review

**Spec coverage check:**

| Source finding | Plan task |
|---|---|
| Wire `FormatExportOptionsModal` (PDF/A, PSD color space, SVG font embed, PPTX animations) | Task 1.1 ✓ |
| Generalize reconciliation modal beyond PPTX | Task 1.2 ✓ |
| Surface preflight/validation results | Task 1.3 ✓ |
| Promote text shaping to `_shared/text-layout` | Task 3.1 ✓ |
| Close SVG H2 + M2 | Tasks 2.1, 2.2 ✓ |
| Real licensed fixture mounts in CI | Task 5.3 (roadmap) ✓ |
| `_shared/effects` extraction | Task 3.2 ✓ |
| `_shared/geometry` extraction | Task 3.3 ✓ |
| `_shared/css` extraction | Task 4.10 (deferred per YAGNI) ✓ |
| PSD CMYK/Lab/Grayscale | Task 4.1 ✓ |
| PDF real shading patterns | Task 4.2 ✓ |
| PSD bevel/satin/pattern overlay | Task 4.3 ✓ |
| PSD bitmap mask | Task 4.4 ✓ |
| PSD text rotation | Task 4.5 ✓ |
| PSD 16/32-bpc | Task 4.6 ✓ |
| PPTX font weight variants (A4) | Task 4.7 ✓ |
| PPTX page overrides (A2) | Task 4.8 ✓ |
| PPTX reconciliation conflict UI (A1) | Task 4.9 ✓ |
| Telemetry (B1) | Task 5.4 ✓ |
| Accessibility audit (B3) | Task 5.5 ✓ |
| Real-world large decks (B2) | Task 5.7 ✓ |
| Sister-format audits (B4) | Task 5.6 ✓ |
| PPTX visual snapshot (S3) | Task 5.1 ✓ |
| PowerPoint-on-Windows (S2) | Task 5.2 ✓ |
| PDF font subsetting (P6.3) | Task 5.8 ✓ |

**Type consistency check:**
- `FormatExportOptionsValue` extended with `pdfaConformance`, `embedFonts`, `includeAnimations` in Task 1.1 Step 4; consumed by Task 1.1 Steps 5–6.
- `PreflightFinding` defined in Task 1.3 Step 1; consumed by Task 1.3 Step 6 (`ExportDocumentResult.preflight`).
- `ImportDocumentResult.reconciliation` shape exists in [formatBridge.ts:86](../../packages/demo/src/formatBridge.ts#L86); Task 1.2 just populates it in three more places.
- Sub-task names (`canvasUnitToPoints`, `parseBoxShadow`, etc.) are stable across Phase 3 tasks.

**Placeholder scan:** Phase 1–3 have concrete code in every step. Phase 4–5 are explicitly labelled ROADMAP with sub-plan brief — flagged at top of document.

**Spec ambiguity caught during planning:** PDF's existing `PdfExportOptions` shape (verify exact key names in [packages/formats/src/pdf/index.ts](../../packages/formats/src/pdf/index.ts)) governs Task 1.1 Step 7 — the type names `pdfaConformance` and `outputIntent.colorSpace` are intent-level; the executing engineer must read the actual exported types and align names before writing the code.

---

## Execution choice

**Plan complete and saved to [project/implementation/cross-format-io-improvement-plan.md](cross-format-io-improvement-plan.md). Two execution options:**

**1. Subagent-driven (recommended for Phase 1–3)** — Dispatch a fresh subagent per task, review between tasks. Good fit for the bite-sized TDD work in Phases 1–3.

**2. Inline execution** — Run tasks in this session via `superpowers:executing-plans`, batch with checkpoints.

**Phases 4–5 require new sub-plans first** — do not execute directly from this document.
