import { Button } from '@heroui/react';
import type { JSX, ReactNode } from 'react';
import { createContext, useContext } from 'react';

import type { PropertyFieldAdapter, PropertyValue } from '../panel-types';

const PropertyEditingContext = createContext<PropertyFieldAdapter | null>(null);

export interface PropertyEditingProviderProps {
  readonly adapter: PropertyFieldAdapter;
  readonly children: ReactNode;
}

export function PropertyEditingProvider({ adapter, children }: PropertyEditingProviderProps): JSX.Element {
  return <PropertyEditingContext.Provider value={adapter}>{children}</PropertyEditingContext.Provider>;
}

function usePropertyEditingAdapter(): PropertyFieldAdapter | null {
  return useContext(PropertyEditingContext);
}

export interface PropertyFieldProps {
  readonly propertyKey: string;
  readonly defaultValue?: PropertyValue | undefined;
  readonly adapter?: PropertyFieldAdapter | undefined;
  readonly children: JSX.Element;
}

function toLabel(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

export function PropertyField({ propertyKey, defaultValue, adapter, children }: PropertyFieldProps): JSX.Element {
  const contextAdapter = usePropertyEditingAdapter();
  const activeAdapter = adapter ?? contextAdapter;

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

  const included = activeAdapter.isIncluded(propertyKey);
  const resolvedDefaultValue = defaultValue ?? activeAdapter.getValue(propertyKey);
  const label = toLabel(propertyKey);

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
          activeAdapter.toggleProperty(propertyKey, !included, resolvedDefaultValue);
        }}
      >
        {included ? 'Remove' : 'Include'}
      </Button>
    </div>
  );
}
