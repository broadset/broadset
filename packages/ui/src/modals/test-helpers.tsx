/** @vitest-environment jsdom */

import * as React from 'react';
import { vi } from 'vitest';

import { buildCommonHeroUi } from '../testing/heroui-mock-common';

// Prefixed with `mock` so Vitest's hoist rule lets the vi.mock factory below
// reference the shared primitives without needing an async dynamic import.
const mockCommonHeroUi = buildCommonHeroUi(React);

/* ------------------------------------------------------------------ */
/*  HeroUI mock — all helpers use mock prefix to pass vi.mock hoist    */
/*                                                                    */
/*  SCOPE: this mock intentionally stubs HeroUI chrome to keep unit    */
/*  tests fast and deterministic. Browser-critical behaviors that the  */
/*  real HeroUI provides (focus trap, Tab/Escape semantics, popover    */
/*  portals, ARIA state transitions) are **NOT** reproduced here —     */
/*  they are validated against real HeroUI via Playwright CT in        */
/*  `packages/demo/ct/accessibility/modals-a11y.ct.tsx` and            */
/*  `packages/ui/ct/accessibility/modals-a11y.ct.tsx`.                 */
/*                                                                    */
/*  If you reach for a unit test to verify keyboard navigation,        */
/*  focus order, portal layering, or a11y tree semantics, reach for    */
/*  a CT instead — those concerns are outside this mock's scope.       */
/* ------------------------------------------------------------------ */

const mockNumCtx = React.createContext({
  label: '',
  val: 0,
  cb: undefined as ((n: number) => void) | undefined,
  disabled: false,
});

const mockTableCtx = React.createContext({
  onRowAction: undefined as ((key: string) => void) | undefined,
});

const mockWrap = mockCommonHeroUi.createWrapper;
const mockButton = mockCommonHeroUi.Button;

function mockInput(p: Record<string, unknown>) {
  const { label, onChange, onValueChange, ...rest } = p;

  return React.createElement('input', {
    ...rest,
    'aria-label': p['aria-label'] ?? label,
    onChange: resolveTextInputChangeHandler(onValueChange, onChange),
    value: p['value'] ?? '',
  });
}

function resolveTextInputChangeHandler(
  onValueChange: unknown,
  onChange: unknown,
): ((e: React.ChangeEvent<HTMLInputElement>) => void) | undefined {
  if (typeof onValueChange === 'function') {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      (onValueChange as (v: string) => void)(e.currentTarget.value);
    };
  }

  if (typeof onChange === 'function') return onChange as (e: React.ChangeEvent<HTMLInputElement>) => void;

  return undefined;
}

function mockNumberFieldRoot(p: Record<string, unknown>) {
  const { children, label, maxValue: _maxValue, minValue: _minValue, onChange, isDisabled: _d, ...rest } = p;

  return React.createElement(
    'div',
    rest,
    React.createElement(
      mockNumCtx.Provider,
      {
        value: {
          label: (p['aria-label'] ?? label ?? '') as string,
          val: Number(p['value'] ?? 0),
          cb: typeof onChange === 'function' ? (onChange as (n: number) => void) : undefined,
          disabled: Boolean(p['isDisabled']),
        },
      },
      (children as React.ReactNode) ?? null,
    ),
  );
}

function MockNumberFieldInput(p: Record<string, unknown>) {
  const ctx = React.useContext(mockNumCtx);
  const { maxValue: _maxValue, minValue: _minValue, ...rest } = p;

  return React.createElement('input', {
    ...rest,
    'aria-label': ctx.label,
    disabled: ctx.disabled,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      ctx.cb?.(Number(e.currentTarget.value));
    },
    role: 'spinbutton',
    type: 'number',
    value: String(ctx.val),
  });
}

function mockSlider(p: Record<string, unknown>) {
  const { children, label, maxValue: _maxValue, minValue: _minValue, onChange, ...rest } = p;

  return React.createElement(
    'div',
    { ...rest, 'aria-label': label, role: 'group' },
    React.createElement('input', {
      'aria-label': label,
      type: 'range',
      value: String(Number(p['value'] ?? 0)),
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        if (typeof onChange === 'function') {
          (onChange as (v: number) => void)(Number(e.currentTarget.value));
        }
      },
    }),
    (children as React.ReactNode) ?? null,
  );
}

