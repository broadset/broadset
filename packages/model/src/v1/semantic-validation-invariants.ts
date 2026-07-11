import type { Diagnostic } from './diagnostics';
import { compareExactIsoInstants } from './iso-instant';
import type { BroadsetProjectV1 } from './project';
import { greatestCommonDivisor } from './schema-helpers';
import { validateProjectedIdUniqueness, validateSparsePageUniqueness } from './semantic-validation-collections';
import { createSemanticError } from './semantic-validation-helpers';
import { validateProjectUrls } from './semantic-validation-urls';
import { validateValueAndResourceInvariants } from './semantic-validation-values';
import { validateTimebaseSemantics } from './time';

export function validateProjectInvariants(project: BroadsetProjectV1): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [
    ...validateProjectedIdUniqueness(project),
    ...validateSparsePageUniqueness(project),
    ...validateValueAndResourceInvariants(project),
    ...validateProjectUrls(project),
  ];
  const metadataOrder = compareExactIsoInstants(project.metadata.createdAt, project.metadata.updatedAt);

  if (metadataOrder === undefined || metadataOrder > 0) {
    diagnostics.push(
      createSemanticError(
        'project.invalid-timestamp-order',
        'updatedAt must not precede createdAt',
        '/metadata/updatedAt',
      ),
    );
  }

  project.documents.forEach((document, documentIndex) => {
    if (document.timebase === undefined) return;

    const base = `/documents/${String(documentIndex)}/timebase`;

    if (greatestCommonDivisor(document.timebase.frameRate.numerator, document.timebase.frameRate.denominator) !== 1) {
      diagnostics.push(
        createSemanticError(
          'timebase.unreduced-rate',
          'Frame-rate rational terms must be reduced',
          `${base}/frameRate`,
        ),
      );
    }

    validateTimebaseSemantics(document.timebase).forEach((message) => {
      diagnostics.push(createSemanticError('timebase.invalid', message, base));
    });
  });

  project.templateGroups.forEach((group, groupIndex) => {
    group.members.forEach((member, memberIndex) => {
      if (member.role.kind !== 'aspect-ratio') return;
      if (greatestCommonDivisor(member.role.ratio[0], member.role.ratio[1]) === 1) return;

      diagnostics.push(
        createSemanticError(
          'template-group.unreduced-ratio',
          'Aspect-ratio terms must be reduced',
          `/templateGroups/${String(groupIndex)}/members/${String(memberIndex)}/role/ratio`,
        ),
      );
    });
  });

  return diagnostics;
}
