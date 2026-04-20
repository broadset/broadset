/**
 * Shared HeroUI mock primitives.
 *
 * Each test-helpers file that calls `vi.mock('@heroui/react', ...)` can delegate
 * to `buildCommonHeroUi(React, options?)` from inside its factory to get the
 * non-context-aware HeroUI wrappers (Button, Card, Kbd, Separator, Chip,
 * Tooltip, Spinner, ListBox, Switch, etc.). Domain-specific, context-aware
 * components (Modal.Dialog with role="dialog", Dropdown with action context,
 * NumberField with label context, Tabs with selection context) stay in each
 * caller's local factory because they carry variant-specific behavior.
 *
 * This module is loaded at factory-call time via dynamic import, so it does
 * not interfere with vi.mock hoisting.
 */
import type * as React from 'react';

export interface CommonHeroUiProps {
  readonly children?: React.ReactNode;
  readonly isDisabled?: boolean | undefined;
  readonly isIconOnly?: boolean | undefined;
  readonly onPress?: (() => void) | undefined;
  readonly onAction?: (() => void) | undefined;
  readonly startContent?: React.ReactNode;
  readonly endContent?: React.ReactNode;
  readonly label?: string | undefined;
  readonly ['aria-label']?: string | undefined;
  readonly [key: string]: unknown;
}

export interface CommonHeroUiOptions {
  /**
   * When true, unknown/non-DOM props are stripped from rendered nodes. Tests
   * that render React components through the mock and care about DOM warnings
   * enable this; lightweight tests leave it off.
   */
  readonly sanitizeDomProps?: boolean;
}

const ALLOWED_EVENT_PROPS = new Set([
  'onBlur',
  'onChange',
  'onClick',
  'onFocus',
  'onInput',
  'onKeyDown',
  'onKeyUp',
  'onMouseDown',
  'onMouseUp',
  'onSubmit',
]);

const ALLOWED_STANDARD_PROPS = new Set([
  'aria-describedby',
  'aria-label',
  'aria-labelledby',
  'aria-selected',
  'aria-pressed',
  'checked',
  'className',
  'disabled',
  'id',
  'name',
  'placeholder',
  'placement',
  'role',
  'style',
  'tabIndex',
  'title',
  'type',
  'value',
]);

function shouldForwardDomProp(name: string): boolean {
  if (name.startsWith('data-') || name.startsWith('aria-')) return true;

  return ALLOWED_EVENT_PROPS.has(name) || ALLOWED_STANDARD_PROPS.has(name);
}

function filterDomProps(props: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(props).filter(([propName]) => shouldForwardDomProp(propName)));
}

function identity(props: Record<string, unknown>): Record<string, unknown> {
  return props;
}

export interface CommonHeroUi {
  readonly Button: (props: CommonHeroUiProps) => React.JSX.Element;
  readonly ButtonGroup: (props: CommonHeroUiProps) => React.JSX.Element;
  readonly Card: (props: CommonHeroUiProps) => React.JSX.Element;
  readonly CardContent: (props: CommonHeroUiProps) => React.JSX.Element;
  readonly CardDescription: (props: CommonHeroUiProps) => React.JSX.Element;
  readonly CardHeader: (props: CommonHeroUiProps) => React.JSX.Element;
  readonly CardTitle: (props: CommonHeroUiProps) => React.JSX.Element;
  readonly Chip: (props: CommonHeroUiProps) => React.JSX.Element;
  readonly Kbd: (props: CommonHeroUiProps) => React.JSX.Element;
  readonly Label: (props: CommonHeroUiProps) => React.JSX.Element;
  readonly ListBox: (props: CommonHeroUiProps) => React.JSX.Element;
  readonly ListBoxItem: (props: CommonHeroUiProps) => React.JSX.Element;
  readonly Separator: (props: CommonHeroUiProps) => React.JSX.Element;
  readonly Spinner: (props: CommonHeroUiProps) => React.JSX.Element;
  readonly Toolbar: (props: CommonHeroUiProps) => React.JSX.Element;
  readonly createWrapper: (tagName?: string) => (props: CommonHeroUiProps) => React.JSX.Element;
}

/**
 * A custom sanitizer a caller can pass in place of the built-in sanitizer.
 * Useful when a specific test-helpers file needs to allow a broader or
 * narrower set of DOM props (e.g. slider/pointer events for inputs).
 */
export type PropSanitizer = (props: Record<string, unknown>) => Record<string, unknown>;

/**
 * Minimal runtime interface we need from React to build the shared primitive
 * mocks. Declared separately so workspace-level @types/react duplication
 * doesn't cause a nominal-identity mismatch between a caller's `typeof React`
 * and this module's.
 */
interface CreateElementCapable {
  createElement(
    tag: string | React.ComponentType<unknown>,
    props: Record<string, unknown> | null,
    ...children: readonly React.ReactNode[]
  ): React.JSX.Element;
}

/**
 * Build the shared HeroUI primitive mocks. Pass the React actual obtained via
 * `await vi.importActual<typeof React>('react')` — not the test module's React
 * import, since this runs inside vi.mock's hoisted factory.
 */
export function buildCommonHeroUi(
  ReactActual: CreateElementCapable,
  options: CommonHeroUiOptions & { readonly sanitize?: PropSanitizer } = {},
): CommonHeroUi {
  const maybeFilter: PropSanitizer =
    options.sanitize ?? (options.sanitizeDomProps === true ? filterDomProps : identity);

  const createWrapper =
    (tagName = 'div') =>
    (props: CommonHeroUiProps): React.JSX.Element => {
      const { children, isIconOnly: _isIconOnly, ...restProps } = props;

      return ReactActual.createElement(tagName, maybeFilter(restProps), children ?? null);
    };

  const Button = (props: CommonHeroUiProps): React.JSX.Element => {
    const { children, isDisabled, isIconOnly: _isIconOnly, onPress, startContent, endContent, ...restProps } = props;
    const onClick = typeof onPress === 'function' ? onPress : undefined;

    return ReactActual.createElement(
      'button',
      { ...maybeFilter(restProps), disabled: isDisabled, onClick },
      startContent ?? null,
      children ?? null,
      endContent ?? null,
    );
  };

  return {
    Button,
    ButtonGroup: createWrapper('div'),
    Card: createWrapper('div'),
    CardContent: createWrapper('div'),
    CardDescription: createWrapper('p'),
    CardHeader: createWrapper('div'),
    CardTitle: createWrapper('h2'),
    Chip: createWrapper('span'),
    Kbd: createWrapper('kbd'),
    Label: createWrapper('span'),
    ListBox: createWrapper('div'),
    ListBoxItem: createWrapper('div'),
    Separator: (props: CommonHeroUiProps): React.JSX.Element =>
      ReactActual.createElement('hr', { role: 'separator', ...maybeFilter(props) }),
    Spinner: createWrapper('div'),
    Toolbar: (props: CommonHeroUiProps): React.JSX.Element => {
      const { children, ...restProps } = props;

      return ReactActual.createElement(
        'div',
        { role: 'toolbar', ...maybeFilter(restProps) },
        children ?? null,
      );
    },
    createWrapper,
  };
}
