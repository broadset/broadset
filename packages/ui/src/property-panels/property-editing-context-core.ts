import { createContext, useContext } from 'react';

import type { PropertyFieldAdapter } from '../panel-types';

export const PropertyEditingContext = createContext<PropertyFieldAdapter | null>(null);

export function usePropertyEditingAdapter(): PropertyFieldAdapter | null {
  return useContext(PropertyEditingContext);
}
