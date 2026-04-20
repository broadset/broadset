/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PreflightPanel } from './panels';

describe('PreflightPanel', () => {
  /** @description Zero preflight issues must show a success notification. */
  it('shows success when no issues exist', () => {
    render(<PreflightPanel issues={[]} />);

    expect(screen.getByText(/no issues/i)).not.toBeNull();
  });

  /** @description Multiple issues with different severities must be shown in a structured list. */
  it('renders issues with severity types', () => {
    render(
      <PreflightPanel
        issues={[
          { id: '1', severity: 'error', message: 'Font missing' },
          { id: '2', severity: 'warning', message: 'Large file' },
        ]}
      />,
    );

    expect(screen.getByText('Font missing')).not.toBeNull();
    expect(screen.getByText('Large file')).not.toBeNull();
    expect(screen.queryByText(/no issues/i)).toBeNull();
  });

  /** @description Issues with elementName and ruleId must render them as part of the display. */
  it('renders elementName and ruleId when provided', () => {
    render(
      <PreflightPanel
        issues={[
          { id: '1', severity: 'error', message: 'Outside safe area', elementName: 'Title Text', ruleId: 'title-safe' },
        ]}
      />,
    );

    const item = screen.getByRole('listitem');

    expect(item.textContent).toContain('[title-safe]');
    expect(item.textContent).toContain('Title Text');
    expect(item.textContent).toContain('Outside safe area');
  });
});
