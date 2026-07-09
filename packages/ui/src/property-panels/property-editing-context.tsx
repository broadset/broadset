import { Button } from '@heroui/react';
import type { JSX, ReactNode } from 'react';

import type { PropertyFieldAdapter, PropertyValue } from '../panel-types';
import { PropertyEditingContext, usePropertyEditingAdapter } from './property-editing-context-core';

export interface PropertyEditingProviderProps {
  readonly adapter: PropertyFieldAdapter;
  readonly children: ReactNode;
}

export function PropertyEditingProvider({ adapter, children }: PropertyEditingProviderProps): JSX.Element {
  return <PropertyEditingContext.Provider value={adapter}>{children}</PropertyEditingContext.Provider>;
}

export interface PropertyFieldProps {
  readonly propertyKey: string;
  readonly relatedPropertyKeys?: readonly string[] | undefined;
  readonly defaultValue?: PropertyValue | undefined;
  readonly relatedDefaultValues?: Readonly<Record<string, PropertyValue>> | undefined;
  readonly adapter?: PropertyFieldAdapter | undefined;
  readonly children: JSX.Element;
}

function toLabel(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

export function PropertyField({
  propertyKey,
  relatedPropertyKeys = [],
  defaultValue,
  relatedDefaultValues,
  adapter,
  children,
}: PropertyFieldProps): JSX.Element {
  const contextAdapter = usePropertyEditingAdapter();
  const activeAdapter = adapter ?? contextAdapter;
  const propertyKeys = [propertyKey, ...relatedPropertyKeys];

  if (activeAdapter === null) {
    return (
      <div
        data-property-key={propertyKey}
        data-testid={`property-field-${propertyKey}`}
        style={{ minWidth: 0, width: '100%' }}
      >
        {children}
      </div>
    );
  }

  const included = propertyKeys.some((key) => activeAdapter.isIncluded(key));
  const label = propertyKeys.map(toLabel).join(' / ');

  const resolveDefaultValue = (key: string): PropertyValue => {
    if (key === propertyKey) {
      return defaultValue ?? activeAdapter.getValue(key);
    }

    return relatedDefaultValues?.[key] ?? activeAdapter.getValue(key);
  };

  return (
    <div
      data-disabled={!included ? 'true' : undefined}
      data-property-key={propertyKey}
      data-testid={`property-field-${propertyKey}`}
      style={{ minWidth: 0, width: '100%' }}
    >
      <fieldset disabled={!included} style={{ border: 0, margin: 0, minWidth: 0, padding: 0, width: '100%' }}>
        {children}
      </fieldset>
      <Button
        aria-label={`${included ? 'Remove' : 'Include'} ${label}`}
        size="sm"
        variant="ghost"
        onPress={() => {
          const nextIncluded = !included;

          for (const key of propertyKeys) {
            if (nextIncluded || activeAdapter.isIncluded(key)) {
              activeAdapter.toggleProperty(key, nextIncluded, resolveDefaultValue(key));
            }
          }
        }}
      >
        {included ? 'Remove' : 'Include'}
      </Button>
    </div>
  );
}
