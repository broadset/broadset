import { Button, ListBox, Select } from '@heroui/react';
import { Plus, Trash2 } from 'lucide-react';
import type { JSX } from 'react';

import { ToggleSwitch } from '../inputs';
import { color, font, sp } from '../tokens';
import { removeAt, replaceAt } from './editor-array-ops';
import { defaultComparisonFieldsForOperand, GuardComparisonRow } from './guard-comparison-row';
import { rowStyle } from './state-machine-editor-styles';
import type { GuardComparisonDraft, GuardGroupDraft, GuardOperandOption } from './state-machine-editor-types';

const ICON_SIZE = 14;

type GuardConnective = GuardGroupDraft['connective'];

const CONNECTIVE_OPTIONS: readonly GuardConnective[] = ['all', 'any'];

const CONNECTIVE_LABELS: Readonly<Record<GuardConnective, string>> = {
  all: 'All',
  any: 'Any',
};

function isGuardConnective(value: string): value is GuardConnective {
  return value === 'all' || value === 'any';
}

/**
 * The valid-by-construction default comparison for a freshly added node — operands[0], its first
 * legal operator, and a type-default literal (reusing `defaultComparisonFieldsForOperand`, the same
 * logic "Add condition" uses). Returns `null` when there is no operand to default to, matching the
 * disabled-button guard.
 */
function buildDefaultComparison(operands: readonly GuardOperandOption[]): GuardComparisonDraft | null {
  const firstOperand = operands[0];

  if (firstOperand === undefined) return null;

  const fields = defaultComparisonFieldsForOperand(firstOperand);

  if (fields === null) return null;

  return { kind: 'comparison', id: crypto.randomUUID(), ...fields };
}

export interface GuardGroupEditorProps {
  readonly group: GuardGroupDraft;
  /** The root group has no Remove control — clearing the whole guard is done via the host/Clear guard instead. */
  readonly isRoot: boolean;
  readonly operands: readonly GuardOperandOption[];
  readonly isValidDateTimeLiteral: (value: string) => boolean;
  readonly onChange: (group: GuardGroupDraft) => void;
  /** Required for non-root groups (removes this group and all of its children from the parent). */
  readonly onRemove?: () => void;
}

/**
 * Recursive, valid-by-construction editor for one AND/OR/NOT group in a guard tree. Each child is
 * either a {@link GuardComparisonRow} leaf or a nested `GuardGroupEditor`, so nesting depth is
 * unbounded; every update replaces exactly the child at its own array index via `replaceAt`/
 * `removeAt`, which keeps every sibling subtree — at every level — untouched by construction.
 */
export function GuardGroupEditor({
  group,
  isRoot,
  operands,
  isValidDateTimeLiteral,
  onChange,
  onRemove,
}: GuardGroupEditorProps): JSX.Element {
  const canAddNode = operands.length > 0;

  const addCondition = (): void => {
    const nextComparison = buildDefaultComparison(operands);

    if (nextComparison === null) return;

    onChange({ ...group, children: [...group.children, nextComparison] });
  };

  /**
   * A newly appended group is always a NESTED group (a child of `group`, never the tree's root), so
   * it must be seeded with a shape that actually survives `guardDraftToExpression -> expressionToGuard`
   * — the editor is fully controlled from a store-derived `ExpressionAst`, so anything the round trip
   * can't represent is silently pruned before the user could ever edit it. A nested group survives
   * the round trip only if it has a connective DIFFERENT from its parent's with >= 2 children (a
   * distinct `and`/`or` node `unflattenSameConnective` won't merge into the parent), or if it is
   * negated. A single-child, non-negated, same-or-any connective group has no distinct model
   * representation: `guardGroupToExpression` folds one child to just that child's expression, so the
   * group boundary vanishes on the very next re-render. This seeds the OPPOSITE connective with two
   * default comparisons (via the same `defaultComparisonFieldsForOperand` logic "Add condition"
   * uses), which is exactly such a surviving shape.
   */
  const addGroup = (): void => {
    const firstComparison = buildDefaultComparison(operands);
    const secondComparison = buildDefaultComparison(operands);

    if (firstComparison === null || secondComparison === null) return;

    const oppositeConnective: GuardConnective = group.connective === 'all' ? 'any' : 'all';
    const nextGroup: GuardGroupDraft = {
      kind: 'group',
      id: crypto.randomUUID(),
      connective: oppositeConnective,
      negated: false,
      children: [firstComparison, secondComparison],
    };

    onChange({ ...group, children: [...group.children, nextGroup] });
  };

  return (
    <div
      data-testid={`sm-guard-group-${group.id}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: sp('sp-02'),
        ...(isRoot ? {} : { paddingLeft: sp('sp-05'), borderLeft: `1px solid ${color('border')}` }),
      }}
    >
      <div style={rowStyle()}>
        <Select
          aria-label="Guard connective"
          value={group.connective}
          onChange={(key) => {
            if (key === null) return;

            const connective = String(key);

            if (!isGuardConnective(connective)) return;

            onChange({ ...group, connective });
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

        <ToggleSwitch
          ariaLabel="Negate group"
          isSelected={group.negated}
          onChange={(next) => {
            onChange({ ...group, negated: next });
          }}
        >
          NOT
        </ToggleSwitch>

        {!isRoot && onRemove !== undefined && (
          <Button aria-label="Remove group" size="sm" variant="danger" onPress={onRemove}>
            <Trash2 size={ICON_SIZE} />
            Remove group
          </Button>
        )}
      </div>

      {isRoot && group.children.length === 0 && (
        <span style={{ color: color('muted'), fontSize: font('label') }}>No guard (always eligible)</span>
      )}

      {group.children.map((child, index) => {
        if (child.kind === 'comparison') {
          return (
            <GuardComparisonRow
              comparison={child}
              isValidDateTimeLiteral={isValidDateTimeLiteral}
              key={child.id}
              operands={operands}
              onChange={(nextComparison) => {
                onChange({ ...group, children: replaceAt(group.children, index, nextComparison) });
              }}
              onRemove={() => {
                onChange({ ...group, children: removeAt(group.children, index) });
              }}
            />
          );
        }

        return (
          <GuardGroupEditor
            group={child}
            isRoot={false}
            isValidDateTimeLiteral={isValidDateTimeLiteral}
            key={child.id}
            operands={operands}
            onChange={(nextChildGroup) => {
              onChange({ ...group, children: replaceAt(group.children, index, nextChildGroup) });
            }}
            onRemove={() => {
              onChange({ ...group, children: removeAt(group.children, index) });
            }}
          />
        );
      })}

      <div style={rowStyle()}>
        <Button
          aria-label="Add condition"
          data-testid={`sm-guard-add-condition-${group.id}`}
          isDisabled={!canAddNode}
          size="sm"
          variant="secondary"
          onPress={addCondition}
        >
          <Plus size={ICON_SIZE} />
          Add condition
        </Button>

        <Button
          aria-label="Add group"
          data-testid={`sm-guard-add-group-${group.id}`}
          isDisabled={!canAddNode}
          size="sm"
          variant="secondary"
          onPress={addGroup}
        >
          <Plus size={ICON_SIZE} />
          Add group
        </Button>
      </div>
    </div>
  );
}
