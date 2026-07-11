import { broadsetProjectV1Schema } from '../project';
import { schemaParityWitnessRegistry } from './schema-parity-witnesses';

export function createTextRunWitnessProject(text: string): unknown {
  const elementFamily = schemaParityWitnessRegistry.find(({ family }) => family === 'element');
  const textVariant = elementFamily?.variants.find(({ discriminant }) => discriminant === 'text');

  if (textVariant === undefined) throw new Error('Text element parity witness is required');

  const project = broadsetProjectV1Schema.parse(textVariant.project());
  const document = project.documents[0];
  const element = document?.elements[0];
  const paragraph = element?.kind === 'text' ? element.text.paragraphs[0] : undefined;

  if (document === undefined || element?.kind !== 'text' || paragraph === undefined) {
    throw new Error('Text element parity witness has an unexpected shape');
  }

  const run = {
    id: 'run',
    text,
    properties: {
      fontFamilyId: 'font-family', fontFaceId: 'font-face', size: 18, color: { kind: 'color' as const, space: 'srgb' as const, channels: [0, 0, 0] as const, alpha: 1 }, weight: 400,
      variationAxes: [], openTypeFeatures: [], language: 'en-US', script: 'Latn', direction: 'ltr' as const,
      decoration: { underline: false, strikeThrough: false, style: 'solid' as const }, baselineShift: 0, tracking: 0, semanticRole: 'none' as const,
    },
  };

  return {
    ...project,
    documents: [{
      ...document,
      elements: [{ ...element, text: { paragraphs: [{ ...paragraph, runs: [run] }] } }],
    }],
  };
}
