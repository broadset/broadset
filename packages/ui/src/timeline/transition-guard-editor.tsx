import { Button, Chip, Input, ListBox, Select } from '@heroui/react';
import { Plus, Trash2 } from 'lucide-react';
import type { ChangeEvent, JSX } from 'react';

import { NumField, ToggleSwitch } from '../inputs';
import { color, font, sp } from '../tokens';
import { rowStyle } from './state-machine-editor-styles';
import type {
  GuardClauseDraft,
  GuardDraft,
  GuardLiteralDraft,
  GuardOperandOption,
  GuardOperator,
  GuardValueType,
} from './state-machine-editor-types';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ICON_SIZE = 14;
const INTEGER_LITERAL_STEP = 1;
const NUMBER_LITERAL_STEP = 0.1;
const DEFAULT_GUARD: GuardDraft = { connective: 'all', clauses: [] };

const BOOLEAN_OPERATORS: readonly GuardOperator[] = ['eq', 'neq'];
const FULL_OPERATORS: readonly GuardOperator[] = ['eq', 'neq', 'lt', 'lte', 'gt', 'gte'];

const OPERATOR_LABELS: Readonly<Record<GuardOperator, string>> = {
  eq: 'Equals',
  neq: 'Not equals',
  lt: 'Less than',
  lte: 'Less than or equal',
  gt: 'Greater than',
  gte: 'Greater than or equal',
};

type GuardConnective = GuardDraft['connective'];

const CONNECTIVE_OPTIONS: readonly GuardConnective[] = ['all', 'any'];

const CONNECTIVE_LABELS: Readonly<Record<GuardConnective, string>> = {
  all: 'All',
  any: 'Any',
};

function isGuardOperator(value: string): value is GuardOperator {
  return value === 'eq' || value === 'neq' || value === 'lt' || value === 'lte' || value === 'gt' || value === 'gte';
}

function isGuardConnective(value: string): value is GuardConnective {
  return value === 'all' || value === 'any';
}

/** Per the operator-legality table: boolean operands only support equality; every other supported value type gets full ordering. */
function operatorsForValueType(valueType: GuardValueType): readonly GuardOperator[] {
  return valueType === 'boolean' ? BOOLEAN_OPERATORS : FULL_OPERATORS;
}

/** A type-appropriate default literal for a freshly selected operand, so the emitted clause always infers to boolean. */
function defaultLiteralForValueType(
  valueType: GuardValueType,
  enumValues: readonly string[] | undefined,
): GuardLiteralDraft {
  if (valueType === 'boolean') return { valueType, value: false };
  if (valueType === 'integer' || valueType === 'number') return { valueType, value: 0 };

  const firstEnumValue = enumValues?.[0];

  return { valueType, value: firstEnumValue ?? '' };
}

/** Builds a fresh, valid-by-construction clause referencing `operand`, minting a new local clause id. */
function defaultClauseForOperand(operand: GuardOperandOption): GuardClauseDraft | null {
  const firstOperator = operatorsForValueType(operand.valueType)[0];

  if (firstOperator === undefined) return null;

  return {
    id: crypto.randomUUID(),
    operandId: operand.id,
    operator: firstOperator,
    literal: defaultLiteralForValueType(operand.valueType, operand.enumValues),
  };
}

function replaceClauseAt(
  clauses: readonly GuardClauseDraft[],
  index: number,
  clause: GuardClauseDraft,
): readonly GuardClauseDraft[] {
  return clauses.map((existing, i) => (i === index ? clause : existing));
}

function removeClauseAt(clauses: readonly GuardClauseDraft[], index: number): readonly GuardClauseDraft[] {
  return clauses.filter((_, i) => i !== index);
}

/* ------------------------------------------------------------------ */
/*  Literal editor — switched on the selected operand's valueType      */
/* ------------------------------------------------------------------ */

