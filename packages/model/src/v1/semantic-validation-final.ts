import type { Diagnostic } from './diagnostics';
import type { Id } from './identity';
import type { BroadsetProjectV1 } from './project';
import { resolveProjectEntityAddress } from './resolved-address';
import type { SharedStyle } from './resources';
import type { SemanticIndexes } from './semantic-index';
import {
  createSemanticError,
  findDuplicateIdDiagnostics,
  typedValueMatchesType,
} from './semantic-validation-helpers';
import type { ValueType } from './typed-value';

function validateAssetReference(
  indexes: SemanticIndexes,
  assetId: Id,
  kinds: readonly BroadsetProjectV1['resources']['assets'][number]['kind'][],
  pointer: string,
  diagnostics: Diagnostic[],
): void {
  const asset = indexes.assets.get(assetId);

  if (asset === undefined) {
    diagnostics.push(createSemanticError('resource.missing-reference', 'Asset does not resolve', pointer));
  } else if (!kinds.includes(asset.kind)) {
    diagnostics.push(createSemanticError('resource.wrong-kind', `Expected ${kinds.join(' or ')} asset`, pointer));
  }
}

export function validateOutputProfiles(indexes: SemanticIndexes, diagnostics: Diagnostic[]): void {
  indexes.documentList.forEach(({ document }, documentPosition) => {
    const seen = new Set<Id>();

    document.outputProfileIds.forEach((profileId, profilePosition) => {
      const profile = indexes.outputProfiles.get(profileId);
      const pointer = `/documents/${String(documentPosition)}/outputProfileIds/${String(profilePosition)}`;
      const wrongKind =
        (document.kind === 'motion' && profile?.kind !== 'motion') ||
        (document.kind === 'static' && profile?.kind !== 'motion') ||
        (document.kind === 'print' && profile?.kind !== 'print');

      if (seen.has(profileId)) {
        diagnostics.push(createSemanticError('output.duplicate-profile', 'Duplicate document output profile', pointer));
      }

      seen.add(profileId);

      if (profile === undefined || wrongKind) {
        diagnostics.push(
          createSemanticError('output.invalid-profile', 'Output profile is missing or incompatible', pointer),
        );
      } else if (
        document.kind === 'motion' &&
        document.timebase !== undefined &&
        profile.kind === 'motion' &&
        (BigInt(document.timebase.ticksPerSecond) * BigInt(profile.frameRate.denominator)) %
          BigInt(profile.frameRate.numerator) !==
          0n
      ) {
        diagnostics.push(
          createSemanticError('output.incompatible-rate', 'Output frames do not start at integer ticks', pointer),
        );
      }
    });
  });
  indexes.project.resources.outputProfiles.forEach((profile, profilePosition) => {
    if (profile.kind === 'print') {
      validateAssetReference(
        indexes,
        profile.outputIntent.iccAssetId,
        ['icc-profile'],
        `/resources/outputProfiles/${String(profilePosition)}/outputIntent/iccAssetId`,
        diagnostics,
      );
    }
  });
}

type StyleEntry = Extract<
  SharedStyle['source'],
  { readonly kind: 'properties' }
>['entries'][number];

function findStyleStringValue(entries: readonly StyleEntry[], pointer: string): string | undefined {
  const value = entries.find((entry) => entry.pointer === pointer)?.value;

  return value?.type === 'string' ? value.value : undefined;
}

function resolveLineSpacingPointer(entries: readonly StyleEntry[], pointer: string): ValueType | undefined {
  const lineSpacingKind = findStyleStringValue(entries, '/paragraph/lineSpacing/kind');

  if (pointer === '/paragraph/lineSpacing/kind') return 'string';

  if (pointer === '/paragraph/lineSpacing/value') {
    if (lineSpacingKind === 'multiple') return 'number';
    if (lineSpacingKind === 'absolute') return 'length';

    return undefined;
  }

  return undefined;
}

function resolveListPointer(entries: readonly StyleEntry[], pointer: string): ValueType | undefined {
  const listKind = findStyleStringValue(entries, '/paragraph/list/kind');

  if (pointer === '/paragraph/list/kind') return 'string';

  if (pointer === '/paragraph/list/level') {
    return listKind === 'ordered' || listKind === 'unordered' ? 'integer' : undefined;
  }

  if (pointer === '/paragraph/list/startAt') return listKind === 'ordered' ? 'integer' : undefined;
  if (pointer === '/paragraph/list/style') return listKind === 'ordered' ? 'string' : undefined;
  if (pointer === '/paragraph/list/marker') return listKind === 'unordered' ? 'string' : undefined;

  return undefined;
}

