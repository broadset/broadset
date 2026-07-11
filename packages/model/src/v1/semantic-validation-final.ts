import type { Diagnostic } from './diagnostics';
import type { EntityAddress, Id } from './identity';
import type { BroadsetProjectV1 } from './project';
import type { SemanticIndexes } from './semantic-index';
import { createSemanticError, findDuplicateIdDiagnostics } from './semantic-validation-helpers';
import type { TypedValue } from './typed-value';

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
    document.outputProfileIds.forEach((profileId, profilePosition) => {
      const profile = indexes.outputProfiles.get(profileId);
      const pointer = `/documents/${String(documentPosition)}/outputProfileIds/${String(profilePosition)}`;
      const wrongKind =
        (document.kind === 'motion' && profile?.kind !== 'motion') ||
        (document.kind === 'print' && profile?.kind !== 'print');

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

function validateTypedAssetValues(
  indexes: SemanticIndexes,
  value: TypedValue,
  pointer: string,
  diagnostics: Diagnostic[],
): void {
  if (value.type === 'asset') {
    validateAssetReference(indexes, value.assetId, ['image', 'video', 'audio', 'font', 'icc-profile', 'data', 'vector', 'foreign'], pointer, diagnostics);
  } else if (value.type === 'list') {
    value.items.forEach((item, index) => { validateTypedAssetValues(indexes, item, `${pointer}/items/${String(index)}`, diagnostics); });
  } else if (value.type === 'object') {
    Object.entries(value.fields).forEach(([fieldId, item]) => { validateTypedAssetValues(indexes, item, `${pointer}/fields/${fieldId}`, diagnostics); });
  }
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
  indexes.project.resources.fonts.forEach((font, fontPosition) => {
    font.fallbackFontIds.forEach((fontId, index) => {
      if (!indexes.fonts.has(fontId)) diagnostics.push(createSemanticError('resource.missing-reference', 'Fallback font does not resolve', `/resources/fonts/${String(fontPosition)}/fallbackFontIds/${String(index)}`));
    });
    font.faces.forEach((face, index) => {
      if (face.source.kind === 'asset') validateAssetReference(indexes, face.source.assetId, ['font'], `/resources/fonts/${String(fontPosition)}/faces/${String(index)}/source/assetId`, diagnostics);
    });
  });
  indexes.project.resources.styles.forEach((style, stylePosition) => {
    const targetId = style.source.kind === 'alias' ? style.source.styleId : style.source.inheritedStyleId;

    if (targetId === undefined) return;

    const pointer = `/resources/styles/${String(stylePosition)}/source`;

    if (!indexes.styles.has(targetId)) diagnostics.push(createSemanticError('resource.missing-reference', 'Shared style does not resolve', pointer));
    else if (targetId === style.id || styleReaches(indexes, targetId, style.id, new Set())) diagnostics.push(createSemanticError('style.cycle', 'Shared-style dependency cycle', pointer));
  });
  indexes.project.resources.variables.forEach((collection, collectionPosition) => {
    collection.variables.forEach((variable, variablePosition) => {
      Object.entries(variable.valuesByMode).forEach(([modeId, value]) => { validateTypedAssetValues(indexes, value, `/resources/variables/${String(collectionPosition)}/variables/${String(variablePosition)}/valuesByMode/${modeId}`, diagnostics); });
    });
  });
}

export function validateTemplateGroups(indexes: SemanticIndexes, diagnostics: Diagnostic[]): void {
  indexes.project.templateGroups.forEach((group, groupPosition) => {
    diagnostics.push(...findDuplicateIdDiagnostics(group.members, `/templateGroups/${String(groupPosition)}/members`));
    group.members.forEach((member, memberPosition) => {
      const base = `/templateGroups/${String(groupPosition)}/members/${String(memberPosition)}`;

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
        if (!indexes.outputProfiles.has(id)) {
          diagnostics.push(
            createSemanticError(
              'template-group.invalid-profile',
              'Template member profile does not resolve',
              `${base}/outputProfileIds/${String(index)}`,
            ),
          );
        }
      });
    });
  });
}

function entityAddressResolves(indexes: SemanticIndexes, address: EntityAddress): boolean {
  if (address.projectId !== indexes.project.id) return false;
  if (address.entityKind === 'project') return address.entityId === indexes.project.id;
  if (address.documentId === undefined) return false;

  const document = indexes.documents.get(address.documentId);

  if (document === undefined) return false;
  if (address.entityKind === 'document') return address.entityId === document.document.id;

  if (address.entityKind === 'element') {
    return (
      document.elements.has(address.entityId) ||
      [...document.components.values()].some((component) => component.elements.has(address.entityId))
    );
  }

  if (address.entityKind === 'component') return document.components.has(address.entityId);
  if (address.entityKind === 'sequence') return document.sequences.has(address.entityId);
  if (address.entityKind === 'page') return document.document.pages.some((page) => page.id === address.entityId);

  return false;
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

    if (!entityAddressResolves(indexes, record.target)) {
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
  });
}
