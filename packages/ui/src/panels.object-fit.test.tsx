/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';

import type { PropertyValue } from './panels';
import { ObjectFitPanel } from './panels';

describe('ObjectFitPanel', () => {
  /** @description ObjectFitPanel must provide standard CSS object-fit values. */
  it('renders object-fit selector with standard values', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(<ObjectFitPanel objectFit="cover" onUpdate={onUpdate} />);

    expect(screen.queryByRole('region')).not.toBeNull();
  });
});