function mockSwitchBase(p: Record<string, unknown>) {
  const { children, isSelected, onChange, ...rest } = p;

  return React.createElement(
    'label',
    rest,
    React.createElement('input', {
      'aria-label': p['aria-label'],
      checked: Boolean(isSelected),
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        if (typeof onChange === 'function') {
          (onChange as (v: boolean) => void)(e.currentTarget.checked);
        }
      },
      role: 'switch',
      type: 'checkbox',
    }),
    (children as React.ReactNode) ?? null,
  );
}

const mockSwitch = Object.assign(mockSwitchBase, {
  Control: mockWrap('span'),
  Thumb: mockWrap('span'),
  Content: mockWrap('span'),
  Icon: mockWrap('span'),
});

const mockModalCtx = React.createContext({
  onClose: () => {
    // placeholder; replaced by Modal's concrete onClose
  },
});

function mockModal(p: Record<string, unknown>) {
  const { children, isOpen, onClose, onOpenChange, size: _s, ...rest } = p;

  if (!isOpen) return null;

  const dispatchClose = (): void => {
    if (typeof onClose === 'function') (onClose as () => void)();
    else if (typeof onOpenChange === 'function') (onOpenChange as (open: boolean) => void)(false);
  };

  return React.createElement(
    mockModalCtx.Provider,
    { value: { onClose: dispatchClose } },
    React.createElement(
      'div',
      { ...rest, 'aria-modal': 'true', role: 'dialog' },
      (children as React.ReactNode) ?? null,
    ),
  );
}

function MockModalCloseTrigger(p: Record<string, unknown>) {
  const ctx = React.useContext(mockModalCtx);
  const { children, onClick, ...rest } = p;

  return React.createElement(
    'button',
    {
      ...rest,
      'aria-label': p['aria-label'] ?? 'Close',
      type: 'button',
      onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
        if (typeof onClick === 'function') {
          (onClick as (e: React.MouseEvent<HTMLButtonElement>) => void)(event);
        }

        ctx.onClose();
      },
    },
    (children as React.ReactNode) ?? null,
  );
}

function mockKbd(p: Record<string, unknown>) {
  const { children, ...rest } = p;

  return React.createElement('kbd', rest, (children as React.ReactNode) ?? null);
}

function mockSpinner(p: Record<string, unknown>) {
  return React.createElement('div', { ...p, role: 'progressbar' });
}

function mockProgress(p: Record<string, unknown>) {
  const { label, ...rest } = p;

  return React.createElement('div', { ...rest, 'aria-label': label, role: 'progressbar' });
}

function mockTable(p: Record<string, unknown>) {
  const { children, ...rest } = p;

  return React.createElement('table', rest, (children as React.ReactNode) ?? null);
}

function mockTableContent(p: Record<string, unknown>) {
  const { children, onRowAction } = p;

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      mockTableCtx.Provider,
      {
        value: {
          onRowAction: typeof onRowAction === 'function' ? (onRowAction as (key: string) => void) : undefined,
        },
      },
      (children as React.ReactNode) ?? null,
    ),
  );
}

function mockTableHeader(p: Record<string, unknown>) {
  const { children, ...rest } = p;

  return React.createElement('thead', rest, React.createElement('tr', null, (children as React.ReactNode) ?? null));
}

function mockTabs(p: Record<string, unknown>) {
  const { children, onSelectionChange, selectedKey, ...rest } = p;

  return React.createElement(
    'div',
    { ...rest, role: 'tablist' },
    React.createElement('input', {
      'data-testid': 'tabs-selection',
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        if (typeof onSelectionChange === 'function') {
          (onSelectionChange as (v: string) => void)(e.currentTarget.value);
        }
      },
      type: 'text',
      value: typeof selectedKey === 'string' ? selectedKey : '',
    }),
    (children as React.ReactNode | undefined) ?? null,
  );
}

function mockTab(p: Record<string, unknown>) {
  const { children, ...rest } = p;

  return React.createElement('div', { ...rest, role: 'tab' }, (children as React.ReactNode) ?? null);
}

function mockSelect(p: Record<string, unknown>) {
  const { children, label, onChange, onSelectionChange, ...rest } = p;

  return React.createElement(
    'select',
    {
      ...rest,
      'aria-label': label,
      onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
        if (typeof onSelectionChange === 'function') {
          (onSelectionChange as (v: string) => void)(e.currentTarget.value);
        }

        if (typeof onChange === 'function') {
          (onChange as (v: string) => void)(e.currentTarget.value);
        }
      },
    },
    (children as React.ReactNode) ?? null,
  );
}

function mockListBoxItem(p: Record<string, unknown>) {
  const { children, ...rest } = p;

  return React.createElement('option', rest, (children as React.ReactNode) ?? null);
}

