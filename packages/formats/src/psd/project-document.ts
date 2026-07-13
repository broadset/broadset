import { projectFormatV1 } from '@broadset/model';

import { toPdfProjectDocumentV1 } from '../pdf/project-document';
import type { PsdSourceDocument, PsdSourceElement } from './project-model';

interface PsdProjectDocumentResultV1 {
  readonly document: PsdSourceDocument;
  readonly warnings: readonly string[];
}

function clampByte(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 255);
}

function concreteColor(input: {
  readonly color: projectFormatV1.ColorValue;
  readonly project: projectFormatV1.BroadsetProjectV1;
}): projectFormatV1.ConcreteColorValue | undefined {
  if (input.color.kind === 'color') return input.color;

  const swatchId: projectFormatV1.Id = input.color.swatchId;
  const swatch = input.project.resources.swatches.find(({ id }) => id === swatchId);

  if (swatch === undefined) return undefined;

  return swatch.kind === 'process' ? swatch.color : swatch.alternateColor;
}

function colorHex(input: {
  readonly color: projectFormatV1.ColorValue;
  readonly project: projectFormatV1.BroadsetProjectV1;
}): string | undefined {
  const color = concreteColor(input);

  if (color === undefined) return undefined;

  const channels = color.space === 'gray' ? [color.channels[0], color.channels[0], color.channels[0]] : color.channels;

  if (color.space !== 'gray' && !['srgb', 'display-p3', 'rec2020'].includes(color.space)) return undefined;

  const body = channels
    .slice(0, 3)
    .map((channel) =>
      clampByte(channel ?? 0)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
  const alpha = clampByte(color.alpha);

  return alpha === 255 ? `#${body}` : `#${body}${alpha.toString(16).padStart(2, '0')}`;
}

function textDecoration(properties: projectFormatV1.RunProperties): string | undefined {
  if (properties.decoration.underline) return 'underline';
  if (properties.decoration.strikeThrough) return 'line-through';

  return undefined;
}

function legacyBullet(
  list: projectFormatV1.TextList,
):
  | { readonly kind: 'none' }
  | { readonly kind: 'char'; readonly char: string }
  | { readonly kind: 'auto'; readonly format: string; readonly startAt?: number } {
  if (list.kind === 'none') return { kind: 'none' };
  if (list.kind === 'unordered') return { kind: 'char', char: list.marker === 'dash' ? '–' : '•' };

  let format = 'arabicPeriod';

  if (list.style === 'lower-alpha') format = 'alphaLcPeriod';
  else if (list.style === 'upper-alpha') format = 'alphaUcPeriod';
  else if (list.style === 'lower-roman') format = 'romanLcPeriod';
  else if (list.style === 'upper-roman') format = 'romanUcPeriod';

  return { kind: 'auto', format, startAt: list.startAt };
}

function legacyLineSpacing(value: projectFormatV1.LineSpacing): number | undefined {
  return value.kind === 'multiple' ? value.value : undefined;
}

function legacyTextContent(input: {
  readonly element: projectFormatV1.Element;
  readonly project: projectFormatV1.BroadsetProjectV1;
}): PsdSourceElement['content'] | undefined {
  if (input.element.kind !== 'text') return undefined;

  return {
    paragraphs: input.element.text.paragraphs.map((paragraph) => ({
      runs: paragraph.runs.map((run) => {
        const family = input.project.resources.fonts.find(({ id }) => id === run.properties.fontFamilyId);
        const fontColor = colorHex({ color: run.properties.color, project: input.project });
        const decoration = textDecoration(run.properties);
        const italic = run.properties.semanticRole === 'emphasis';

        return {
          text: run.text,
          props: {
            style: {
              fontSize: run.properties.size,
              fontWeight: run.properties.weight,
              fontStyle: italic ? 'italic' : 'normal',
              bold: run.properties.weight >= 600,
              italic,
              underline: run.properties.decoration.underline,
              letterSpacing: run.properties.tracking,
              ...(family === undefined ? {} : { fontFamily: family.familyName }),
              ...(fontColor === undefined ? {} : { fontColor, color: fontColor }),
              ...(decoration === undefined ? {} : { textDecoration: decoration }),
            },
            lang: run.properties.language,
            ...(run.properties.hyperlink === undefined ? {} : { hyperlink: { url: run.properties.hyperlink } }),
          },
        };
      }),
      props: {
        align: paragraph.properties.alignment,
        indent: paragraph.properties.startIndent,
        bullet: legacyBullet(paragraph.properties.list),
        ...(legacyLineSpacing(paragraph.properties.lineSpacing) === undefined
          ? {}
          : { lineSpacing: legacyLineSpacing(paragraph.properties.lineSpacing) }),
        spaceBefore: paragraph.properties.spaceBefore,
        spaceAfter: paragraph.properties.spaceAfter,
      },
    })),
  };
}

function renamedElements(input: {
  readonly elements: readonly PsdSourceElement[];
  readonly instances: readonly projectFormatV1.ResolvedSceneInstance[];
  readonly pageIndex: number;
  readonly project: projectFormatV1.BroadsetProjectV1;
}): readonly PsdSourceElement[] {
  const prefix = `psd-v1-page-${String(input.pageIndex + 1)}-`;
  const ids = new Map(input.elements.map(({ id }, index) => [id, `${prefix}${String(index + 1)}`]));

  return input.elements.map((element, index) => {
    const source = input.instances[index]?.element;
    const content = source === undefined ? undefined : legacyTextContent({ element: source, project: input.project });

    return {
      ...element,
      id: ids.get(element.id) ?? `${prefix}${String(index + 1)}`,
      parentId: element.parentId === null ? null : (ids.get(element.parentId) ?? null),
      ...(content === undefined ? {} : { content }),
    };
  });
}

function psdWarning(warning: string): string {
  return warning.replace(/^PDF v1 export:/u, 'PSD v1 export:');
}

export async function toPsdProjectDocumentV1(input: {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly document: projectFormatV1.BroadsetDocumentV1;
  readonly pages: readonly projectFormatV1.PageDefinition[];
  readonly blobs: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array>;
  readonly resolveBlob: ((digest: projectFormatV1.Sha256Digest) => Promise<Uint8Array | undefined>) | undefined;
}): Promise<PsdProjectDocumentResultV1> {
  const allElements: PsdSourceElement[] = [];
  const allPages: PsdSourceDocument['pages'][number][] = [];
  const warnings: string[] = [];
  let template: PsdSourceDocument | undefined;

  for (let pageIndex = 0; pageIndex < input.pages.length; pageIndex += 1) {
    const page = input.pages[pageIndex];

    if (page === undefined) continue;

    const instances: readonly projectFormatV1.ResolvedSceneInstance[] = projectFormatV1
      .resolvePageInstanceTree({ project: input.project, documentId: input.document.id, pageId: page.id })
      .filter(({ visible }) => visible);
    const mapped = await toPdfProjectDocumentV1({
      project: input.project,
      document: input.document,
      page,
      blobs: input.blobs,
      resolveBlob: input.resolveBlob,
    });
    const mappedPage = mapped.document.pages[0];

    if (mappedPage === undefined) throw new Error(`PSD v1 export page ${page.id} could not be adapted`);

    const elements = renamedElements({
      elements: mapped.document.elements,
      instances,
      pageIndex,
      project: input.project,
    });

    template ??= mapped.document;
    allElements.push(...elements);
    allPages.push({
      ...mappedPage,
      id: page.id,
      name: page.name,
      elements: elements.map((element) => ({
        elementId: element.id,
        transform: {
          position: { x: element.position.x, y: element.position.y, z: 0 },
          rotation: { x: 0, y: 0, z: element.rotation },
          scale: { x: 1, y: 1, z: 1 },
        },
        visible: true,
      })),
    });
    warnings.push(...mapped.warnings.filter((warning) => !warning.includes('mixed text runs')).map(psdWarning));
  }

  if (template === undefined) throw new Error('selected PSD export pages could not be resolved');

  return { document: { ...template, elements: allElements, pages: allPages }, warnings };
}
