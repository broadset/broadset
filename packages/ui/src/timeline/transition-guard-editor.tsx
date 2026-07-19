import { Button, Chip } from '@heroui/react';
import type { JSX } from 'react';

import { color, font, sp } from '../tokens';
import { rowStyle } from './state-machine-editor-styles';
import type { GuardDraft, GuardOperandOption } from './state-machine-editor-types';
import { GuardGroupEditor } from './transition-guard-group-editor';

/**
 * The empty root group rendered when a transition has no guard yet. A fixed placeholder id keeps
 * this constant referentially and structurally stable across renders (its React `key`/testid must
 * not churn); the id is UI-local only — `guardDraftToExpression` never reads it.
 */
const DEFAULT_GUARD: GuardDraft = { kind: 'group', id: 'guard-root', connective: 'all', negated: false, children: [] };

/** Default {@link TransitionGuardEditorProps.isValidDateTimeLiteral}: accepts every candidate literal. */
function acceptAllDateTimeLiterals(): boolean {
  return true;
}

export interface TransitionGuardEditorProps {
  readonly transitionId: string;
  readonly guard: GuardDraft | undefined;
  readonly guardIsAdvanced: boolean;
  readonly operands: readonly GuardOperandOption[];
  /**
   * Injected schema check for a date-time literal's committed text, so this presentational package
   * can validation-gate an ISO timestamp without importing the model's `utcTimestampSchema`
   * directly. Defaults to accepting every value (no gating) when the host doesn't supply one.
   */
  readonly isValidDateTimeLiteral?: (value: string) => boolean;
  readonly onChange: (guard: GuardDraft) => void;
}

/**
 * Presentational, valid-by-construction editor for one transition's guard predicate: a nested
 * AND/OR/NOT tree of `operand OPERATOR literal` comparisons, rendered via the recursive
 * `GuardGroupEditor` starting at the root group. Every comparison leaf's operator menu and literal
 * editor are derived from the selected operand's `valueType`, which guarantees any tree built from
 * them always infers to boolean. A model guard that does not fit this tree shape is surfaced via
 * `guardIsAdvanced` and rendered read-only, preserving it losslessly until the host replaces or
 * clears it.
 */
export function TransitionGuardEditor({
  transitionId,
  guard,
  guardIsAdvanced,
  operands,
  isValidDateTimeLiteral = acceptAllDateTimeLiterals,
  onChange,
}: TransitionGuardEditorProps): JSX.Element {
  const testId = `sm-transition-${transitionId}-guard`;

  if (guardIsAdvanced) {
    return (
      <div data-testid={testId} style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-02') }}>
        <span style={{ color: color('muted'), fontSize: font('label') }}>Guard</span>
        <div style={rowStyle()}>
          <Chip size="sm">Advanced guard (edit not supported)</Chip>
          <Button
            aria-label="Clear guard"
            size="sm"
            variant="secondary"
            onPress={() => {
              onChange({ kind: 'group', id: crypto.randomUUID(), connective: 'all', negated: false, children: [] });
            }}
          >
            Clear guard
          </Button>
        </div>
      </div>
    );
  }

  const resolvedGuard = guard ?? DEFAULT_GUARD;

  return (
    <div data-testid={testId} style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-02') }}>
      <span style={{ color: color('muted'), fontSize: font('label') }}>Guard</span>
      <GuardGroupEditor
        group={resolvedGuard}
        isRoot
        isValidDateTimeLiteral={isValidDateTimeLiteral}
        operands={operands}
        onChange={onChange}
      />
    </div>
  );
}