function MockTableRow(p: Record<string, unknown>) {
  const tableCtx = React.useContext(mockTableCtx);
  const { children, onPress: _onPress, ...rest } = p;

  return React.createElement(
    'tr',
    {
      ...rest,
      onClick: () => {
        if (typeof p['onPress'] === 'function') {
          (p['onPress'] as () => void)();

          return;
        }

        if (tableCtx.onRowAction !== undefined) {
          const rowId = p['id'];

          if (typeof rowId === 'string' || typeof rowId === 'number') {
            tableCtx.onRowAction(String(rowId));
          }
        }
      },
    },
    (children as React.ReactNode) ?? null,
  );
}

vi.mock('@heroui/react', () => ({
  Button: mockButton,
  ButtonGroup: mockWrap(),
  Input: mockInput,
  Kbd: mockKbd,
  ListBoxItem: mockListBoxItem,
  Modal: Object.assign(mockModal, {
    Backdrop: mockWrap(),
    Container: mockWrap(),
    Dialog: mockWrap(),
    Header: mockWrap('header'),
    Body: mockWrap(),
    Footer: mockWrap('footer'),
    CloseTrigger: MockModalCloseTrigger,
  }),
  NumberField: Object.assign(mockNumberFieldRoot, { Group: mockWrap(), Input: MockNumberFieldInput }),
  Progress: mockProgress,
  ProgressBar: Object.assign(mockProgress, {
    Track: mockWrap(),
    Fill: mockWrap(),
    Output: mockWrap('output'),
  }),
  Select: Object.assign(mockSelect, {
    Trigger: mockWrap(),
    Value: mockWrap('span'),
    Popover: mockWrap(),
  }),
  Slider: Object.assign(mockSlider, { Track: mockWrap(), Fill: mockWrap(), Thumb: mockWrap() }),
  Spinner: mockSpinner,
  Switch: mockSwitch,
  Tab: mockTab,
  Table: Object.assign(mockTable, {
    Content: mockTableContent,
    Header: mockTableHeader,
    Body: mockWrap('tbody'),
    Column: mockWrap('th'),
    Row: MockTableRow,
    Cell: mockWrap('td'),
  }),
  Tabs: Object.assign(mockTabs, { List: mockWrap(), Tab: mockTab }),
}));

/* ------------------------------------------------------------------ */
/*  Mock ./inputs                                                      */
/* ------------------------------------------------------------------ */

function mockNumField(p: Record<string, unknown>) {
  return React.createElement('input', {
    'aria-label': (p['label'] as string | undefined) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      if (typeof p['onChange'] === 'function') {
        (p['onChange'] as (v: number) => void)(Number(e.currentTarget.value));
      }
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      if (typeof p['onCommit'] === 'function') {
        (p['onCommit'] as (v: number) => void)(Number(e.currentTarget.value));
      }
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && typeof p['onCommit'] === 'function') {
        (p['onCommit'] as (v: number) => void)(Number((e.currentTarget as HTMLInputElement).value));
      }
    },
    role: 'spinbutton',
    type: 'number',
    value: String(Number(p['value'] ?? 0)),
  });
}

function mockColorInput(p: Record<string, unknown>) {
  return React.createElement('input', {
    'aria-label': (p['label'] as string | undefined) ?? 'Color',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      if (typeof p['onChange'] === 'function') {
        (p['onChange'] as (v: string) => void)(e.currentTarget.value);
      }
    },
    type: 'text',
    value: (p['value'] as string | undefined) ?? '',
  });
}

function mockToggleSwitch(p: Record<string, unknown>) {
  const ariaLabel = (p['ariaLabel'] as string | undefined) ?? '';

  return React.createElement(
    'label',
    { 'data-ariaLabel': ariaLabel },
    React.createElement('input', {
      'aria-label': ariaLabel,
      checked: Boolean(p['isSelected']),
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        if (typeof p['onChange'] === 'function') {
          (p['onChange'] as (v: boolean) => void)(e.currentTarget.checked);
        }
      },
      role: 'switch',
      type: 'checkbox',
    }),
    (p['children'] as React.ReactNode) ?? null,
  );
}

vi.mock('../inputs', () => ({
  ColorInput: mockColorInput,
  NumField: mockNumField,
  ToggleSwitch: mockToggleSwitch,
}));

/* ================================================================== */
/*  TESTS                                                              */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/*  About Modal                                                        */
/* ------------------------------------------------------------------ */