function resolveConditionalParagraphPointer(entries: readonly StyleEntry[], pointer: string): ValueType | undefined {
  return resolveLineSpacingPointer(entries, pointer) ?? resolveListPointer(entries, pointer);
}

function resolveStylePointerType(
  kind: 'appearance' | 'text',
  entries: readonly StyleEntry[],
  pointer: string,
): ValueType | undefined {
  const appearance: Readonly<Record<string, ValueType>> = {
    '/opacity': 'number',
    '/blendMode': 'string',
    '/isolation': 'boolean',
  };
  const text: Readonly<Record<string, ValueType>> = {
    '/fontFamilyId': 'string',
    '/fontFaceId': 'string',
    '/size': 'length',
    '/color': 'color',
    '/weight': 'integer',
    '/baselineShift': 'length',
    '/tracking': 'number',
    '/language': 'string',
    '/script': 'string',
    '/direction': 'string',
    '/hyperlink': 'string',
    '/semanticRole': 'string',
    '/decoration/underline': 'boolean',
    '/decoration/strikeThrough': 'boolean',
    '/decoration/style': 'string',
    '/decoration/color': 'color',
    '/paragraph/alignment': 'string',
    '/paragraph/direction': 'string',
    '/paragraph/spaceBefore': 'length',
    '/paragraph/spaceAfter': 'length',
    '/paragraph/firstLineIndent': 'length',
    '/paragraph/startIndent': 'length',
    '/paragraph/endIndent': 'length',
    '/paragraph/hyphenation': 'string',
    '/paragraph/keepTogether': 'boolean',
    '/paragraph/keepWithNext': 'boolean',
    '/paragraph/widowControl': 'boolean',
  };

  if (kind === 'appearance') return appearance[pointer];

  return text[pointer] ?? resolveConditionalParagraphPointer(entries, pointer);
}

function validateStyleFontReferences(
  indexes: SemanticIndexes,
  entries: readonly StyleEntry[],
  pointer: string,
  diagnostics: Diagnostic[],
): void {
  const familyPosition = entries.findIndex((entry) => entry.pointer === '/fontFamilyId');
  const facePosition = entries.findIndex((entry) => entry.pointer === '/fontFaceId');
  const familyValue = entries[familyPosition]?.value;
  const faceValue = entries[facePosition]?.value;
  const family =
    familyValue?.type === 'string'
      ? indexes.project.resources.fonts.find((font) => font.id === familyValue.value)
      : undefined;

  if (familyValue?.type === 'string' && family === undefined) {
    diagnostics.push(
      createSemanticError(
        'resource.missing-reference',
        'Font family does not resolve',
        `${pointer}/entries/${String(familyPosition)}/value/value`,
      ),
    );
  }

  if (
    faceValue?.type === 'string' &&
    family !== undefined &&
    !family.faces.some((face) => face.id === faceValue.value)
  ) {
    diagnostics.push(
      createSemanticError(
        'resource.missing-reference',
        'Font face does not resolve in the selected family',
        `${pointer}/entries/${String(facePosition)}/value/value`,
      ),
    );
  }
}

function validateMissingBlobSource(
  source: BroadsetProjectV1['resources']['assets'][number]['blob']['source'],
  pointer: string,
  diagnostics: Diagnostic[],
): void {
  if (source.kind === 'missing') {
    diagnostics.push(createSemanticError('resource.missing-source', 'Blob source is explicitly missing', pointer));
  }
}

function validateSurfaceBackground(indexes: SemanticIndexes, diagnostics: Diagnostic[]): void {
  indexes.documentList.forEach(({ document }, documentPosition) => {
    const paint = document.surface.background;
    const pointer = `/documents/${String(documentPosition)}/surface/background`;

    if (paint.kind === 'solid' && paint.color.kind === 'swatch' && !indexes.swatches.has(paint.color.swatchId)) {
      diagnostics.push(createSemanticError('resource.missing-reference', 'Swatch does not resolve', `${pointer}/color/swatchId`));
    }

    if (paint.kind === 'gradient') {
      paint.gradient.stops.forEach((stop, stopPosition) => {
        if (stop.color.kind === 'swatch' && !indexes.swatches.has(stop.color.swatchId)) {
          diagnostics.push(
            createSemanticError(
              'resource.missing-reference',
              'Swatch does not resolve',
              `${pointer}/gradient/stops/${String(stopPosition)}/color/swatchId`,
            ),
          );
        }
      });
    }

    if (paint.kind === 'picture' || paint.kind === 'pattern') {
      validateAssetReference(indexes, paint.assetId, ['image', 'vector'], `${pointer}/assetId`, diagnostics);
    }
  });
}

