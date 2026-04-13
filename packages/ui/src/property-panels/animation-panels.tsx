import { getCapabilityProfile } from '@broadset/model';
import { Accordion, Button } from '@heroui/react';
import type { JSX, ReactNode } from 'react';
import { useContext } from 'react';

import type { PanelElement, PropertyFieldAdapter } from '../panel-types';
import { AdapterContext } from '../panel-types';
import { color, font, glassPanelStyle, sp } from '../tokens';
import { AppearancePanel, GeometryPanel } from './layout-panels';
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

export interface PropertyFieldProps {
  readonly propertyKey: string;
  readonly adapter?: PropertyFieldAdapter | undefined;
  readonly children: ReactNode;
}

export function PropertyField({ propertyKey, adapter, children }: PropertyFieldProps): JSX.Element {
  const contextAdapter = useContext(AdapterContext);
  const activeAdapter = adapter ?? contextAdapter;

  if (activeAdapter === null) {
    return <div data-property-key={propertyKey}>{children}</div>;
  }

  const included = activeAdapter.isIncluded(propertyKey);
  const currentValue = activeAdapter.getValue(propertyKey);

  return (
    <div data-property-key={propertyKey} data-disabled={!included ? '' : undefined}>
      {children}
      <Button
        aria-label={included ? 'Remove' : 'Include'}
        size="sm"
        variant="ghost"
        onPress={() => {
          activeAdapter.toggleProperty(propertyKey, !included, currentValue);
        }}
      >
        {included ? 'Remove' : 'Include'}
      </Button>
    </div>
  );
}

export interface AnimationModePropertiesPanelProps {
  readonly element: PanelElement;
  readonly adapter: PropertyFieldAdapter;
  readonly documentMode: 'screen' | 'print';
  readonly onUpdate: (key: string, value: string | number) => void;
}

export function AnimationModePropertiesPanel({
  element,
  adapter,
  documentMode,
  onUpdate,
}: AnimationModePropertiesPanelProps): JSX.Element {
  const profile = getCapabilityProfile(element.type);

  return (
    <aside aria-label="Animation Properties" role="region" className="p-3" style={glassPanelStyle()}>
      <AdapterContext.Provider value={adapter}>
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
                onUpdate={onUpdate}
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
                  onUpdate={onUpdate}
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
                  onUpdate={onUpdate}
                />
              </Accordion.Panel>
            </Accordion.Item>
          : null}
        </Accordion>
      </AdapterContext.Provider>
    </aside>
  );
}
