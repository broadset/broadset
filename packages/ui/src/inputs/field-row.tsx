import type { CSSProperties, JSX, ReactNode } from 'react';

import { color, sp } from '../tokens';

export interface FieldRowProps {
  /** Short uppercase label (e.g. "FILL", "OPACITY"). Keep under ~12 chars so narrow sidebars don't wrap. */
  readonly label: string;
  /** Optional unit suffix shown as ` · MM`. */
  readonly unit?: string | undefined;
  /** Optional trailing control (e.g. link toggle, add button) rendered at the end of the header row. */
  readonly trailing?: ReactNode;
  /** Content rendered below the header. Omit for trailing-only rows (e.g. a cluster of icon buttons inline with the label). */
  readonly children?: ReactNode;
}

function headerStyle(): CSSProperties {
  return {
    alignItems: 'center',
    color: color('muted'),
    display: 'flex',
    fontSize: '0.6875rem',
    gap: sp('sp-02'),
    letterSpacing: '0.04em',
    minWidth: 0,
    textTransform: 'uppercase',
  };
}

function wrapperStyle(): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: sp('sp-01'),
    minWidth: 0,
    width: '100%',
  };
}

/**
 * FieldRow renders a dense property row: a tiny uppercase header line
 * (`LABEL · UNIT`) with optional trailing controls, then the actual field
 * below. Matches the AxisTriplet header style so the whole properties panel
 * reads as one coherent stack.
 */
export function FieldRow({ label, unit, trailing, children }: FieldRowProps): JSX.Element {
  const unitSuffix = unit !== undefined && unit.length > 0 ? ` · ${unit}` : '';

  return (
    <div style={wrapperStyle()}>
      <div style={headerStyle()}>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
          {unitSuffix}
        </span>
        {trailing !== undefined ?
          <span style={{ alignItems: 'center', display: 'inline-flex', gap: sp('sp-01') }}>{trailing}</span>
        : null}
      </div>
      {children !== undefined && children !== null ?
        <div style={{ minWidth: 0, width: '100%' }}>{children}</div>
      : null}
    </div>
  );
}
