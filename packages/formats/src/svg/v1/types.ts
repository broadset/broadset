import type { projectFormatV1 } from '@broadset/model';

import type { ResourceCollectorV1 } from '../../v1';
import type { ImportedElement } from '../import-types';

export interface SvgSourceDetailsV1 {
  readonly element: Element | undefined;
  readonly opacity: number | undefined;
  readonly fillOpacity: number | undefined;
  readonly strokeOpacity: number | undefined;
  readonly hasPaintServer: boolean;
  readonly hasFilter: boolean;
  readonly hasClipPath: boolean;
  readonly hasMask: boolean;
}

export interface ElementMappingContextV1 {
  readonly imported: ImportedElement;
  readonly source: SvgSourceDetailsV1;
  readonly elementId: projectFormatV1.Id;
  readonly parentId: projectFormatV1.Id;
  readonly resourceCollector: ResourceCollectorV1;
  readonly fontRegistry: FontRegistryV1;
}

export interface FontReferenceV1 {
  readonly familyId: projectFormatV1.Id;
  readonly faceId: projectFormatV1.Id;
}

export interface FontRegistryV1 {
  getFont(input: {
    readonly family: string;
    readonly weight: number;
    readonly style: 'normal' | 'italic' | 'oblique';
  }): FontReferenceV1;
}

export interface MappedElementV1 {
  readonly element: projectFormatV1.Element | undefined;
  readonly warnings: readonly projectFormatV1.InteropDiagnostic[];
  readonly mappingConfidence: number;
  readonly editability: 'native' | 'partial' | 'appearance-only';
}

export type SvgImportedStyle = ImportedElement['style'];
export type SvgImportedTextBody = Exclude<ImportedElement['content'], string>;
