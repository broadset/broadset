import type { Diagnostic } from './diagnostics';
import type { PropertyTarget } from './identity';
import type { BroadsetProjectV1 } from './project';
import { createSemanticError } from './semantic-validation-helpers';

function readProjectedId(value: object): string | undefined {
  const descriptor: PropertyDescriptor | undefined = Object.getOwnPropertyDescriptor(value, 'id');
  const descriptorValue: unknown = descriptor?.value;

  return typeof descriptorValue === 'string' ? descriptorValue : undefined;
}

function escapePointerSegment(segment: string): string {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1');
}

function targetKey(target: PropertyTarget): string {
  return JSON.stringify([
    target.entity.projectId,
    target.entity.documentId ?? null,
    target.entity.pageId ?? null,
    target.entity.entityKind,
    target.entity.entityId,
    target.entity.instancePath ?? null,
    target.pointer,
  ]);
}

function isOpaqueJsonProperty(key: string): boolean {
  return key === 'payload' || key === 'sourceIdentity';
}

export function validateProjectedIdUniqueness(project: BroadsetProjectV1): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const stack: Array<{ readonly value: unknown; readonly pointer: string }> = [{ value: project, pointer: '' }];

  while (stack.length > 0) {
    const frame = stack.pop();

    if (frame === undefined || typeof frame.value !== 'object' || frame.value === null) continue;

    if (Array.isArray(frame.value)) {
      const ids = new Set<string>();

      frame.value.forEach((item: unknown, index) => {
        const id = typeof item === 'object' && item !== null ? readProjectedId(item) : undefined;

        if (id !== undefined) {
          if (ids.has(id)) {
            diagnostics.push(
              createSemanticError(
                'identity.duplicate',
                `Duplicate ID: ${id}`,
                `${frame.pointer}/${String(index)}/id`,
              ),
            );
          }

          ids.add(id);
        }

        stack.push({ value: item, pointer: `${frame.pointer}/${String(index)}` });
      });
      continue;
    }

    const entries: ReadonlyArray<readonly [string, unknown]> = Object.entries(frame.value);

    entries.forEach(([key, value]: readonly [string, unknown]) => {
      if (isOpaqueJsonProperty(key)) return;
      stack.push({ value, pointer: `${frame.pointer}/${escapePointerSegment(key)}` });
    });
  }

  return diagnostics;
}

export function validateSparsePageUniqueness(project: BroadsetProjectV1): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  project.documents.forEach((document, documentIndex) => {
    document.pages.forEach((page, pageIndex) => {
      const pageBase = `/documents/${String(documentIndex)}/pages/${String(pageIndex)}`;
      const descendantAddresses = new Set<string>();

      page.descendantOverrides.forEach((override, overrideIndex) => {
        const key = JSON.stringify([
          override.address.rootInstanceId,
          override.address.componentInstancePath,
          override.address.elementId,
        ]);

        if (descendantAddresses.has(key)) {
          diagnostics.push(
            createSemanticError(
              'page.duplicate-descendant-address',
              'Duplicate descendant instance address',
              `${pageBase}/descendantOverrides/${String(overrideIndex)}/address`,
            ),
          );
        }

        descendantAddresses.add(key);
      });

      const validateOverrides = (overrides: readonly { readonly target: PropertyTarget }[], pointer: string): void => {
        const targets = new Set<string>();

        overrides.forEach((override, overrideIndex) => {
          const key = targetKey(override.target);

          if (targets.has(key)) {
            diagnostics.push(
              createSemanticError(
                'page.duplicate-override-target',
                'Duplicate sparse override target',
                `${pointer}/${String(overrideIndex)}/target`,
              ),
            );
          }

          targets.add(key);
        });
      };

      page.rootInstances.forEach((root, rootIndex) => {
        validateOverrides(root.overrides, `${pageBase}/rootInstances/${String(rootIndex)}/overrides`);

        const propertyIds = new Set<string>();

        root.componentPropertyValues.forEach((property, propertyIndex) => {
          if (propertyIds.has(property.exposedPropertyId)) {
            diagnostics.push(
              createSemanticError(
                'page.duplicate-component-property',
                'Duplicate component property value',
                `${pageBase}/rootInstances/${String(rootIndex)}/componentPropertyValues/${String(propertyIndex)}/exposedPropertyId`,
              ),
            );
          }

          propertyIds.add(property.exposedPropertyId);
        });
      });
      page.descendantOverrides.forEach((override, overrideIndex) => {
        validateOverrides(override.overrides, `${pageBase}/descendantOverrides/${String(overrideIndex)}/overrides`);
      });
    });
  });

  return diagnostics;
}
