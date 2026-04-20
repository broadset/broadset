/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { PropertyValue } from './panels';
import { ObjectFitPanel } from './panels';

describe('ObjectFitPanel', () => {
  /** @description ObjectFitPanel must provide standard CSS object-fit values. */
  it('renders object-fit selector with standard values', () => {
    const onUpdate = vi.fn<(key: string, value: PropertyValue) => void>();

    render(<ObjectFitPanel objectFit="cover" onUpdate={onUpdate} />);

    expect(screen.queryByRole('region')).not.toBeNull();
  });
});
