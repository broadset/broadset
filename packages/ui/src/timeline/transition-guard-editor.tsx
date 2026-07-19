import { Button, Chip, Input, ListBox, Select } from '@heroui/react';
import { Plus, Trash2 } from 'lucide-react';
import type { ChangeEvent, JSX } from 'react';
import { useEffect, useState } from 'react';

import { NumField, ToggleSwitch } from '../inputs';
import { color, font, sp } from '../tokens';
import { removeAt, replaceAt } from './editor-array-ops';
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
/**
 * A schema-valid ISO-8601 UTC timestamp (passes the model's `utcTimestampSchema`:
 * `z.iso.datetime({ offset: true })` plus its offset-suffix regex). `''` does NOT pass that schema,
 * so a fresh date-time clause must default to this instead — otherwise
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

/**
 * A type-appropriate default literal for a freshly selected operand, so the emitted clause always
 * infers to boolean AND is schema-valid the instant it's created. `date-time` MUST default to
 * {@link DEFAULT_UTC_TIMESTAMP}, never `''` — see that constant's doc for why.
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

interface DefaultClauseFields {
  readonly operandId: string;
  readonly operator: GuardOperator;
  readonly literal: GuardLiteralDraft;
}

/**
 * The valid-by-construction {@link operandId}/{@link operator}/{@link literal} triple for a freshly
 * selected `operand`, deliberately excluding the clause `id` — the two call sites disagree on where
 * the id comes from (a brand-new id when adding a clause, the existing clause's id when only the
 * operand changed), so minting it here would either be wrong for one caller or get silently
 * discarded by the other.
 */
function defaultClauseFieldsForOperand(operand: GuardOperandOption): DefaultClauseFields | null {
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
 * the clause.
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
/*  A single clause row — operand + operator + literal + remove        */
/* ------------------------------------------------------------------ */

interface GuardClauseRowProps {
  readonly transitionId: string;
  readonly clause: GuardClauseDraft;
  readonly index: number;
  readonly operands: readonly GuardOperandOption[];
  readonly isValidDateTimeLiteral: (value: string) => boolean;
  readonly onChangeClause: (clause: GuardClauseDraft) => void;
  readonly onRemove: () => void;
}

function GuardClauseRow({
  transitionId,
  clause,
  index,
  operands,
  isValidDateTimeLiteral,
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

          const fields = defaultClauseFieldsForOperand(operand);

          if (fields === null) return;

          onChangeClause({ id: clause.id, ...fields });
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
        isValidDateTimeLiteral={isValidDateTimeLiteral}
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
  /**
   * Injected schema check for a date-time literal's committed text, so this presentational package
   * can validation-gate an ISO timestamp without importing the model's `utcTimestampSchema`
   * directly. Defaults to accepting every value (no gating) when the host doesn't supply one.
   */
  readonly isValidDateTimeLiteral?: (value: string) => boolean;
  readonly onChange: (guard: GuardDraft) => void;
}

/** Default {@link TransitionGuardEditorProps.isValidDateTimeLiteral}: accepts every candidate literal. */
function acceptAllDateTimeLiterals(): boolean {
  return true;
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
          isValidDateTimeLiteral={isValidDateTimeLiteral}
          key={clause.id}
          operands={operands}
          transitionId={transitionId}
          onChangeClause={(nextClause) => {
            onChange({ ...resolvedGuard, clauses: replaceAt(resolvedGuard.clauses, index, nextClause) });
          }}
          onRemove={() => {
            onChange({ ...resolvedGuard, clauses: removeAt(resolvedGuard.clauses, index) });
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

          const fields = defaultClauseFieldsForOperand(firstOperand);

          if (fields === null) return;

          const nextClause: GuardClauseDraft = { id: crypto.randomUUID(), ...fields };

          onChange({ ...resolvedGuard, clauses: [...resolvedGuard.clauses, nextClause] });
        }}
      >
        <Plus size={ICON_SIZE} />
        Add clause
      </Button>
    </div>
  );
}
