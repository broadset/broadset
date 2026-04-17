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
      <section aria-label="Preflight" role="region" className="flex flex-col gap-2">
        <p style={{ color: color('muted'), fontSize: font('body-compact'), margin: 0 }}>No issues found</p>
      </section>
    );
  }

  return (
    <section aria-label="Preflight" role="region" className="flex flex-col gap-2">
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
}

export function AnimationModePropertiesPanel({
  element,
  adapter,
  documentMode,
  onUpdate: _onUpdate,
  timelineName,
  keyframeName,
}: AnimationModePropertiesPanelProps): JSX.Element {
  const profile = getCapabilityProfile(element.type);
  const helperText =
    timelineName !== undefined && keyframeName !== undefined ?
      `Editing timeline ${timelineName} · keyframe ${keyframeName}`
    : 'Editing timeline keyframe values';

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
        <Accordion allowsMultipleExpanded defaultExpandedKeys={['geometry']}>
          <Accordion.Item id="geometry">
            <Accordion.Heading>
              <Accordion.Trigger>Geometry</Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <GeometryPanel
                x={element.x}
                y={element.y}
                width={element.width}
                height={element.height}
                rotation={element.rotation}
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
                  fontFamily={element.fontFamily}
                  fontSize={element.fontSize}
                  fontColor={element.fontColor}
                  fontWeight={element.fontWeight}
                  fontStyle={element.fontStyle}
                  textAlignment={element.textAlignment}
                  verticalAlignment={element.verticalAlignment}
                  textDecoration={element.textDecoration}
                  textTransform={element.textTransform}
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
                  backgroundColor={element.backgroundColor}
                  borderWidth={element.borderWidth}
                  borderColor={element.borderColor}
                  borderStyle={element.borderStyle}
                  borderRadius={element.borderRadius}
                  opacity={element.opacity}
                  blendMode={element.blendMode}
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
