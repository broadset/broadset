/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FieldShell } from './panel-types';

describe('FieldShell', () => {
  /** @description Unit 10 requires FieldShell to wire label/help/error semantics to the field via aria-describedby and aria-invalid. */
  it('renders label, description, and error semantics around a field control', () => {
    render(
      <FieldShell
        label="Element name"
        inputId="element-name-input"
        description="Used in layers and timeline"
        error="Name is required"
      >
        <input id="element-name-input" aria-label="Element name" />
      </FieldShell>,
    );

    const field = screen.getByRole('textbox', { name: 'Element name' });
    const description = screen.getByText('Used in layers and timeline');
    const error = screen.getByText('Name is required');

    expect(description.id).toBe('element-name-input-description');
    expect(error.id).toBe('element-name-input-error');
    expect(field.getAttribute('aria-describedby')).toBe('element-name-input-description element-name-input-error');
    expect(field.getAttribute('aria-invalid')).toBe('true');
  });

  /** @description Unit 10 requires optional help and error lines to stay hidden when empty so controls do not render orphan metadata. */
  it('does not render empty description or error metadata', () => {
    render(
      <FieldShell label="Element name" inputId="element-name-input" description="   " error="">
        <input id="element-name-input" aria-label="Element name" />
      </FieldShell>,
    );

    const field = screen.getByRole('textbox', { name: 'Element name' });

    expect(field.getAttribute('aria-describedby')).toBeNull();
    expect(field.getAttribute('aria-invalid')).toBeNull();
  });
});