function validateForeignElementSource(
  element: BroadsetProjectV1['documents'][number]['elements'][number],
  pointer: string,
  diagnostics: Diagnostic[],
): void {
  if (element.kind === 'foreign') {
    validateMissingBlobSource(element.foreign.sourceBlob.source, `${pointer}/foreign/sourceBlob/source`, diagnostics);
  }
}

function validateSharedStyle(
  indexes: SemanticIndexes,
  style: SharedStyle,
  stylePosition: number,
  diagnostics: Diagnostic[],
): void {
  const targetId = style.source.kind === 'alias' ? style.source.styleId : style.source.inheritedStyleId;
  const pointer = `/resources/styles/${String(stylePosition)}/source`;

  if (targetId !== undefined) {
    const target = indexes.styles.get(targetId);
    const referencePointer = style.source.kind === 'alias' ? `${pointer}/styleId` : `${pointer}/inheritedStyleId`;

    if (target === undefined) diagnostics.push(createSemanticError('resource.missing-reference', 'Shared style does not resolve', referencePointer));
    else {
      if (target.kind !== style.kind) diagnostics.push(createSemanticError('style.incompatible-inheritance', 'Shared-style kinds are incompatible', referencePointer));
      if (targetId === style.id || styleReaches(indexes, targetId, style.id, new Set())) diagnostics.push(createSemanticError('style.cycle', 'Shared-style dependency cycle', referencePointer));
    }
  }

  if (style.source.kind !== 'properties') return;

  const entries = style.source.entries;

  entries.forEach((entry, entryPosition) => {
    const entryPointer = `${pointer}/entries/${String(entryPosition)}`;
    const expected = resolveStylePointerType(style.kind, entries, entry.pointer);

    if (expected === undefined) diagnostics.push(createSemanticError('style.invalid-pointer', 'Shared-style pointer is not approved', `${entryPointer}/pointer`));
    else if (!typedValueMatchesType(entry.value, expected)) diagnostics.push(createSemanticError('style.incompatible-value', 'Shared-style value is incompatible', `${entryPointer}/value`));
  });
  if (style.kind === 'text') validateStyleFontReferences(indexes, entries, pointer, diagnostics);
}

function styleReaches(indexes: SemanticIndexes, startId: Id, targetId: Id, seen: ReadonlySet<Id>): boolean {
  if (seen.has(startId)) return false;

  const style = indexes.styles.get(startId);

  if (style === undefined) return false;

  const nextId = style.source.kind === 'alias' ? style.source.styleId : style.source.inheritedStyleId;

  if (nextId === undefined) return false;

  return nextId === targetId || styleReaches(indexes, nextId, targetId, new Set([...seen, startId]));
}

export function validateAdditionalResources(indexes: SemanticIndexes, diagnostics: Diagnostic[]): void {
  indexes.project.resources.assets.forEach((asset, assetPosition) => {
    validateMissingBlobSource(asset.blob.source, `/resources/assets/${String(assetPosition)}/blob/source`, diagnostics);
    asset.derivatives?.forEach((derivative, derivativePosition) => {
      validateMissingBlobSource(
        derivative.blob.source,
        `/resources/assets/${String(assetPosition)}/derivatives/${String(derivativePosition)}/blob/source`,
        diagnostics,
      );
    });
  });
  validateSurfaceBackground(indexes, diagnostics);
  indexes.project.resources.fonts.forEach((font, fontPosition) => {
    font.fallbackFontIds.forEach((fontId, index) => {
      if (!indexes.fonts.has(fontId)) diagnostics.push(createSemanticError('resource.missing-reference', 'Fallback font does not resolve', `/resources/fonts/${String(fontPosition)}/fallbackFontIds/${String(index)}`));
    });
    font.faces.forEach((face, index) => {
      if (face.source.kind === 'asset') validateAssetReference(indexes, face.source.assetId, ['font'], `/resources/fonts/${String(fontPosition)}/faces/${String(index)}/source/assetId`, diagnostics);
    });
  });
  indexes.project.resources.styles.forEach((style, stylePosition) => {
    validateSharedStyle(indexes, style, stylePosition, diagnostics);
  });
  indexes.documentList.forEach(({ document }, documentPosition) => {
    document.elements.forEach((element, elementPosition) => {
      validateForeignElementSource(element, `/documents/${String(documentPosition)}/elements/${String(elementPosition)}`, diagnostics);
    });
    document.components.forEach((component, componentPosition) => {
      component.elements.forEach((element, elementPosition) => {
        validateForeignElementSource(
          element,
          `/documents/${String(documentPosition)}/components/${String(componentPosition)}/elements/${String(elementPosition)}`,
          diagnostics,
        );
      });
    });
  });
}

