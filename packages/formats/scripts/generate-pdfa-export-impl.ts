// generate-pdfa-export-impl.ts <output-path>
//
// Real generator body. Invoked via `tsx` from
// `generate-pdfa-export.mjs` which handles tsx-binary discovery.
// Builds a tiny one-rectangle Broadset document via the model's
// canonical helpers, exports it as PDF/A-2b, and writes the bytes
// to the given path so `validate-pdfa.mjs` can hand them to
// veraPDF.

import { writeFile } from 'node:fs/promises';

import { createDefaultElement, createEmptyBroadsetDocument, rgbColor } from '@broadset/model';

import { exportPdfBytes } from '../src/pdf/index.ts';

const target = process.argv[2];

if (target === undefined) {
  process.stderr.write('usage: generate-pdfa-export-impl.ts <output-path>\n');
  process.exit(2);
}

const empty = createEmptyBroadsetDocument();
const rectangle = createDefaultElement('rectangle', {
  id: 'rect-1',
  name: 'Verification rectangle',
  position: { x: 10, y: 10 },
  width: 80,
  height: 30,
  style: {
    opacity: 1,
    fill: { kind: 'solid', color: rgbColor('#ff0000') },
  },
});
const doc = {
  ...empty,
  id: 'verapdf-validation-doc',
  elements: [rectangle],
};

const bytes = await exportPdfBytes(doc, { pdfaConformance: '2b' });

await writeFile(target, bytes);
process.stdout.write(`wrote ${String(bytes.length)} bytes to ${target}\n`);
