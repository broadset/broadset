/**
 * Barrel re-export for panels module.
 *
 * This file previously contained all panel components (~3,500 lines).
 * Components are now split into focused modules:
 *
 * - panel-types.ts — shared types, constants, and helper components
 * - property-panels.tsx — individual property editing panels
 * - properties-sidebar.tsx — PropertiesSidebar orchestrator
 * - layers-sidebar.tsx — LayersSidebar
 * - animation-sidebar.tsx — AnimationSidebar
 */

export type { AnimationSidebarProps } from './animation-sidebar';
export { AnimationSidebar } from './animation-sidebar';
export type { LayersSidebarProps } from './layers-sidebar';
export { LayersSidebar } from './layers-sidebar';
export type { LayerDropPosition } from './layers-utils';
export { computeDropPosition, isDescendantInLayerList } from './layers-utils';
export type {
  CustomPanelComponent,
  CustomPanelProps,
  LayerInfo,
  PanelElement,
  PropertyFieldAdapter,
  PropertyValue,
} from './panel-types';
export { FieldShell } from './panel-types';
export type { PropertiesSidebarProps } from './properties-sidebar';
export { PropertiesSidebar } from './properties-sidebar';
export type {
  AnimationModePropertiesPanelProps,
  AppearancePanelProps,
  BoxEffectsPanelProps,
  ClipPathPanelProps,
  ClockPanelProps,
  GeometryPanelProps,
  GroupPanelProps,
  ImagePanelProps,
  ObjectFitPanelProps,
  PathPropertiesPanelProps,
  PreflightIssue,
  PreflightPanelProps,
  PropertyEditingProviderProps,
  PropertyFieldProps,
  QrCodePanelProps,
  SpacingPanelProps,
  TextEffectsPanelProps,
  TickerPanelProps,
  TypographyPanelProps,
  VideoPanelProps,
} from './property-panels';
export {
  AnimationModePropertiesPanel,
  AppearancePanel,
  BoxEffectsPanel,
  ClipPathPanel,
  ClockPanel,
  GeometryPanel,
  GroupPanel,
  ImagePanel,
  ObjectFitPanel,
  PathPropertiesPanel,
  PreflightPanel,
  PropertyEditingProvider,
  PropertyField,
  QrCodePanel,
  SpacingPanel,
  TextEffectsPanel,
  TickerPanel,
  TypographyPanel,
  VideoPanel,
} from './property-panels';