export function validateTemplateGroups(indexes: SemanticIndexes, diagnostics: Diagnostic[]): void {
  indexes.project.templateGroups.forEach((group, groupPosition) => {
    diagnostics.push(...findDuplicateIdDiagnostics(group.members, `/templateGroups/${String(groupPosition)}/members`));
    group.members.forEach((member, memberPosition) => {
      const base = `/templateGroups/${String(groupPosition)}/members/${String(memberPosition)}`;
      const document = indexes.documents.get(member.documentId)?.document;
      const seenProfiles = new Set<Id>();

      if (!indexes.documents.has(member.documentId)) {
        diagnostics.push(
          createSemanticError(
            'template-group.invalid-member',
            'Template member document does not resolve',
            `${base}/documentId`,
          ),
        );
      }

      member.outputProfileIds.forEach((id, index) => {
        const profile = indexes.outputProfiles.get(id);
        const pointer = `${base}/outputProfileIds/${String(index)}`;

        if (seenProfiles.has(id)) {
          diagnostics.push(createSemanticError('template-group.duplicate-profile', 'Duplicate member output profile', pointer));
        }

        seenProfiles.add(id);

        if (profile === undefined) {
          diagnostics.push(
            createSemanticError(
              'template-group.invalid-profile',
              'Template member profile does not resolve',
              pointer,
            ),
          );
        } else if (
          document !== undefined &&
          ((document.kind === 'motion' && profile.kind !== 'motion') ||
            (document.kind === 'static' && profile.kind !== 'motion') ||
            (document.kind === 'print' && profile.kind !== 'print'))
        ) {
          diagnostics.push(
            createSemanticError(
              'template-group.incompatible-profile',
              'Template member profile is incompatible with its document',
              pointer,
            ),
          );
        }
      });
    });
  });
}

export function validateInterop(indexes: SemanticIndexes, diagnostics: Diagnostic[]): void {
  indexes.project.interop.sources.forEach((source, sourcePosition) => {
    validateAssetReference(
      indexes,
      source.sourceAssetId,
      ['image', 'video', 'audio', 'font', 'icc-profile', 'data', 'vector', 'foreign'],
      `/interop/sources/${String(sourcePosition)}/sourceAssetId`,
      diagnostics,
    );
  });
  indexes.project.interop.records.forEach((record, recordPosition) => {
    const base = `/interop/records/${String(recordPosition)}`;

    if (!indexes.project.interop.sources.some((source) => source.id === record.sourceId)) {
      diagnostics.push(
        createSemanticError('interop.invalid-source', 'Interop source does not resolve', `${base}/sourceId`),
      );
    }

    if (!resolveProjectEntityAddress(indexes, record.target)) {
      diagnostics.push(
        createSemanticError('interop.invalid-target', 'Interop target does not resolve', `${base}/target`),
      );
    }

    if (record.previewAssetId !== undefined) {
      validateAssetReference(
        indexes,
        record.previewAssetId,
        ['image', 'vector'],
        `${base}/previewAssetId`,
        diagnostics,
      );
    }

    if (record.preservedBlob !== undefined) {
      validateMissingBlobSource(record.preservedBlob.source, `${base}/preservedBlob/source`, diagnostics);
    }

    record.warnings.forEach((warning, warningPosition) => {
      if (warning.entity !== undefined && !resolveProjectEntityAddress(indexes, warning.entity)) {
        diagnostics.push(
          createSemanticError(
            'interop.invalid-warning-address',
            'Interop warning entity address does not resolve',
            `${base}/warnings/${String(warningPosition)}/entity`,
          ),
        );
      }
    });
  });
}