interface GuardLiteralEditorProps {
  readonly valueType: GuardValueType;
  readonly literal: GuardLiteralDraft;
  readonly enumValues: readonly string[] | undefined;
  readonly onChange: (literal: GuardLiteralDraft) => void;
}

function GuardLiteralEditor({ valueType, literal, enumValues, onChange }: GuardLiteralEditorProps): JSX.Element {
  if (valueType === 'boolean') {
    const boolValue = typeof literal.value === 'boolean' ? literal.value : false;

    return (
      <ToggleSwitch
        ariaLabel="Guard literal"
        isSelected={boolValue}
        onChange={(next) => {
          onChange({ valueType: 'boolean', value: next });
        }}
      />
    );
  }

  if (valueType === 'integer' || valueType === 'number') {
    const numValue = typeof literal.value === 'number' ? literal.value : 0;
    const step = valueType === 'integer' ? INTEGER_LITERAL_STEP : NUMBER_LITERAL_STEP;

    return (
      <NumField
        label="Guard literal"
        step={step}
        value={numValue}
        onChange={(next) => {
          if (valueType === 'integer') {
            const rounded = Math.round(next);

            if (!Number.isSafeInteger(rounded)) return;

            onChange({ valueType: 'integer', value: rounded });

            return;
          }

          onChange({ valueType: 'number', value: next });
        }}
      />
    );
  }

  if (valueType === 'string' && enumValues !== undefined && enumValues.length > 0) {
    const stringValue = typeof literal.value === 'string' ? literal.value : '';

    return (
      <Select
        aria-label="Guard literal"
        value={stringValue}
        onChange={(key) => {
          if (key === null) return;

          onChange({ valueType: 'string', value: String(key) });
        }}
      >
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {enumValues.map((enumValue) => (
              <ListBox.Item id={enumValue} key={enumValue} textValue={enumValue}>
                {enumValue}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
    );
  }

  // Plain string (no enum schema) or date-time: a free-text ISO/string input.
  const textValue = typeof literal.value === 'string' ? literal.value : '';

  return (
    <Input
      aria-label="Guard literal"
      value={textValue}
      onChange={(event: ChangeEvent<HTMLInputElement>) => {
        onChange({ valueType, value: event.currentTarget.value });
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  A single clause row — operand + operator + literal + remove        */
/* ------------------------------------------------------------------ */

interface GuardClauseRowProps {
  readonly transitionId: string;
  readonly clause: GuardClauseDraft;
  readonly index: number;
  readonly operands: readonly GuardOperandOption[];
  readonly onChangeClause: (clause: GuardClauseDraft) => void;
  readonly onRemove: () => void;
}

function GuardClauseRow({
  transitionId,
  clause,
  index,
  operands,
  onChangeClause,
  onRemove,
}: GuardClauseRowProps): JSX.Element {
  const selectedOperand = operands.find((operand) => operand.id === clause.operandId);
  const valueType = selectedOperand?.valueType ?? clause.literal.valueType;
  const operatorOptions = operatorsForValueType(valueType);

  return (
    <div data-testid={`sm-transition-${transitionId}-guard-clause-${String(index)}`} style={rowStyle()}>
      <Select
        aria-label="Guard operand"
        value={clause.operandId}
        onChange={(key) => {
          if (key === null) return;

          const operand = operands.find((candidate) => candidate.id === String(key));

          if (operand === undefined) return;

          const nextClause = defaultClauseForOperand(operand);

          if (nextClause === null) return;

          onChangeClause({ ...nextClause, id: clause.id });
        }}
      >
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {operands.map((operand) => (
              <ListBox.Item id={operand.id} key={operand.id} textValue={operand.label}>
                {operand.label}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>

      <Select
        aria-label="Guard operator"
        value={clause.operator}
        onChange={(key) => {
          if (key === null) return;

          const operatorValue = String(key);

          if (!isGuardOperator(operatorValue)) return;
          if (!operatorOptions.includes(operatorValue)) return;

          onChangeClause({ ...clause, operator: operatorValue });
        }}
      >
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {operatorOptions.map((operator) => (
              <ListBox.Item id={operator} key={operator} textValue={OPERATOR_LABELS[operator]}>
                {OPERATOR_LABELS[operator]}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>

      <GuardLiteralEditor
        enumValues={selectedOperand?.enumValues}
        literal={clause.literal}
        valueType={valueType}
        onChange={(literal) => {
          onChangeClause({ ...clause, literal });
        }}
      />

      <Button
        aria-label="Remove clause"
        data-testid={`sm-transition-${transitionId}-guard-remove-clause-${String(index)}`}
        size="sm"
        variant="danger"
        onPress={onRemove}
      >
        <Trash2 size={ICON_SIZE} />
        Remove
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  TransitionGuardEditor                                              */
/* ------------------------------------------------------------------ */

export interface TransitionGuardEditorProps {
  readonly transitionId: string;
  readonly guard: GuardDraft | undefined;
  readonly guardIsAdvanced: boolean;
  readonly operands: readonly GuardOperandOption[];
  readonly onChange: (guard: GuardDraft) => void;
}

/**
 * Presentational, valid-by-construction editor for one transition's guard predicate: a flat
 * All/Any group of `operand OPERATOR literal` clauses. The operator menu and literal editor are
 * derived from the selected operand's `valueType` (see the operator-legality table in the PR-F
 * contract), which guarantees every emitted guard infers to boolean. A model guard that does not
 * fit this flat shape is surfaced via `guardIsAdvanced` and rendered read-only, preserving it
 * losslessly until the host replaces or clears it.
 */
export function TransitionGuardEditor({
  transitionId,
  guard,
  guardIsAdvanced,
  operands,
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
              onChange({ connective: 'all', clauses: [] });
            }}
          >
            Clear guard
          </Button>
        </div>
      </div>
    );
  }

  const resolvedGuard = guard ?? DEFAULT_GUARD;
  const canAdd = operands.length > 0;

  return (
    <div data-testid={testId} style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-02') }}>
      <span style={{ color: color('muted'), fontSize: font('label') }}>Guard</span>

      <div data-testid={`sm-transition-${transitionId}-guard-connective`} style={rowStyle()}>
        <Select
          aria-label="Guard connective"
          value={resolvedGuard.connective}
          onChange={(key) => {
            if (key === null) return;

            const connective = String(key);

            if (!isGuardConnective(connective)) return;

            onChange({ ...resolvedGuard, connective });
          }}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {CONNECTIVE_OPTIONS.map((option) => (
                <ListBox.Item id={option} key={option} textValue={CONNECTIVE_LABELS[option]}>
                  {CONNECTIVE_LABELS[option]}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>

      {resolvedGuard.clauses.length === 0 && (
        <span style={{ color: color('muted'), fontSize: font('label') }}>No guard (always eligible)</span>
      )}

      {resolvedGuard.clauses.map((clause, index) => (
        <GuardClauseRow
          clause={clause}
          index={index}
          key={clause.id}
          operands={operands}
          transitionId={transitionId}
          onChangeClause={(nextClause) => {
            onChange({ ...resolvedGuard, clauses: replaceClauseAt(resolvedGuard.clauses, index, nextClause) });
          }}
          onRemove={() => {
            onChange({ ...resolvedGuard, clauses: removeClauseAt(resolvedGuard.clauses, index) });
          }}
        />
      ))}

      <Button
        aria-label="Add clause"
        data-testid={`sm-transition-${transitionId}-guard-add-clause`}
        isDisabled={!canAdd}
        size="sm"
        variant="secondary"
        onPress={() => {
          const firstOperand = operands[0];

          if (firstOperand === undefined) return;

          const nextClause = defaultClauseForOperand(firstOperand);

          if (nextClause === null) return;

          onChange({ ...resolvedGuard, clauses: [...resolvedGuard.clauses, nextClause] });
        }}
      >
        <Plus size={ICON_SIZE} />
        Add clause
      </Button>
    </div>
  );
}
