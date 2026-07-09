import { getCapabilityProfile } from '@broadset/model';
import { Accordion } from '@heroui/react';
import type { JSX } from 'react';

import type { PanelElement, PropertyFieldAdapter, PropertyValue } from '../panel-types';
import { color, font, glassPanelStyle, sp } from '../tokens';
import { AppearancePanel, GeometryPanel } from './layout-panels';
import {
  PropertyEditingProvider,
  type PropertyEditingProviderProps,
  PropertyField,
  type PropertyFieldProps,
} from './property-editing-context';
import { TypographyPanel } from './text-panels';

export interface PreflightIssue {
  readonly id: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
  readonly elementName?: string | undefined;
  readonly ruleId?: string | undefined;
}

export interface PreflightPanelProps {
  readonly issues: readonly PreflightIssue[];
}

export function PreflightPanel({ issues }: PreflightPanelProps): JSX.Element {
  if (issues.length === 0) {
    return (
      <section aria-label="Preflight" className="flex flex-col gap-2">
        <p style={{ color: color('muted'), fontSize: font('body-compact'), margin: 0 }}>No issues found</p>
      </section>
    );
  }

  return (
    <section aria-label="Preflight" className="flex flex-col gap-2">
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {issues.map((issue) => (
          <li
            key={issue.id}
            style={{
              color: issue.severity === 'error' ? color('danger') : color('foreground'),
              display: 'flex',
              flexDirection: 'column',
              fontSize: font('body-compact'),
              gap: 2,
              padding: `${sp('sp-01')} 0`,
            }}
          >
            <span style={{ fontWeight: 600 }}>
              {issue.ruleId !== undefined && issue.ruleId !== '' ? `[${issue.ruleId}] ` : ''}
              {issue.elementName !== undefined && issue.elementName !== '' ? `${issue.elementName}: ` : ''}
              {issue.message}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface AnimationModePropertiesPanelProps {
  readonly element: PanelElement;
  readonly adapter: PropertyFieldAdapter;
  readonly documentMode: 'screen' | 'print';
  readonly onUpdate: (key: string, value: string | number | readonly [number, number, number, number]) => void;
  readonly timelineName?: string | undefined;
  readonly keyframeName?: string | undefined;
  readonly keyframeTargetName?: string | undefined;
}

const GEOMETRY_PROPERTY_KEYS = [
  'x',
  'y',
  'width',
  'height',
  'rotation',
  'rotateX',
  'rotateY',
  'rotateZ',
  'translateZ',
] as const;
const APPEARANCE_PROPERTY_KEYS = [
  'backgroundColor',
  'backgroundGradient',
  'borderWidth',
  'borderColor',
  'borderStyle',
  'borderRadius',
  'opacity',
] as const;
const TYPOGRAPHY_PROPERTY_KEYS = [
  'fontFamily',
  'fontSize',
  'fontColor',
  'fontWeight',
  'fontStyle',
  'textAlignment',
  'verticalAlignment',
  'textDecoration',
  'textTransform',
  'lineHeight',
  'letterSpacing',
  'wordSpacing',
] as const;

function hasIncludedProperty(adapter: PropertyFieldAdapter, propertyKeys: readonly string[]): boolean {
  return propertyKeys.some((propertyKey) => adapter.isIncluded(propertyKey));
}

function getIncludedPropertyValue(
  adapter: PropertyFieldAdapter,
  propertyKey: string,
  fallback: PropertyValue,
): PropertyValue {
  return adapter.isIncluded(propertyKey) ? adapter.getValue(propertyKey) : fallback;
}

function getIncludedNumber(adapter: PropertyFieldAdapter, propertyKey: string, fallback: number): number {
  const value = getIncludedPropertyValue(adapter, propertyKey, fallback);

  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function getIncludedString(adapter: PropertyFieldAdapter, propertyKey: string, fallback: string): string {
  const value = getIncludedPropertyValue(adapter, propertyKey, fallback);

  return typeof value === 'string' ? value : fallback;
}

function isNumberTuple4(value: PropertyValue): value is readonly [number, number, number, number] {
  if (!Array.isArray(value) || value.length !== 4) {
    return false;
  }

  const items: readonly unknown[] = value;

  return items.every((item: unknown) => typeof item === 'number');
}

function getIncludedTuple(
  adapter: PropertyFieldAdapter,
  propertyKey: string,
  fallback: readonly [number, number, number, number],
): readonly [number, number, number, number] {
  const value = getIncludedPropertyValue(adapter, propertyKey, fallback);

  return isNumberTuple4(value) ? value : fallback;
}

function formatKeyframeContext(keyframeName: string | undefined, keyframeTargetName: string | undefined): string | null {
  if (keyframeName === undefined) {
    return null;
  }

  if (keyframeTargetName === undefined) {
    return `keyframe ${keyframeName}`;
  }

  return `keyframe ${keyframeName} · target ${keyframeTargetName}`;
}

function formatAnimationHelperText(
  timelineName: string | undefined,
  keyframeName: string | undefined,
  keyframeTargetName: string | undefined,
): string {
  const keyframeContext = formatKeyframeContext(keyframeName, keyframeTargetName);

  if (timelineName === undefined || keyframeContext === null) {
    return 'Editing timeline keyframe values';
  }

  return `Editing timeline ${timelineName} · ${keyframeContext}`;
}

export function AnimationModePropertiesPanel({
  element,
  adapter,
  documentMode,
  onUpdate: _onUpdate,
  timelineName,
  keyframeName,
  keyframeTargetName,
}: AnimationModePropertiesPanelProps): JSX.Element {
  const profile = getCapabilityProfile(element.type);
  const helperText = formatAnimationHelperText(timelineName, keyframeName, keyframeTargetName);
  const defaultExpandedKeys = [
    ...(hasIncludedProperty(adapter, GEOMETRY_PROPERTY_KEYS) ? ['geometry'] : []),
    ...(profile.typography && hasIncludedProperty(adapter, TYPOGRAPHY_PROPERTY_KEYS) ? ['typography'] : []),
    ...(profile.appearance && hasIncludedProperty(adapter, APPEARANCE_PROPERTY_KEYS) ? ['appearance'] : []),
  ];
  const expandedKeys = defaultExpandedKeys.length > 0 ? defaultExpandedKeys : ['geometry'];
  const displayedElement: PanelElement = {
    ...element,
    x: getIncludedNumber(adapter, 'x', element.x),
    y: getIncludedNumber(adapter, 'y', element.y),
    width: getIncludedNumber(adapter, 'width', element.width),
    height: getIncludedNumber(adapter, 'height', element.height),
    rotation: getIncludedNumber(adapter, 'rotation', element.rotation),
    rotateX: getIncludedNumber(adapter, 'rotateX', element.rotateX),
    rotateY: getIncludedNumber(adapter, 'rotateY', element.rotateY),
    rotateZ: getIncludedNumber(adapter, 'rotateZ', element.rotateZ),
    translateZ: getIncludedNumber(adapter, 'translateZ', element.translateZ),
    backgroundColor: getIncludedString(adapter, 'backgroundColor', element.backgroundColor),
    backgroundGradient: getIncludedString(adapter, 'backgroundGradient', element.backgroundGradient),
    borderWidth: getIncludedNumber(adapter, 'borderWidth', element.borderWidth),
    borderColor: getIncludedString(adapter, 'borderColor', element.borderColor),
    borderStyle: getIncludedString(adapter, 'borderStyle', element.borderStyle),
    borderRadius: getIncludedTuple(adapter, 'borderRadius', element.borderRadius),
    opacity: getIncludedNumber(adapter, 'opacity', element.opacity),
    fontFamily: getIncludedString(adapter, 'fontFamily', element.fontFamily),
    fontSize: getIncludedNumber(adapter, 'fontSize', element.fontSize),
    fontColor: getIncludedString(adapter, 'fontColor', element.fontColor),
    fontWeight: getIncludedNumber(adapter, 'fontWeight', element.fontWeight),
    fontStyle: getIncludedString(adapter, 'fontStyle', element.fontStyle),
    textAlignment: getIncludedString(adapter, 'textAlignment', element.textAlignment),
    verticalAlignment: getIncludedString(
      adapter,
      'verticalAlignment',
      element.verticalAlignment,
    ) as PanelElement['verticalAlignment'],
    textDecoration: getIncludedString(adapter, 'textDecoration', element.textDecoration),
    textTransform: getIncludedString(adapter, 'textTransform', element.textTransform),
    lineHeight: getIncludedString(adapter, 'lineHeight', element.lineHeight),
    letterSpacing: getIncludedNumber(adapter, 'letterSpacing', element.letterSpacing),
    wordSpacing: getIncludedNumber(adapter, 'wordSpacing', element.wordSpacing),
  };

  const handleAnimationUpdate = (key: string, value: PropertyValue): void => {
    if (!adapter.isIncluded(key)) {
      return;
    }

    adapter.updateValue(key, value);
  };

  return (
    <aside aria-label="Animation Properties" role="region" className="p-3" style={glassPanelStyle()}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-01'), marginBottom: sp('sp-03') }}>
        <span
          style={{
            alignSelf: 'flex-start',
            backgroundColor: color('surface-secondary'),
            borderRadius: 999,
            color: color('accent'),
            fontSize: font('label'),
            fontWeight: 700,
            padding: `${sp('sp-01')} ${sp('sp-02')}`,
          }}
        >
          Animation Mode
        </span>
        <p style={{ color: color('muted'), fontSize: font('body-compact'), margin: 0 }}>{helperText}</p>
      </div>
      <PropertyEditingProvider adapter={adapter}>
        <Accordion allowsMultipleExpanded defaultExpandedKeys={expandedKeys}>
          <Accordion.Item id="geometry">
            <Accordion.Heading>
              <Accordion.Trigger>Geometry</Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <GeometryPanel
                x={displayedElement.x}
                y={displayedElement.y}
                width={displayedElement.width}
                height={displayedElement.height}
                rotation={displayedElement.rotation}
                rotateX={
                  adapter.isIncluded('rotateX') || element.rotateX !== 0 ? displayedElement.rotateX : undefined
                }
                rotateY={
                  adapter.isIncluded('rotateY') || element.rotateY !== 0 ? displayedElement.rotateY : undefined
                }
                rotateZ={
                  adapter.isIncluded('rotateZ') || element.rotateZ !== 0 ? displayedElement.rotateZ : undefined
                }
                translateZ={
                  adapter.isIncluded('translateZ') || element.translateZ !== 0 ?
                    displayedElement.translateZ
                  : undefined
                }
                onUpdate={handleAnimationUpdate}
                documentMode={documentMode}
              />
            </Accordion.Panel>
          </Accordion.Item>

          {profile.typography ?
            <Accordion.Item id="typography">
              <Accordion.Heading>
                <Accordion.Trigger>Typography</Accordion.Trigger>
              </Accordion.Heading>
              <Accordion.Panel>
                <TypographyPanel
                  fontFamily={displayedElement.fontFamily}
                  fontSize={displayedElement.fontSize}
                  fontColor={displayedElement.fontColor}
                  fontWeight={displayedElement.fontWeight}
                  fontStyle={displayedElement.fontStyle}
                  textAlignment={displayedElement.textAlignment}
                  verticalAlignment={displayedElement.verticalAlignment}
                  textDecoration={displayedElement.textDecoration}
                  textTransform={displayedElement.textTransform}
                  lineHeight={displayedElement.lineHeight}
                  letterSpacing={displayedElement.letterSpacing}
                  wordSpacing={displayedElement.wordSpacing}
                  onUpdate={handleAnimationUpdate}
                />
              </Accordion.Panel>
            </Accordion.Item>
          : null}

          {profile.appearance ?
            <Accordion.Item id="appearance">
              <Accordion.Heading>
                <Accordion.Trigger>Appearance</Accordion.Trigger>
              </Accordion.Heading>
              <Accordion.Panel>
                <AppearancePanel
                  backgroundColor={displayedElement.backgroundColor}
                  backgroundGradient={displayedElement.backgroundGradient}
                  borderWidth={displayedElement.borderWidth}
                  borderColor={displayedElement.borderColor}
                  borderStyle={displayedElement.borderStyle}
                  borderRadius={displayedElement.borderRadius}
                  opacity={displayedElement.opacity}
                  showGradient={documentMode === 'screen' && element.type === 'rectangle'}
                  onUpdate={handleAnimationUpdate}
                />
              </Accordion.Panel>
            </Accordion.Item>
          : null}
        </Accordion>
      </PropertyEditingProvider>
    </aside>
  );
}

export { PropertyEditingProvider, PropertyField };
export type { PropertyEditingProviderProps, PropertyFieldProps };
