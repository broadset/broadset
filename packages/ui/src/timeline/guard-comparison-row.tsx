import { Button, Input, ListBox, Select } from '@heroui/react';
import { Trash2 } from 'lucide-react';
import type { ChangeEvent, JSX } from 'react';
import { useEffect, useState } from 'react';

import { NumField, ToggleSwitch } from '../inputs';
import { rowStyle } from './state-machine-editor-styles';
import type {
  GuardComparisonDraft,
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

/**
 * A schema-valid ISO-8601 UTC timestamp (passes the model's `utcTimestampSchema`:
 * `z.iso.datetime({ offset: true })` plus its offset-suffix regex). `''` does NOT pass that schema,
 * so a fresh date-time comparison must default to this instead — otherwise
 * `guardDraftToExpression -> upsertTransition -> isValidProject` silently rejects the whole guard
 * edit the instant a date-time operand is selected (see PR-F final review, FIX 1).
 */
const DEFAULT_UTC_TIMESTAMP = '2000-01-01T00:00:00Z';

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

function isGuardOperator(value: string): value is GuardOperator {
  return value === 'eq' || value === 'neq' || value === 'lt' || value === 'lte' || value === 'gt' || value === 'gte';
}

/** Per the operator-legality table: boolean operands only support equality; every other supported value type gets full ordering. */
function operatorsForValueType(valueType: GuardValueType): readonly GuardOperator[] {
  return valueType === 'boolean' ? BOOLEAN_OPERATORS : FULL_OPERATORS;
}

/**
 * A type-appropriate default literal for a freshly selected operand, so the emitted comparison
 * always infers to boolean AND is schema-valid the instant it's created. `date-time` MUST default
 * to {@link DEFAULT_UTC_TIMESTAMP}, never `''` — see that constant's doc for why.
 */
function defaultLiteralForValueType(
  valueType: GuardValueType,
  enumValues: readonly string[] | undefined,
): GuardLiteralDraft {
  if (valueType === 'boolean') return { valueType, value: false };
  if (valueType === 'integer' || valueType === 'number') return { valueType, value: 0 };
  if (valueType === 'date-time') return { valueType, value: DEFAULT_UTC_TIMESTAMP };

  const firstEnumValue = enumValues?.[0];

  return { valueType, value: firstEnumValue ?? '' };
}

interface DefaultComparisonFields {
  readonly operandId: string;
  readonly operator: GuardOperator;
  readonly literal: GuardLiteralDraft;
}

/**
 * The valid-by-construction {@link operandId}/{@link operator}/{@link literal} triple for a freshly
 * selected `operand`, deliberately excluding the comparison `kind`/`id` — call sites disagree on
 * where those come from (a brand-new id when adding a comparison, the existing comparison's id
 * when only the operand changed), so minting them here would either be wrong for one caller or get
 * silently discarded by the other.
 */
export function defaultComparisonFieldsForOperand(operand: GuardOperandOption): DefaultComparisonFields | null {
  const firstOperator = operatorsForValueType(operand.valueType)[0];

  if (firstOperator === undefined) return null;

  return {
    operandId: operand.id,
    operator: firstOperator,
    literal: defaultLiteralForValueType(operand.valueType, operand.enumValues),
  };
}

/* ------------------------------------------------------------------ */
/*  Date-time literal editor — the only literal kind with an external  */
/*  schema constraint (utcTimestampSchema), so it validation-gates     */
/*  onChange instead of emitting every keystroke.                      */
/* ------------------------------------------------------------------ */

interface GuardDateTimeLiteralEditorProps {
  readonly value: string;
  readonly isValidDateTimeLiteral: (value: string) => boolean;
  readonly onChange: (value: string) => void;
}

/**
 * A date-time literal that reaches the committed guard MUST satisfy the model's
 * `utcTimestampSchema` or `guardDraftToExpression -> upsertTransition` silently rejects the whole
 * guard edit (see {@link DEFAULT_UTC_TIMESTAMP}). Buffers keystrokes in local state so the field
 * never blocks typing, but calls `onChange` only once the buffered text passes
 * `isValidDateTimeLiteral` — an invalid draft stays local, marked `aria-invalid`, and never reaches
 * the comparison.
 */
function GuardDateTimeLiteralEditor({
  value,
  isValidDateTimeLiteral,
  onChange,
}: GuardDateTimeLiteralEditorProps): JSX.Element {
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  const isInvalid = !isValidDateTimeLiteral(draftValue);

  return (
    <Input
      aria-invalid={isInvalid || undefined}
      aria-label="Guard literal"
      value={draftValue}
      onChange={(event: ChangeEvent<HTMLInputElement>) => {
        const nextValue = event.currentTarget.value;

        setDraftValue(nextValue);

        if (isValidDateTimeLiteral(nextValue)) onChange(nextValue);
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Literal editor — switched on the selected operand's valueType.     */
/*  Each valueType's editor is its own component so the top-level      */
/*  dispatcher stays a flat, low-complexity switch.                    */
/* ------------------------------------------------------------------ */

interface GuardBooleanLiteralEditorProps {
  readonly literal: GuardLiteralDraft;
  readonly onChange: (literal: GuardLiteralDraft) => void;
}

function GuardBooleanLiteralEditor({ literal, onChange }: GuardBooleanLiteralEditorProps): JSX.Element {
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

interface GuardNumericLiteralEditorProps {
  readonly valueType: Extract<GuardValueType, 'integer' | 'number'>;
  readonly literal: GuardLiteralDraft;
  readonly onChange: (literal: GuardLiteralDraft) => void;
}

function GuardNumericLiteralEditor({ valueType, literal, onChange }: GuardNumericLiteralEditorProps): JSX.Element {
  const numValue = typeof literal.value === 'number' ? literal.value : 0;
  const step = valueType === 'integer' ? INTEGER_LITERAL_STEP : NUMBER_LITERAL_STEP;

  const commitInteger = (next: number): void => {
    const rounded = Math.round(next);

    if (!Number.isSafeInteger(rounded)) return;

    onChange({ valueType: 'integer', value: rounded });
  };

  return (
    <NumField
      label="Guard literal"
      step={step}
      value={numValue}
      onChange={(next) => {
        if (valueType === 'integer') {
          commitInteger(next);

          return;
        }

        onChange({ valueType: 'number', value: next });
      }}
    />
  );
}

interface GuardEnumLiteralEditorProps {
  readonly literal: GuardLiteralDraft;
  readonly enumValues: readonly string[];
  readonly onChange: (literal: GuardLiteralDraft) => void;
}

function GuardEnumLiteralEditor({ literal, enumValues, onChange }: GuardEnumLiteralEditorProps): JSX.Element {
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

interface GuardPlainStringLiteralEditorProps {
  readonly valueType: GuardValueType;
  readonly literal: GuardLiteralDraft;
  readonly onChange: (literal: GuardLiteralDraft) => void;
}

/** Plain string (no enum schema): a free-text input, no external schema constraint to gate on. */
function GuardPlainStringLiteralEditor({
  valueType,
  literal,
  onChange,
}: GuardPlainStringLiteralEditorProps): JSX.Element {
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

interface GuardLiteralEditorProps {
  readonly valueType: GuardValueType;
  readonly literal: GuardLiteralDraft;
  readonly enumValues: readonly string[] | undefined;
  readonly isValidDateTimeLiteral: (value: string) => boolean;
  readonly onChange: (literal: GuardLiteralDraft) => void;
}

function GuardLiteralEditor({
  valueType,
  literal,
  enumValues,
  isValidDateTimeLiteral,
  onChange,
}: GuardLiteralEditorProps): JSX.Element {
  if (valueType === 'boolean') return <GuardBooleanLiteralEditor literal={literal} onChange={onChange} />;

  if (valueType === 'integer' || valueType === 'number') {
    return <GuardNumericLiteralEditor literal={literal} valueType={valueType} onChange={onChange} />;
  }

  if (valueType === 'string' && enumValues !== undefined && enumValues.length > 0) {
    return <GuardEnumLiteralEditor enumValues={enumValues} literal={literal} onChange={onChange} />;
  }

  if (valueType === 'date-time') {
    const dateTimeValue = typeof literal.value === 'string' ? literal.value : '';

    return (
      <GuardDateTimeLiteralEditor
        isValidDateTimeLiteral={isValidDateTimeLiteral}
        value={dateTimeValue}
        onChange={(next) => {
          onChange({ valueType: 'date-time', value: next });
        }}
      />
    );
  }

  return <GuardPlainStringLiteralEditor literal={literal} valueType={valueType} onChange={onChange} />;
}

/* ------------------------------------------------------------------ */
/*  A single comparison row — operand + operator + literal + remove    */
/* ------------------------------------------------------------------ */

interface GuardComparisonRowProps {
  readonly comparison: GuardComparisonDraft;
  readonly operands: readonly GuardOperandOption[];
  readonly isValidDateTimeLiteral: (value: string) => boolean;
  readonly onChange: (comparison: GuardComparisonDraft) => void;
  readonly onRemove: () => void;
}

/**
 * Presentational, valid-by-construction editor for one `operand OPERATOR literal` comparison leaf.
 * The operator menu and literal editor are derived from the selected operand's `valueType` (see
 * the operator-legality table in the PR-F contract), which guarantees every emitted comparison
 * infers to boolean regardless of where it sits in the surrounding guard tree.
 */
export function GuardComparisonRow({
  comparison,
  operands,
  isValidDateTimeLiteral,
  onChange,
  onRemove,
}: GuardComparisonRowProps): JSX.Element {
  const selectedOperand = operands.find((operand) => operand.id === comparison.operandId);
  const valueType = selectedOperand?.valueType ?? comparison.literal.valueType;
  const operatorOptions = operatorsForValueType(valueType);

  return (
    <div data-testid={`sm-guard-comparison-${comparison.id}`} style={rowStyle()}>
      <Select
        aria-label="Guard operand"
        value={comparison.operandId}
        onChange={(key) => {
          if (key === null) return;

          const operand = operands.find((candidate) => candidate.id === String(key));

          if (operand === undefined) return;

          const fields = defaultComparisonFieldsForOperand(operand);

          if (fields === null) return;

          onChange({ kind: 'comparison', id: comparison.id, ...fields });
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
        value={comparison.operator}
        onChange={(key) => {
          if (key === null) return;

          const operatorValue = String(key);

          if (!isGuardOperator(operatorValue)) return;
          if (!operatorOptions.includes(operatorValue)) return;

          onChange({ ...comparison, operator: operatorValue });
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
        isValidDateTimeLiteral={isValidDateTimeLiteral}
        literal={comparison.literal}
        valueType={valueType}
        onChange={(literal) => {
          onChange({ ...comparison, literal });
        }}
      />

      <Button aria-label="Remove condition" size="sm" variant="danger" onPress={onRemove}>
        <Trash2 size={ICON_SIZE} />
        Remove
      </Button>
    </div>
  );
}
