import type { BroadsetDocumentV1, ColorSpaceDefinition } from './document';
import type { BroadsetProjectV1 } from './project';

type IccProfile = Extract<BroadsetProjectV1['resources']['assets'][number], { readonly kind: 'icc-profile' }>;
type ColorModel = Extract<ColorSpaceDefinition, { readonly kind: 'icc' }>['model'];

const WORKING_PROFILE_CLASSES = new Set<IccProfile['metadata']['profileClass']>([
  'input',
  'display',
  'output',
  'color-space',
]);
const ICC_COLOR_SPACES: Readonly<Record<ColorModel, string>> = {
  rgb: 'RGB',
  cmyk: 'CMYK',
  gray: 'GRAY',
  lab: 'LAB',
};

function normalizeIccColorSpace(value: string): string {
  return value.trim().replace(/[a-z]/gu, (character) => character.toUpperCase());
}

function profileMatchesModel(profile: IccProfile, model: ColorModel): boolean {
  return normalizeIccColorSpace(profile.metadata.colorSpace) === ICC_COLOR_SPACES[model];
}

export function isWorkingIccProfileCompatible(profile: IccProfile, model: ColorModel): boolean {
  return WORKING_PROFILE_CLASSES.has(profile.metadata.profileClass) && profileMatchesModel(profile, model);
}

export function documentOutputColorModel(documentKind: BroadsetDocumentV1['kind']): 'cmyk' | 'rgb' {
  return documentKind === 'print' ? 'cmyk' : 'rgb';
}

export function isOutputIccProfileCompatible(profile: IccProfile, model: 'cmyk' | 'rgb'): boolean {
  return profile.metadata.profileClass === 'output' && profileMatchesModel(profile, model);
}
