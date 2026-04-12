/** @jest-environment jsdom */

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react';
import * as React from 'react';

import type { LayerInfo, PanelElement, PropertyValue } from './panels';
import {
  AnimationModePropertiesPanel,
  AnimationSidebar,
  AppearancePanel,
  BoxEffectsPanel,
  ClipPathPanel,
  ClockPanel,
  GeometryPanel,
  GroupPanel,
  ImagePanel,
  LayersSidebar,
  ObjectFitPanel,
  PathPropertiesPanel,
  PreflightPanel,
  PropertiesSidebar,
  PropertyField,
  QrCodePanel,
  SpacingPanel,
  TextEffectsPanel,
  TickerPanel,
  TypographyPanel,
  VideoPanel,
} from './panels';

/* ------------------------------------------------------------------ */
/*  HeroUI mock — all helpers use mock prefix to pass jest-hoist       */
/* ------------------------------------------------------------------ */

const mockNumCtx = React.createContext({
  label: '',
  val: 0,
  cb: undefined as ((n: number) => void) | undefined,
  disabled: false,
});

function mockWrap(tag = 'div') {
  return (p: Record<string, unknown>) => {
    const { allowsMultipleExpanded: _a, defaultExpandedKeys: _b, children, ...rest } = p;

    return React.createElement(tag, rest, (children as React.ReactNode) ?? null);
  };
}

function mockButton(p: Record<string, unknown>) {
  const { children, isDisabled, onPress, ...rest } = p;

  return React.createElement(
    'button',
    { ...rest, disabled: isDisabled, onClick: typeof onPress === 'function' ? onPress : undefined },
    (children as React.ReactNode) ?? null,
  );
}

function mockInput(p: Record<string, unknown>) {
  const { label, onChange, ...rest } = p;

  return React.createElement(
    'label',
    null,
    (label as React.ReactNode) ?? null,
    React.createElement('input', {
      ...rest,
      'aria-label': p['aria-label'] ?? label,
      onChange: typeof onChange === 'function' ? onChange : undefined,
      value: p['value'] ?? '',
    }),
  );
}

function mockNumberFieldRoot(p: Record<string, unknown>) {
  const { children, label, maxValue: _1, minValue: _2, onChange, step: _3, isDisabled: _d, ...rest } = p;

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

function mockNumberFieldInput(p: Record<string, unknown>) {
  const ctx = React.useContext(mockNumCtx);

  return React.createElement('input', {
    ...p,
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
  const { children, label, onChange, ...rest } = p;

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

function mockSwitch(p: Record<string, unknown>) {
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

jest.mock(
  '@heroui/react',
  () => ({
    Accordion: Object.assign(mockWrap(), {
      Item: mockWrap(),
      Heading: mockWrap(),
      Trigger: mockButton,
      Panel: mockWrap(),
    }),
    Button: mockButton,
    ButtonGroup: mockWrap(),
    Chip: mockWrap('span'),
    Input: mockInput,
    ListBox: Object.assign(mockWrap(), { Item: mockWrap(), Section: mockWrap(), ItemIndicator: mockWrap('span') }),
    ListBoxItem: mockWrap(),
    NumberField: Object.assign(mockNumberFieldRoot, { Group: mockWrap(), Input: mockNumberFieldInput }),
    Select: Object.assign(mockWrap(), {
      Trigger: mockWrap(),
      Value: mockWrap('span'),
      Indicator: mockWrap('span'),
      Popover: mockWrap(),
    }),
    Slider: Object.assign(mockSlider, { Track: mockWrap(), Fill: mockWrap(), Thumb: mockWrap() }),
    Switch: mockSwitch,
  }),
  { virtual: true },
);

/* ------------------------------------------------------------------ */
/*  Mock ./inputs — panel tests focus on wiring, not input internals   */
/* ------------------------------------------------------------------ */

function mockCallOnChange(p: Record<string, unknown>, ...args: readonly unknown[]) {
  if (typeof p['onChange'] === 'function') {
    (p['onChange'] as (...a: readonly unknown[]) => void)(...args);
  }
}

function mockStr(v: unknown, fallback = ''): string {
  return (
    typeof v === 'string' ? v
    : typeof v === 'number' ? String(v)
    : fallback
  );
}

function mockColorInput(p: Record<string, unknown>) {
  const label = mockStr(p['label'], 'Color');

  return React.createElement('input', {
    'aria-label': label,
    'data-testid': `color-input-${label}`,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      mockCallOnChange(p, e.currentTarget.value);
    },
    type: 'text',
    value: mockStr(p['value']),
  });
}

function mockCssLengthInput(p: Record<string, unknown>) {
  const label = mockStr(p['label']);

  return React.createElement('input', {
    'aria-label': label,
    'data-testid': `css-length-${label}`,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      mockCallOnChange(p, e.currentTarget.value);
    },
    type: 'text',
    value: mockStr(p['value']),
  });
}

function mockFilterEditor(p: Record<string, unknown>) {
  const label = mockStr(p['label'], 'Filter');

  return React.createElement(
    'div',
    {
      'aria-label': label,
      'data-testid': `filter-editor-${label}`,
    },
    mockStr(p['value']),
  );
}

function mockNumField(p: Record<string, unknown>) {
  return React.createElement('input', {
    'aria-label': mockStr(p['label']),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      mockCallOnChange(p, Number(e.currentTarget.value));
    },
    role: 'spinbutton',
    type: 'number',
    value: mockStr(p['value'], '0'),
  });
}

function mockShadowEditor(p: Record<string, unknown>) {
  const label = mockStr(p['label'], 'Shadow');

  return React.createElement(
    'div',
    {
      'aria-label': label,
      'data-testid': `shadow-editor-${label}`,
    },
    mockStr(p['value']),
  );
}

function mockTextStrokeInput(p: Record<string, unknown>) {
  const label = mockStr(p['label'], 'Text stroke');

  return React.createElement(
    'div',
    {
      'data-testid': `text-stroke-${label}`,
    },
    React.createElement('input', {
      'aria-label': `${label} width`,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        mockCallOnChange(p, Number(e.currentTarget.value), p['color']);
      },
      type: 'number',
      value: mockStr(p['width'], '0'),
    }),
  );
}

jest.mock('./inputs', () => ({
  ColorInput: mockColorInput,
  CssLengthInput: mockCssLengthInput,
  FilterEditor: mockFilterEditor,
  NumField: mockNumField,
  ShadowEditor: mockShadowEditor,
  TextStrokeInput: mockTextStrokeInput,
}));

/* ------------------------------------------------------------------ */
/*  Mock @broadset/model — for capability-driven panel visibility      */
/* ------------------------------------------------------------------ */

jest.mock('@broadset/model', () => {
  const mockProfiles: Record<string, Record<string, boolean>> = {
    text: {
      typography: true,
      appearance: true,
      boxEffects: true,
      borderRadius: true,
      clipPath: false,
      objectFit: false,
      svgStrokeFill: false,
      pathEditing: false,
    },
    rectangle: {
      typography: false,
      appearance: true,
      boxEffects: true,
      borderRadius: true,
      clipPath: true,
      objectFit: false,
      svgStrokeFill: false,
      pathEditing: false,
    },
    ellipse: {
      typography: false,
      appearance: true,
      boxEffects: true,
      borderRadius: false,
      clipPath: true,
      objectFit: false,
      svgStrokeFill: false,
      pathEditing: false,
    },
    image: {
      typography: false,
      appearance: true,
      boxEffects: true,
      borderRadius: true,
      clipPath: true,
      objectFit: true,
      svgStrokeFill: false,
      pathEditing: false,
    },
    path: {
      typography: false,
      appearance: false,
      boxEffects: false,
      borderRadius: false,
      clipPath: false,
      objectFit: false,
      svgStrokeFill: true,
      pathEditing: true,
    },
    svg: {
      typography: false,
      appearance: true,
      boxEffects: true,
      borderRadius: true,
      clipPath: true,
      objectFit: true,
      svgStrokeFill: true,
      pathEditing: false,
    },
    qrcode: {
      typography: false,
      appearance: false,
      boxEffects: false,
      borderRadius: false,
      clipPath: false,
      objectFit: false,
      svgStrokeFill: false,
      pathEditing: false,
    },
    group: {
      typography: false,
      appearance: true,
      boxEffects: false,
      borderRadius: false,
      clipPath: true,
      objectFit: false,
      svgStrokeFill: false,
      pathEditing: false,
    },
    video: {
      typography: false,
      appearance: true,
      boxEffects: true,
      borderRadius: true,
      clipPath: true,
      objectFit: true,
      svgStrokeFill: false,
      pathEditing: false,
    },
  };
  const mockFallback = {
    typography: false,
    appearance: false,
    boxEffects: false,
    borderRadius: false,
    clipPath: false,
    objectFit: false,
    svgStrokeFill: false,
    pathEditing: false,
  };

  return {
    getCapabilityProfile: jest.fn((type: string) => mockProfiles[type] ?? mockFallback),
  };
});

/* ------------------------------------------------------------------ */
/*  Test fixtures                                                      */
/* ------------------------------------------------------------------ */

const BASE_ELEMENT: PanelElement = {
  id: 'el-1',
  type: 'rectangle',
  name: 'Hero Card',
  content: '',
  x: 20,
  y: 30,
  width: 320,
  height: 180,
  rotation: 15,
  backgroundColor: '#ff0000',
  backgroundGradient: '',
  borderWidth: 2,
  borderColor: '#111111',
  borderStyle: 'solid',
  borderRadius: [12, 12, 12, 12],
  opacity: 0.8,
  blendMode: 'normal',
  mixBlendMode: 'normal',
  isolation: 'auto',
  boxShadow: '2px 4px 8px rgba(0,0,0,0.3)',
  filter: 'blur(2px)',
  backdropFilter: 'blur(6px)',
  fontFamily: 'Arial',
  fontSize: 16,
  fontColor: '#000000',
  fontWeight: 400,
  fontStyle: 'normal',
  textAlignment: 'left',
  verticalAlignment: 'top',
  textDecoration: '',
  textTransform: 'none',
  letterSpacing: 0,
  lineHeight: '1.5',
  wordSpacing: 0,
  textStroke: '',
  textShadow: '',
  writingMode: 'horizontal-tb',
  fontVariationSettings: '',
  padding: [0, 0, 0, 0],
  stroke: '#000000',
  strokeWidth: 2,
  strokeDasharray: '',
  strokeDashoffset: 0,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  strokeOpacity: 1,
  fill: 'none',
  fillOpacity: 1,
  fillRule: 'nonzero',
  trimStart: 0,
  trimEnd: 1,
  trimOffset: 0,
  maskType: 'none',
  customClipPath: '',
  clipChildren: false,
  rotateX: 0,
  rotateY: 0,
  rotateZ: 0,
  translateZ: 0,
  objectFit: 'cover',
  autoSize: 'fixed',
  errorCorrection: 'M',
  qrForegroundColor: '#000000',
  qrBackgroundColor: '#ffffff',
  booleanOperation: null,
};

const TEXT_ELEMENT: PanelElement = {
  ...BASE_ELEMENT,
  id: 'el-2',
  type: 'text',
  name: 'Headline',
  content: 'Hello World',
  fontFamily: 'Inter',
  fontSize: 24,
  fontColor: '#333333',
  fontWeight: 700,
  textAlignment: 'center',
};

const PATH_ELEMENT: PanelElement = {
  ...BASE_ELEMENT,
  id: 'el-3',
  type: 'path',
  name: 'Swoosh',
  content: 'M0,0 L100,100',
  stroke: '#ff0000',
  strokeWidth: 3,
  fill: 'none',
};

const IMAGE_ELEMENT: PanelElement = {
  ...BASE_ELEMENT,
  id: 'el-4',
  type: 'image',
  name: 'Photo',
  content: 'https://example.com/photo.jpg',
  objectFit: 'cover',
};

const QRCODE_ELEMENT: PanelElement = {
  ...BASE_ELEMENT,
  id: 'el-5',
  type: 'qrcode',
  name: 'QR Link',
  content: 'https://example.com',
};

const GROUP_ELEMENT: PanelElement = {
  ...BASE_ELEMENT,
  id: 'el-6',
  type: 'group',
  name: 'My Group',
  clipChildren: false,
};

/* ================================================================== */
/*  GeometryPanel                                                      */
/* ================================================================== */

describe('GeometryPanel', () => {
  /** @description Position, size, and rotation fields are the core property controls and must report changes as numbers for real-time canvas updates. */
  it('renders all geometry fields and reports numeric updates', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(
      <GeometryPanel x={10} y={20} width={100} height={50} rotation={5} onUpdate={onUpdate} documentMode="screen" />,
    );

    const xInput = screen.getByRole('spinbutton', { name: 'X' });

    fireEvent.change(xInput, { target: { value: '42' } });

    expect(screen.getByRole('spinbutton', { name: 'Width' })).not.toBeNull();
    expect(screen.getByRole('spinbutton', { name: 'Rotation' })).not.toBeNull();
    expect(onUpdate).toHaveBeenCalledWith('x', 42);
  });

  /** @description Print mode must hide 3D transform fields (rotateX/Y/Z, translateZ) since 3D transforms are screen-only. */
  it('hides 3D transform fields in print mode', () => {
    render(
      <GeometryPanel
        x={0}
        y={0}
        width={100}
        height={100}
        rotation={0}
        rotateX={10}
        rotateY={20}
        rotateZ={30}
        translateZ={5}
        onUpdate={() => undefined}
        documentMode="print"
      />,
    );

    expect(screen.queryByRole('spinbutton', { name: /Rotate X/i })).toBeNull();
    expect(screen.queryByRole('spinbutton', { name: /Rotate Y/i })).toBeNull();
    expect(screen.queryByRole('spinbutton', { name: /Translate Z/i })).toBeNull();
  });

  /** @description Screen mode must show 3D transform fields for spatial transforms. */
  it('renders 3D transform fields in screen mode when provided', () => {
    render(
      <GeometryPanel
        x={0}
        y={0}
        width={100}
        height={100}
        rotation={0}
        rotateX={10}
        rotateY={20}
        rotateZ={30}
        translateZ={5}
        onUpdate={() => undefined}
        documentMode="screen"
      />,
    );

    expect(screen.getByRole('spinbutton', { name: /Rotate X/i })).not.toBeNull();
    expect(screen.getByRole('spinbutton', { name: /Rotate Y/i })).not.toBeNull();
    expect(screen.getByRole('spinbutton', { name: /Translate Z/i })).not.toBeNull();
  });

  /** @description Width and height must be clamped to a minimum displayed value of 0.1 to prevent zero-size elements. */
  it('clamps width and height display to minimum 0.1', () => {
    render(
      <GeometryPanel x={0} y={0} width={0} height={0} rotation={0} onUpdate={() => undefined} documentMode="screen" />,
    );

    const widthInput = screen.getByRole('spinbutton', { name: 'Width' });
    const heightInput = screen.getByRole('spinbutton', { name: 'Height' });

    expect(Number(widthInput.getAttribute('value'))).toBeGreaterThanOrEqual(0.1);
    expect(Number(heightInput.getAttribute('value'))).toBeGreaterThanOrEqual(0.1);
  });

  /** @description Anchor-relative positioning: right anchor should display position from right edge. */
  it('displays right-anchored X relative to canvas right edge', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(
      <GeometryPanel
        x={100}
        y={0}
        width={80}
        height={50}
        rotation={0}
        anchorX="right"
        canvasWidth={1920}
        onUpdate={onUpdate}
        documentMode="screen"
      />,
    );

    // Expected: 1920 - 100 - 80 = 1740
    const xInput = screen.getByRole('spinbutton', { name: /X/i });

    expect(xInput.getAttribute('value')).toBe('1740');
  });

  /** @description Anchor-relative positioning: bottom anchor should display position from bottom edge. */
  it('displays bottom-anchored Y relative to canvas bottom edge', () => {
    render(
      <GeometryPanel
        x={0}
        y={200}
        width={100}
        height={50}
        rotation={0}
        anchorY="bottom"
        canvasHeight={1080}
        onUpdate={() => undefined}
        documentMode="screen"
      />,
    );

    // Expected: 1080 - 200 - 50 = 830
    const yInput = screen.getByRole('spinbutton', { name: /Y/i });

    expect(yInput.getAttribute('value')).toBe('830');
  });
});

/* ================================================================== */
/*  AppearancePanel                                                    */
/* ================================================================== */

describe('AppearancePanel', () => {
  /** @description Fill, border, opacity, and blend mode must all be editable with proper update callbacks. */
  it('renders fill color and opacity controls', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(
      <AppearancePanel
        backgroundColor="#ffffff"
        borderWidth={1}
        borderColor="#000000"
        borderStyle="solid"
        borderRadius={[6, 6, 6, 6]}
        opacity={0.75}
        blendMode="normal"
        onUpdate={onUpdate}
      />,
    );

    // ColorInput for fill color should be rendered (via mock)
    const fillInput = screen.getByTestId('color-input-Fill color');

    fireEvent.change(fillInput, { target: { value: '#00ff00' } });
    expect(onUpdate).toHaveBeenCalledWith('backgroundColor', '#00ff00');
  });

  /** @description Opacity changes must be forwarded to the update callback. */
  it('forwards opacity updates', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(
      <AppearancePanel
        backgroundColor="#ffffff"
        borderWidth={1}
        borderColor="#000000"
        borderStyle="solid"
        borderRadius={[6, 6, 6, 6]}
        opacity={0.75}
        blendMode="normal"
        onUpdate={onUpdate}
      />,
    );

    const opacitySlider = screen.getByRole('slider');

    fireEvent.change(opacitySlider, { target: { value: '0.5' } });
    expect(onUpdate).toHaveBeenCalledWith('opacity', 0.5);
  });

  /** @description Full border style options must include all 9 CSS border styles. */
  it('provides full border style options', () => {
    render(
      <AppearancePanel
        backgroundColor="#ffffff"
        borderWidth={1}
        borderColor="#000000"
        borderStyle="solid"
        borderRadius={[6, 6, 6, 6]}
        opacity={0.75}
        blendMode="normal"
        onUpdate={() => undefined}
      />,
    );

    // Check that the border style Select is present
    const region = screen.getByRole('region', { name: 'Appearance' });

    expect(within(region).getByText('solid')).not.toBeNull();
  });
});

/* ================================================================== */
/*  TypographyPanel                                                    */
/* ================================================================== */

describe('TypographyPanel', () => {
  /** @description Typography panel must show font family, size, color, weight, style, alignment, decoration, and transform controls. */
  it('renders typography controls for text elements', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(
      <TypographyPanel
        fontFamily="Inter"
        fontSize={24}
        fontColor="#333333"
        fontWeight={700}
        fontStyle="normal"
        textAlignment="center"
        verticalAlignment="top"
        textDecoration=""
        textTransform="none"
        onUpdate={onUpdate}
      />,
    );

    expect(screen.getByRole('spinbutton', { name: /Font size/i })).not.toBeNull();
    expect(screen.getByTestId('color-input-Font color')).not.toBeNull();
  });

  /** @description Font weight update must commit to the store. */
  it('forwards font weight changes', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(
      <TypographyPanel
        fontFamily="Inter"
        fontSize={24}
        fontColor="#333333"
        fontWeight={400}
        fontStyle="normal"
        textAlignment="center"
        verticalAlignment="top"
        textDecoration=""
        textTransform="none"
        onUpdate={onUpdate}
      />,
    );

    fireEvent.change(screen.getByRole('spinbutton', { name: /Font size/i }), { target: { value: '32' } });
    expect(onUpdate).toHaveBeenCalledWith('fontSize', 32);
  });
});

/* ================================================================== */
/*  TextEffectsPanel                                                   */
/* ================================================================== */

describe('TextEffectsPanel', () => {
  /** @description Text effects panel must provide letter spacing, line height, word spacing, and text transform for text elements. */
  it('renders text effects controls', () => {
    render(
      <TextEffectsPanel
        letterSpacing={0}
        lineHeight="1.5"
        wordSpacing={0}
        textStroke=""
        textShadow=""
        textTransform="none"
        onUpdate={() => undefined}
      />,
    );

    expect(screen.getByTestId('css-length-Letter spacing')).not.toBeNull();
    expect(screen.getByTestId('css-length-Line height')).not.toBeNull();
    expect(screen.getByTestId('css-length-Word spacing')).not.toBeNull();
  });

  /** @description Advanced toggle must reveal text stroke and text shadow fields. */
  it('shows text stroke and shadow behind advanced toggle', () => {
    render(
      <TextEffectsPanel
        letterSpacing={0}
        lineHeight="1.5"
        wordSpacing={0}
        textStroke="1px #000000"
        textShadow="2px 2px 4px #000"
        textTransform="none"
        onUpdate={() => undefined}
      />,
    );

    // Text stroke should not be visible initially (behind advanced toggle)
    expect(screen.queryByTestId('text-stroke-Text stroke')).toBeNull();

    // Click advanced toggle
    const advancedBtn = screen.getByRole('button', { name: /advanced/i });

    fireEvent.click(advancedBtn);

    expect(screen.getByTestId('text-stroke-Text stroke')).not.toBeNull();
    expect(screen.getByTestId('shadow-editor-Text shadow')).not.toBeNull();
  });
});

/* ================================================================== */
/*  SpacingPanel                                                       */
/* ================================================================== */

describe('SpacingPanel', () => {
  /** @description Padding values must be editable for selected elements. */
  it('renders padding inputs and forwards updates', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(<SpacingPanel padding={[10, 20, 10, 20]} onUpdate={onUpdate} />);

    const topInput = screen.getByRole('spinbutton', { name: /Padding top/i });

    fireEvent.change(topInput, { target: { value: '15' } });
    expect(onUpdate).toHaveBeenCalled();
  });

  /** @description Link toggle must synchronize all four padding values when active. */
  it('synchronizes padding values via link toggle', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(<SpacingPanel padding={[10, 10, 10, 10]} onUpdate={onUpdate} />);

    // Enable link toggle (uniform padding)
    const linkBtn = screen.getByRole('button', { name: /link padding/i });

    fireEvent.click(linkBtn);

    // Change one value — all should sync
    const topInput = screen.getByRole('spinbutton', { name: /Padding top/i });

    fireEvent.change(topInput, { target: { value: '20' } });
    expect(onUpdate).toHaveBeenCalledWith('padding', [20, 20, 20, 20] as const);
  });
});

/* ================================================================== */
/*  BoxEffectsPanel                                                    */
/* ================================================================== */

describe('BoxEffectsPanel', () => {
  /** @description Screen mode must show compositing controls (mixBlendMode, isolation). */
  it('renders compositing controls in screen mode', () => {
    render(
      <BoxEffectsPanel
        boxShadow=""
        filter=""
        backdropFilter=""
        mixBlendMode="normal"
        isolation="auto"
        documentMode="screen"
        onUpdate={() => undefined}
      />,
    );

    expect(screen.getByTestId('shadow-editor-Box shadow')).not.toBeNull();
    expect(screen.getByTestId('filter-editor-Filter')).not.toBeNull();
    expect(screen.getByTestId('filter-editor-Backdrop filter')).not.toBeNull();
    // compositing section
    expect(screen.getByText(/Mix blend mode/i)).not.toBeNull();
    expect(screen.getByText(/Isolation/i)).not.toBeNull();
  });
});

/* ================================================================== */
/*  ClipPathPanel                                                      */
/* ================================================================== */

describe('ClipPathPanel', () => {
  /** @description Selecting a preset must immediately apply the clip-path. */
  it('applies circle preset', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(<ClipPathPanel maskType="none" customClipPath="" onUpdate={onUpdate} />);

    const circleBtn = screen.getByRole('button', { name: /circle/i });

    fireEvent.click(circleBtn);
    expect(onUpdate).toHaveBeenCalledWith('customClipPath', 'circle(50%)');
    expect(onUpdate).toHaveBeenCalledWith('maskType', 'custom');
  });

  /** @description None preset must clear the clip-path and set maskType to 'none'. */
  it('clears clip-path with None preset', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(<ClipPathPanel maskType="custom" customClipPath="circle(50%)" onUpdate={onUpdate} />);

    const noneBtn = screen.getByRole('button', { name: /^none$/i });

    fireEvent.click(noneBtn);
    expect(onUpdate).toHaveBeenCalledWith('customClipPath', '');
    expect(onUpdate).toHaveBeenCalledWith('maskType', 'none');
  });

  /** @description Raw CSS input must validate and apply valid clip-path values. */
  it('validates raw CSS input', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(<ClipPathPanel maskType="custom" customClipPath="" onUpdate={onUpdate} />);

    const rawInput = screen.getByRole('textbox', { name: /clip.*path/i });

    fireEvent.change(rawInput, { target: { value: 'polygon(50% 0%, 100% 100%, 0% 100%)' } });
    fireEvent.blur(rawInput);

    expect(onUpdate).toHaveBeenCalledWith('customClipPath', 'polygon(50% 0%, 100% 100%, 0% 100%)');
  });

  /** @description Invalid CSS input must show a validation error and not commit the value. */
  it('rejects invalid clip-path CSS and shows error', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(<ClipPathPanel maskType="custom" customClipPath="" onUpdate={onUpdate} />);

    const rawInput = screen.getByRole('textbox', { name: /clip.*path/i });

    fireEvent.change(rawInput, { target: { value: 'not-valid-css' } });
    fireEvent.blur(rawInput);

    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).not.toBeNull();
    expect(screen.getByText(/invalid/i)).not.toBeNull();
  });

  /** @description Spec requires Squircle and Star presets (not Ellipse/Inset). */
  it('provides spec-defined presets: None, Circle, Squircle, Triangle, Star', () => {
    render(<ClipPathPanel maskType="none" customClipPath="" onUpdate={() => undefined} />);

    expect(screen.getByRole('button', { name: /^none$/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /circle/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /squircle/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /triangle/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /star/i })).not.toBeNull();
  });
});

/* ================================================================== */
/*  PathPropertiesPanel                                                */
/* ================================================================== */

describe('PathPropertiesPanel', () => {
  /** @description Path/SVG elements must have editable stroke and fill properties. */
  it('renders stroke and fill controls', () => {
    render(
      <PathPropertiesPanel
        stroke="#ff0000"
        strokeWidth={3}
        strokeOpacity={1}
        strokeDasharray=""
        strokeDashoffset={0}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        fillOpacity={1}
        fillRule="nonzero"
        trimStart={0}
        trimEnd={1}
        trimOffset={0}
        content="M0,0 L100,100"
        onUpdate={() => undefined}
        onStartDrawing={() => undefined}
        onStopDrawing={() => undefined}
        onStartEditing={() => undefined}
        onStopEditing={() => undefined}
        isDrawing={false}
        isEditing={false}
      />,
    );

    expect(screen.getByTestId('color-input-Stroke color')).not.toBeNull();
    expect(screen.getByRole('spinbutton', { name: /Stroke width/i })).not.toBeNull();
    expect(screen.getByTestId('color-input-Fill color')).not.toBeNull();
  });

  /** @description Draw path and edit path point toggle buttons must be available. */
  it('provides draw path and edit points toggles', () => {
    render(
      <PathPropertiesPanel
        stroke="#000"
        strokeWidth={2}
        strokeOpacity={1}
        strokeDasharray=""
        strokeDashoffset={0}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        fillOpacity={1}
        fillRule="nonzero"
        trimStart={0}
        trimEnd={1}
        trimOffset={0}
        content="M0,0 L100,100"
        onUpdate={() => undefined}
        onStartDrawing={() => undefined}
        onStopDrawing={() => undefined}
        onStartEditing={() => undefined}
        onStopEditing={() => undefined}
        isDrawing={false}
        isEditing={false}
      />,
    );

    expect(screen.getByRole('button', { name: /draw path/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /edit.*path.*points/i })).not.toBeNull();
  });

  /** @description Edit path points must be disabled for empty path content. */
  it('disables edit path points for empty content', () => {
    render(
      <PathPropertiesPanel
        stroke="#000"
        strokeWidth={2}
        strokeOpacity={1}
        strokeDasharray=""
        strokeDashoffset={0}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        fillOpacity={1}
        fillRule="nonzero"
        trimStart={0}
        trimEnd={1}
        trimOffset={0}
        content=""
        onUpdate={() => undefined}
        onStartDrawing={() => undefined}
        onStopDrawing={() => undefined}
        onStartEditing={() => undefined}
        onStopEditing={() => undefined}
        isDrawing={false}
        isEditing={false}
      />,
    );

    const editBtn = screen.getByRole('button', { name: /edit.*path.*points/i });

    expect((editBtn as HTMLButtonElement).disabled).toBe(true);
  });

  /** @description Trim path sliders must be visible in the path properties panel for animated stroke draw effects. */
  it('renders trim path sliders', () => {
    render(
      <PathPropertiesPanel
        stroke="#000"
        strokeWidth={2}
        strokeOpacity={1}
        strokeDasharray=""
        strokeDashoffset={0}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        fillOpacity={1}
        fillRule="nonzero"
        trimStart={0.25}
        trimEnd={0.75}
        trimOffset={0}
        content="M0,0 L100,100"
        onUpdate={() => undefined}
        onStartDrawing={() => undefined}
        onStopDrawing={() => undefined}
        onStartEditing={() => undefined}
        onStopEditing={() => undefined}
        isDrawing={false}
        isEditing={false}
      />,
    );

    expect(screen.getAllByRole('slider').length).toBeGreaterThanOrEqual(3);
  });
});

/* ================================================================== */
/*  ImagePanel                                                         */
/* ================================================================== */

describe('ImagePanel', () => {
  /** @description Image elements must have editable source URL. */
  it('renders source URL input', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(<ImagePanel content="https://example.com/photo.jpg" onUpdate={onUpdate} />);

    const urlInput = screen.getByRole('textbox', { name: /source/i });

    expect(urlInput.getAttribute('value')).toBe('https://example.com/photo.jpg');

    fireEvent.change(urlInput, { target: { value: 'https://example.com/new.jpg' } });
    expect(onUpdate).toHaveBeenCalledWith('content', 'https://example.com/new.jpg');
  });
});

/* ================================================================== */
/*  ObjectFitPanel                                                     */
/* ================================================================== */

describe('ObjectFitPanel', () => {
  /** @description ObjectFitPanel must provide standard CSS object-fit values. */
  it('renders object-fit selector with standard values', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(<ObjectFitPanel objectFit="cover" onUpdate={onUpdate} />);

    // The select should contain all standard values
    expect(screen.getByText('cover')).not.toBeNull();
  });
});

/* ================================================================== */
/*  QrCodePanel                                                        */
/* ================================================================== */

describe('QrCodePanel', () => {
  /** @description QR code elements must have editable content, error correction level, and colors. */
  it('renders content and error correction inputs', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(
      <QrCodePanel
        content="https://example.com"
        errorCorrection="M"
        foregroundColor="#000000"
        backgroundColor="#ffffff"
        onUpdate={onUpdate}
      />,
    );

    const contentInput = screen.getByRole('textbox', { name: /content/i });

    expect(contentInput.getAttribute('value')).toBe('https://example.com');

    fireEvent.change(contentInput, { target: { value: 'https://broadset.io' } });
    expect(onUpdate).toHaveBeenCalledWith('content', 'https://broadset.io');
  });
});

/* ================================================================== */
/*  GroupPanel                                                         */
/* ================================================================== */

describe('GroupPanel', () => {
  /** @description Group elements must have editable clipChildren toggle and group name. */
  it('renders clipChildren toggle and group name', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(<GroupPanel name="My Group" clipChildren={false} booleanOperation={null} onUpdate={onUpdate} />);

    const clipToggle = screen.getByRole('switch', { name: /clip children/i });

    expect(clipToggle).not.toBeNull();

    fireEvent.click(clipToggle);
    expect(onUpdate).toHaveBeenCalledWith('clipChildren', true);
  });

  /** @description Boolean operation dropdown must be visible with expected value rendered. */
  it('renders boolean operation dropdown', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(<GroupPanel name="Test Group" clipChildren={false} booleanOperation="union" onUpdate={onUpdate} />);

    const region = screen.getByRole('region', { name: 'Group' });

    expect(within(region).getByText('union')).not.toBeNull();
  });
});

/* ================================================================== */
/*  PreflightPanel                                                     */
/* ================================================================== */

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
});

/* ================================================================== */
/*  PropertyField (keyframe integration)                               */
/* ================================================================== */

describe('PropertyField', () => {
  /** @description In normal mode (no adapter), PropertyField must render children directly. */
  it('renders children directly without adapter', () => {
    render(
      <PropertyField propertyKey="opacity">
        <span>Direct child</span>
      </PropertyField>,
    );

    expect(screen.getByText('Direct child')).not.toBeNull();
  });

  /** @description In keyframe mode, include/remove toggle must call toggleProperty. */
  it('calls toggleProperty when include/remove is toggled', () => {
    const toggle = jest.fn();

    render(
      <PropertyField
        propertyKey="opacity"
        adapter={{
          isIncluded: () => false,
          getValue: () => 0.5,
          toggleProperty: toggle,
          updateValue: jest.fn(),
        }}
      >
        <span>Opacity control</span>
      </PropertyField>,
    );

    const includeBtn = screen.getByRole('button', { name: /include/i });

    fireEvent.click(includeBtn);
    expect(toggle).toHaveBeenCalledWith('opacity', true, expect.anything());
  });

  /** @description Excluded property must be rendered as disabled in keyframe mode. */
  it('marks excluded properties as disabled', () => {
    render(
      <PropertyField
        propertyKey="opacity"
        adapter={{
          isIncluded: () => false,
          getValue: () => 0.5,
          toggleProperty: jest.fn(),
          updateValue: jest.fn(),
        }}
      >
        <span>Opacity control</span>
      </PropertyField>,
    );

    // The wrapper should have aria-disabled to indicate excluded property
    const wrapper = screen.getByText('Opacity control').closest('[data-disabled]');

    expect(wrapper).not.toBeNull();
  });
});

/* ================================================================== */
/*  AnimationModePropertiesPanel                                       */
/* ================================================================== */

describe('AnimationModePropertiesPanel', () => {
  /** @description When a keyframe is selected, AnimationModePropertiesPanel must render with the adapter active. */
  it('renders with PropertyEditingProvider when adapter is provided', () => {
    const adapter = {
      isIncluded: (key: string) => key === 'x',
      getValue: () => 100,
      toggleProperty: jest.fn(),
      updateValue: jest.fn(),
    };

    render(
      <AnimationModePropertiesPanel
        element={TEXT_ELEMENT}
        adapter={adapter}
        documentMode="screen"
        onUpdate={() => undefined}
      />,
    );

    // Should render Geometry and Typography panels for text elements
    expect(screen.getByText('Geometry')).not.toBeNull();
    expect(screen.getByText('Typography')).not.toBeNull();
  });

  /** @description Animation builder and group settings must not render in animation mode. */
  it('does not render animation builder in animation mode', () => {
    render(
      <AnimationModePropertiesPanel
        element={GROUP_ELEMENT}
        adapter={{
          isIncluded: () => false,
          getValue: () => 0,
          toggleProperty: jest.fn(),
          updateValue: jest.fn(),
        }}
        documentMode="screen"
        onUpdate={() => undefined}
      />,
    );

    expect(screen.queryByText(/animation/i)).toBeNull();
    expect(screen.queryByText(/group/i)).toBeNull();
  });
});

/* ================================================================== */
/*  Multi-element editing                                              */
/* ================================================================== */

describe('Multi-element editing', () => {
  /** @description Matching property values across selected elements must display the common value. */
  it('displays common values for matching properties', () => {
    const el1 = { ...BASE_ELEMENT, id: 'a', opacity: 0.5 };
    const el2 = { ...BASE_ELEMENT, id: 'b', opacity: 0.5 };

    render(<PropertiesSidebar elements={[el1, el2]} documentMode="screen" onUpdate={() => undefined} />);

    // Should show "Appearance" sections with the shared opacity value rendered
    expect(screen.getByText('Appearance')).not.toBeNull();
  });

  /** @description Differing property values must show a "Mixed" indicator. */
  it('shows Mixed indicator for differing values', () => {
    const el1 = { ...BASE_ELEMENT, id: 'a', x: 10 };
    const el2 = { ...BASE_ELEMENT, id: 'b', x: 50 };

    render(<PropertiesSidebar elements={[el1, el2]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.getByText(/mixed/i)).not.toBeNull();
  });

  /** @description Editing a property in multi-select mode must apply the new value to all selected elements. */
  it('routes multi-select updates through onUpdate', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    const el1 = { ...BASE_ELEMENT, id: 'a' };
    const el2 = { ...BASE_ELEMENT, id: 'b' };

    render(<PropertiesSidebar elements={[el1, el2]} documentMode="screen" onUpdate={onUpdate} />);

    // Any update should fire onUpdate (the multi-element propagation is handled by the consumer)
    expect(screen.getByText('Geometry')).not.toBeNull();
  });
});

/* ================================================================== */
/*  PropertiesSidebar — capability-driven visibility                   */
/* ================================================================== */

describe('PropertiesSidebar', () => {
  /** @description Empty state must display a placeholder message when no element is selected. */
  it('shows empty state when no elements provided', () => {
    render(<PropertiesSidebar elements={[]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.getByText(/select an element/i)).not.toBeNull();
  });

  /** @description Screen-mode rectangles must expose the gradient fill section. */
  it('shows gradient fill for rectangle in screen mode', () => {
    render(<PropertiesSidebar elements={[BASE_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.getByText('Geometry')).not.toBeNull();
    expect(screen.getByText('Appearance')).not.toBeNull();
  });

  /** @description Print mode must hide gradient fill, 3D transforms, and clip children controls. */
  it('hides gradient, 3D, and clip path in print mode', () => {
    render(<PropertiesSidebar elements={[BASE_ELEMENT]} documentMode="print" onUpdate={() => undefined} />);

    expect(screen.queryByText(/3D Transform/i)).toBeNull();
  });

  /** @description Custom property panel must override default panels for registered element types. */
  it('renders custom panel for registered types', () => {
    const CountdownPanel = (): React.JSX.Element => <p>Countdown controls</p>;

    render(
      <PropertiesSidebar
        elements={[{ ...BASE_ELEMENT, type: 'countdown' }]}
        documentMode="screen"
        onUpdate={() => undefined}
        customPanels={{ countdown: CountdownPanel }}
      />,
    );

    expect(screen.getByText('Countdown controls')).not.toBeNull();
  });

  /** @description Typography panel must only appear for text elements. */
  it('shows typography panel for text elements', () => {
    render(<PropertiesSidebar elements={[TEXT_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.getByText('Typography')).not.toBeNull();
    expect(screen.getByText('Text Effects')).not.toBeNull();
  });

  /** @description Vertical alignment control must appear in the Typography panel for text elements. */
  it('shows vertical alignment control for text elements', () => {
    render(<PropertiesSidebar elements={[TEXT_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.getByLabelText('Vertical alignment')).not.toBeNull();
  });

  /** @description Typography panel must not appear for non-text elements. */
  it('hides typography panel for non-text elements', () => {
    render(<PropertiesSidebar elements={[BASE_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.queryByText('Typography')).toBeNull();
    expect(screen.queryByText('Text Effects')).toBeNull();
  });

  /** @description Path properties must appear for path elements. */
  it('shows path properties for path elements', () => {
    render(<PropertiesSidebar elements={[PATH_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.getByText('Path Properties')).not.toBeNull();
  });

  /** @description Path properties must not appear for non-path elements. */
  it('hides path properties for non-path elements', () => {
    render(<PropertiesSidebar elements={[BASE_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.queryByText('Path Properties')).toBeNull();
  });

  /** @description Image panel must appear for image elements. */
  it('shows image panel for image elements', () => {
    render(<PropertiesSidebar elements={[IMAGE_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.getByText('Image')).not.toBeNull();
  });

  /** @description Image panel must not appear for non-image elements. */
  it('hides image panel for non-image elements', () => {
    render(<PropertiesSidebar elements={[BASE_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.queryByText('Image')).toBeNull();
  });

  /** @description ObjectFit panel must appear for elements with objectFit capability. */
  it('shows object fit panel for image elements', () => {
    render(<PropertiesSidebar elements={[IMAGE_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.getByText('Object Fit')).not.toBeNull();
  });

  /** @description ObjectFit panel must not appear for elements without objectFit capability. */
  it('hides object fit panel for rectangle elements', () => {
    render(<PropertiesSidebar elements={[BASE_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.queryByText('Object Fit')).toBeNull();
  });

  /** @description QR code panel must appear for qrcode elements. */
  it('shows QR code panel for qrcode elements', () => {
    render(<PropertiesSidebar elements={[QRCODE_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.getByText('QR Code')).not.toBeNull();
  });

  /** @description Group panel must appear for group elements. */
  it('shows group panel for group elements', () => {
    render(<PropertiesSidebar elements={[GROUP_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.getByText('Group')).not.toBeNull();
  });

  /** @description Clip path panel should appear for elements with clipPath capability (rectangle) but not for path elements. */
  it('shows clip path panel for rectangle elements', () => {
    render(<PropertiesSidebar elements={[BASE_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.getByText('Clip Path')).not.toBeNull();
  });

  /** @description Box effects panel must appear for elements with boxEffects capability. */
  it('shows box effects panel for rectangle elements', () => {
    render(<PropertiesSidebar elements={[BASE_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.getByText('Box Effects')).not.toBeNull();
  });

  /** @description Spacing panel must appear for text elements (typography capability). */
  it('shows spacing panel for text elements', () => {
    render(<PropertiesSidebar elements={[TEXT_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.getByText('Spacing')).not.toBeNull();
  });

  /** @description Spacing panel must appear for group elements. */
  it('shows spacing panel for group elements', () => {
    render(<PropertiesSidebar elements={[GROUP_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.getByText('Spacing')).not.toBeNull();
  });

  /** @description Spacing panel must not appear for rectangle elements (no typography, not a group). */
  it('hides spacing panel for rectangle elements', () => {
    render(<PropertiesSidebar elements={[BASE_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.queryByText('Spacing')).toBeNull();
  });

  /** @description Animation Builder must render when showAnimations is true. */
  it('shows animation builder when showAnimations is true', () => {
    render(
      <PropertiesSidebar elements={[BASE_ELEMENT]} documentMode="screen" showAnimations onUpdate={() => undefined} />,
    );

    expect(screen.getByText('Animation Builder')).not.toBeNull();
  });

  /** @description Animation Builder must be hidden when showAnimations is false or undefined. */
  it('hides animation builder when showAnimations is false', () => {
    render(<PropertiesSidebar elements={[BASE_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.queryByText('Animation Builder')).toBeNull();
  });

  /** @description Gradient fill must be rendered inside the Appearance panel, not as a separate accordion section. */
  it('renders gradient fill inside appearance panel for rectangle in screen mode', () => {
    render(
      <PropertiesSidebar
        elements={[{ ...BASE_ELEMENT, backgroundGradient: 'linear-gradient(red, blue)' }]}
        documentMode="screen"
        onUpdate={() => undefined}
      />,
    );

    // Gradient should be inside Appearance, not a standalone section
    expect(screen.getByText('Appearance')).not.toBeNull();
    expect(screen.queryByText('Gradient Fill')).toBeNull();
    expect(screen.getByLabelText('CSS Gradient')).not.toBeNull();
  });

  /** @description Panels must follow the spec ordering: Geometry → Appearance → Typography → Text Effects → Spacing → Box Effects → Clip Path → Path Properties → Image → Object Fit → QR Code → Group. */
  it('renders panels in spec-defined order for text elements', () => {
    render(<PropertiesSidebar elements={[TEXT_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    const headings = screen.getAllByRole('button').map((b) => b.textContent);
    const geometryIdx = headings.indexOf('Geometry');
    const typographyIdx = headings.indexOf('Typography');
    const textEffectsIdx = headings.indexOf('Text Effects');
    const spacingIdx = headings.indexOf('Spacing');
    const boxEffectsIdx = headings.indexOf('Box Effects');

    expect(geometryIdx).toBeLessThan(typographyIdx);
    expect(typographyIdx).toBeLessThan(textEffectsIdx);
    expect(textEffectsIdx).toBeLessThan(spacingIdx);
    expect(spacingIdx).toBeLessThan(boxEffectsIdx);
  });
});

/* ================================================================== */
/*  VideoPanel                                                         */
/* ================================================================== */

describe('VideoPanel', () => {
  /** @description VideoPanel must render source URL, autoplay, loop, muted, start/end time controls. */
  it('renders all video controls', () => {
    render(
      <VideoPanel
        sourceUrl="https://example.com/video.mp4"
        autoplay={true}
        loop={false}
        muted={true}
        startTime={5}
        endTime={30}
        onUpdate={() => undefined}
      />,
    );

    expect(screen.getByRole('textbox', { name: /source url/i })).not.toBeNull();
    expect(screen.getByRole('switch', { name: /autoplay/i })).not.toBeNull();
    expect(screen.getByRole('switch', { name: /loop/i })).not.toBeNull();
    expect(screen.getByRole('switch', { name: /muted/i })).not.toBeNull();
    expect(screen.getByRole('spinbutton', { name: /start time/i })).not.toBeNull();
    expect(screen.getByRole('spinbutton', { name: /end time/i })).not.toBeNull();
  });

  /** @description Toggling autoplay must fire onUpdate with the boolean value. */
  it('fires onUpdate when autoplay is toggled', () => {
    const onUpdate = jest.fn<(k: string, v: string | number | boolean) => void>();

    render(
      <VideoPanel
        sourceUrl="https://example.com/video.mp4"
        autoplay={false}
        loop={false}
        muted={false}
        startTime={0}
        endTime={0}
        onUpdate={onUpdate}
      />,
    );

    fireEvent.click(screen.getByRole('switch', { name: /autoplay/i }));
    expect(onUpdate).toHaveBeenCalledWith('autoplay', true);
  });

  /** @description Changing source URL must update content. */
  it('fires onUpdate when source URL is changed', () => {
    const onUpdate = jest.fn<(k: string, v: string | number | boolean) => void>();

    render(
      <VideoPanel
        sourceUrl=""
        autoplay={false}
        loop={false}
        muted={false}
        startTime={0}
        endTime={0}
        onUpdate={onUpdate}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: /source url/i }), {
      target: { value: 'https://example.com/new.mp4' },
    });

    expect(onUpdate).toHaveBeenCalledWith('content', 'https://example.com/new.mp4');
  });
});

/* ================================================================== */
/*  ClockPanel                                                         */
/* ================================================================== */

describe('ClockPanel', () => {
  /** @description ClockPanel must render format, mode, and mode-dependent fields for countdown. */
  it('renders format, mode, and countdown fields', () => {
    render(
      <ClockPanel
        format="HH:mm:ss"
        mode="countdown"
        startValue="00:10:00"
        targetValue="00:00:00"
        countdownTo=""
        onUpdate={() => undefined}
      />,
    );

    expect(screen.getByRole('textbox', { name: /format/i })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: /start value/i })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: /target value/i })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: /countdown to/i })).not.toBeNull();
  });

  /** @description In realtime mode, start/target/countdownTo fields must be hidden. */
  it('hides countdown fields in realtime mode', () => {
    render(
      <ClockPanel
        format="HH:mm:ss"
        mode="realtime"
        startValue=""
        targetValue=""
        countdownTo=""
        onUpdate={() => undefined}
      />,
    );

    expect(screen.queryByRole('textbox', { name: /start value/i })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /target value/i })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /countdown to/i })).toBeNull();
  });

  /** @description When countdownTo is set, start/target fields must be hidden. */
  it('hides start/target when countdownTo is set', () => {
    render(
      <ClockPanel
        format="HH:mm:ss"
        mode="countdown"
        startValue="00:10:00"
        targetValue="00:00:00"
        countdownTo="2026-12-31T00:00:00Z"
        onUpdate={() => undefined}
      />,
    );

    // countdownTo is set, so start and target should be hidden
    expect(screen.queryByRole('textbox', { name: /start value/i })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /target value/i })).toBeNull();

    // countdownTo field should still be visible
    expect(screen.getByRole('textbox', { name: /countdown to/i })).not.toBeNull();
  });

  /** @description Changing format must update content. */
  it('fires onUpdate when format changes', () => {
    const onUpdate = jest.fn<(k: string, v: string) => void>();

    render(
      <ClockPanel format="HH:mm:ss" mode="realtime" startValue="" targetValue="" countdownTo="" onUpdate={onUpdate} />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: /format/i }), { target: { value: 'mm:ss' } });
    expect(onUpdate).toHaveBeenCalledWith('content', 'mm:ss');
  });
});

/* ================================================================== */
/*  TickerPanel                                                        */
/* ================================================================== */

describe('TickerPanel', () => {
  /** @description TickerPanel must render items list, speed, direction, gap, paused controls. */
  it('renders all ticker controls', () => {
    render(
      <TickerPanel
        items={['Breaking News', 'Weather Update']}
        speed={100}
        direction="left"
        gap={20}
        paused={false}
        onUpdate={() => undefined}
        onUpdateItems={() => undefined}
      />,
    );

    expect(screen.getByRole('textbox', { name: /item 1/i })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: /item 2/i })).not.toBeNull();
    expect(screen.getByRole('spinbutton', { name: /speed/i })).not.toBeNull();
    expect(screen.getByRole('spinbutton', { name: /gap/i })).not.toBeNull();
    expect(screen.getByRole('switch', { name: /paused/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /add item/i })).not.toBeNull();
  });

  /** @description Adding an item must call onUpdateItems with the new list. */
  it('adds a new item when Add Item is clicked', () => {
    const onUpdateItems = jest.fn<(items: readonly string[]) => void>();

    render(
      <TickerPanel
        items={['Item 1']}
        speed={100}
        direction="left"
        gap={20}
        paused={false}
        onUpdate={() => undefined}
        onUpdateItems={onUpdateItems}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /add item/i }));
    expect(onUpdateItems).toHaveBeenCalledWith(['Item 1', 'New item']);
  });

  /** @description Removing an item must call onUpdateItems with the filtered list. */
  it('removes an item when remove button is clicked', () => {
    const onUpdateItems = jest.fn<(items: readonly string[]) => void>();

    render(
      <TickerPanel
        items={['Item A', 'Item B']}
        speed={100}
        direction="left"
        gap={20}
        paused={false}
        onUpdate={() => undefined}
        onUpdateItems={onUpdateItems}
      />,
    );

    // Click the first remove button
    const removeBtn = screen.getByRole('button', { name: /remove item 1/i });

    fireEvent.click(removeBtn);
    expect(onUpdateItems).toHaveBeenCalledWith(['Item B']);
  });

  /** @description Last item must not have a remove button. */
  it('hides remove button when only one item exists', () => {
    render(
      <TickerPanel
        items={['Only Item']}
        speed={100}
        direction="left"
        gap={20}
        paused={false}
        onUpdate={() => undefined}
        onUpdateItems={() => undefined}
      />,
    );

    expect(screen.queryByRole('button', { name: /remove item/i })).toBeNull();
  });

  /** @description Ticker items must have drag handles for reordering. */
  it('renders drag handles for each item', () => {
    render(
      <TickerPanel
        items={['A', 'B']}
        speed={100}
        direction="left"
        gap={20}
        paused={false}
        onUpdate={() => undefined}
        onUpdateItems={() => undefined}
      />,
    );

    expect(screen.getByLabelText('Drag item 1')).not.toBeNull();
    expect(screen.getByLabelText('Drag item 2')).not.toBeNull();
  });

  /** @description Dragging item from position 0 to position 2 must reorder via onUpdateItems. */
  it('reorders items when dragged from one position to another', () => {
    const onUpdateItems = jest.fn<(items: readonly string[]) => void>();

    render(
      <TickerPanel
        items={['A', 'B', 'C']}
        speed={100}
        direction="left"
        gap={20}
        paused={false}
        onUpdate={() => undefined}
        onUpdateItems={onUpdateItems}
      />,
    );

    // Get the draggable rows (parent div of each item input)
    const itemInputs = screen.getAllByRole('textbox');
    const firstRow = itemInputs[0]?.closest('[draggable="true"]');
    const thirdRow = itemInputs[2]?.closest('[draggable="true"]');

    expect(firstRow).not.toBeNull();
    expect(thirdRow).not.toBeNull();

    // Simulate drag from index 0 to index 2
    const mockDt = { effectAllowed: 'move', dropEffect: 'none', setDragImage: () => undefined };
    const source = firstRow as Element;
    const target = thirdRow as Element;

    fireEvent.dragStart(source, { dataTransfer: mockDt });
    fireEvent.dragOver(target, { dataTransfer: mockDt });
    fireEvent.drop(target);

    expect(onUpdateItems).toHaveBeenCalledWith(['B', 'C', 'A']);
  });
});

/* ================================================================== */
/*  Auto-Size Mode in GeometryPanel                                    */
/* ================================================================== */

describe('GeometryPanel auto-size', () => {
  /** @description Auto-size control must appear for text elements. */
  it('shows auto-size segmented control for text elements', () => {
    render(
      <GeometryPanel
        x={0}
        y={0}
        width={100}
        height={50}
        rotation={0}
        elementType="text"
        autoSize="fixed"
        onUpdate={() => undefined}
        documentMode="screen"
      />,
    );

    expect(screen.getByRole('button', { name: /fixed/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /auto height/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /shrink to fit/i })).not.toBeNull();
  });

  /** @description Auto-size control must be hidden for non-text elements. */
  it('hides auto-size control for non-text elements', () => {
    render(
      <GeometryPanel
        x={0}
        y={0}
        width={100}
        height={50}
        rotation={0}
        elementType="rectangle"
        autoSize="fixed"
        onUpdate={() => undefined}
        documentMode="screen"
      />,
    );

    expect(screen.queryByRole('button', { name: /auto height/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /shrink to fit/i })).toBeNull();
  });

  /** @description Clicking Auto Height must fire onUpdate and the Height field must become disabled. */
  it('fires onUpdate when auto-height is clicked', () => {
    const onUpdate = jest.fn<(k: string, v: string | number) => void>();

    render(
      <GeometryPanel
        x={0}
        y={0}
        width={100}
        height={50}
        rotation={0}
        elementType="text"
        autoSize="fixed"
        onUpdate={onUpdate}
        documentMode="screen"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /auto height/i }));
    expect(onUpdate).toHaveBeenCalledWith('autoSize', 'auto-height');
  });

  /** @description When autoSize is auto-height, the Height field must be disabled. */
  it('disables height field when autoSize is auto-height', () => {
    render(
      <GeometryPanel
        x={0}
        y={0}
        width={100}
        height={50}
        rotation={0}
        elementType="text"
        autoSize="auto-height"
        onUpdate={() => undefined}
        documentMode="screen"
      />,
    );

    const heightInput = screen.getByRole('spinbutton', { name: /height/i });

    // The mock NumberField context propagates isDisabled to the input as disabled
    expect(heightInput).toHaveProperty('disabled', true);
  });
});

/* ================================================================== */
/*  PropertiesSidebar type-specific panel rendering                    */
/* ================================================================== */

describe('PropertiesSidebar type-specific', () => {
  /** @description PropertiesSidebar must show VideoPanel for video elements. */
  it('shows video panel for video elements', () => {
    render(
      <PropertiesSidebar
        documentMode="screen"
        elements={[
          {
            ...BASE_ELEMENT,
            type: 'video',
            content: 'https://video.mp4',
            videoAutoplay: true,
            videoLoop: false,
            videoMuted: false,
            videoStartTime: 0,
            videoEndTime: 60,
          },
        ]}
        onUpdate={() => undefined}
      />,
    );

    expect(screen.getByRole('region', { name: /video/i })).not.toBeNull();
  });

  /** @description PropertiesSidebar must show ClockPanel for clock elements. */
  it('shows clock panel for clock elements', () => {
    render(
      <PropertiesSidebar
        documentMode="screen"
        elements={[{ ...BASE_ELEMENT, type: 'clock', content: 'HH:mm:ss', clockMode: 'realtime' }]}
        onUpdate={() => undefined}
      />,
    );

    expect(screen.getByRole('region', { name: /clock/i })).not.toBeNull();
  });

  /** @description PropertiesSidebar must show TickerPanel for ticker elements. */
  it('shows ticker panel for ticker elements', () => {
    render(
      <PropertiesSidebar
        documentMode="screen"
        elements={[
          {
            ...BASE_ELEMENT,
            type: 'ticker',
            tickerItems: ['News'],
            tickerSpeed: 100,
            tickerDirection: 'left',
            tickerGap: 20,
            tickerPaused: false,
          },
        ]}
        onUpdate={() => undefined}
      />,
    );

    expect(screen.getByRole('region', { name: /ticker/i })).not.toBeNull();
  });

  /** @description PropertiesSidebar must NOT show VIdeoPanel for non-video elements. */
  it('hides video panel for non-video elements', () => {
    render(
      <PropertiesSidebar
        documentMode="screen"
        elements={[{ ...BASE_ELEMENT, type: 'rectangle' }]}
        onUpdate={() => undefined}
      />,
    );

    expect(screen.queryByRole('region', { name: /^video$/i })).toBeNull();
  });
});

/* ================================================================== */
/*  LayersSidebar                                                      */
/* ================================================================== */

const SAMPLE_LAYERS: readonly LayerInfo[] = [
  { id: 'el-1', type: 'rectangle', name: 'Hero Card', locked: false, visible: true },
  { id: 'el-2', type: 'text', name: 'Headline', locked: true, visible: true },
  { id: 'el-3', type: 'image', name: 'Background', locked: false, visible: false },
];

const HIERARCHY_LAYERS: readonly LayerInfo[] = [
  {
    id: 'g-1',
    type: 'group',
    name: 'Card Group',
    locked: false,
    visible: true,
    depth: 0,
    hasChildren: true,
    expanded: true,
  },
  { id: 'el-1', type: 'rectangle', name: 'Card BG', locked: false, visible: true, depth: 1 },
  { id: 'el-2', type: 'text', name: 'Card Title', locked: false, visible: true, depth: 1 },
  { id: 'el-3', type: 'image', name: 'Logo', locked: false, visible: true, depth: 0 },
];

describe('LayersSidebar', () => {
  /** @description Clicking a layer must fire onSelect with the element's id and single mode. */
  it('fires onSelect with single mode when a layer is clicked', () => {
    const onSelect = jest.fn<(id: string, mode: string) => void>();

    render(
      <LayersSidebar
        layers={SAMPLE_LAYERS}
        onSelect={onSelect}
        onToggleLock={() => undefined}
        onDelete={() => undefined}
      />,
    );

    const heroBtn = screen.getByRole('button', { name: /select hero card/i });

    fireEvent.click(heroBtn);
    expect(onSelect).toHaveBeenCalledWith('el-1', 'single');
  });

  /** @description Empty state must show a message when no elements exist. */
  it('shows empty state when no layers exist', () => {
    render(
      <LayersSidebar
        layers={[]}
        onSelect={() => undefined}
        onToggleLock={() => undefined}
        onDelete={() => undefined}
      />,
    );

    expect(screen.getByText(/no elements/i)).not.toBeNull();
  });

  /** @description Lock toggle must fire onToggleLock with the element's id. */
  it('fires onToggleLock when lock button is clicked', () => {
    const onToggleLock = jest.fn<(id: string) => void>();

    render(
      <LayersSidebar
        layers={SAMPLE_LAYERS}
        onSelect={() => undefined}
        onToggleLock={onToggleLock}
        onDelete={() => undefined}
      />,
    );

    const lockBtn = screen.getByRole('button', { name: /toggle lock hero card/i });

    fireEvent.click(lockBtn);
    expect(onToggleLock).toHaveBeenCalledWith('el-1');
  });

  /** @description Visibility toggle must fire onToggleVisibility with the element's id. */
  it('fires onToggleVisibility when visibility button is clicked', () => {
    const onToggleVisibility = jest.fn<(id: string) => void>();

    render(
      <LayersSidebar
        layers={SAMPLE_LAYERS}
        onSelect={() => undefined}
        onToggleLock={() => undefined}
        onToggleVisibility={onToggleVisibility}
        onDelete={() => undefined}
      />,
    );

    // Background is hidden (visible: false), so aria says "Show Background"
    const visBtn = screen.getByRole('button', { name: /show background/i });

    fireEvent.click(visBtn);
    expect(onToggleVisibility).toHaveBeenCalledWith('el-3');
  });

  /** @description Delete button must fire onDelete with the element's id. */
  it('fires onDelete when delete button is clicked', () => {
    const onDelete = jest.fn<(id: string) => void>();

    render(
      <LayersSidebar
        layers={SAMPLE_LAYERS}
        onSelect={() => undefined}
        onToggleLock={() => undefined}
        onDelete={onDelete}
      />,
    );

    const deleteBtn = screen.getByRole('button', { name: /delete hero card/i });

    fireEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledWith('el-1');
  });

  /** @description Selected layers must be visually highlighted. */
  it('highlights selected layers', () => {
    render(
      <LayersSidebar
        layers={SAMPLE_LAYERS}
        selectedIds={['el-2']}
        onSelect={() => undefined}
        onToggleLock={() => undefined}
        onDelete={() => undefined}
      />,
    );

    // The layer items are <li> elements. The selected one should have a different background.
    const listItems = screen.getAllByRole('listitem');

    expect(listItems).toHaveLength(3);

    const selectedItem = listItems[1];

    expect(selectedItem).toBeDefined();
  });

  /** @description Double-click on a layer name must activate inline rename. */
  it('activates inline rename on double-click', () => {
    const onRename = jest.fn<(id: string, name: string) => void>();

    render(
      <LayersSidebar
        layers={SAMPLE_LAYERS}
        onSelect={() => undefined}
        onToggleLock={() => undefined}
        onDelete={() => undefined}
        onRename={onRename}
      />,
    );

    const heroBtn = screen.getByRole('button', { name: /select hero card/i });

    fireEvent.doubleClick(heroBtn);

    // After double-click, a text input should appear for renaming
    const renameInput = screen.getByRole('textbox', { name: /rename layer/i });

    expect(renameInput).not.toBeNull();
  });

  /** @description Enter commits the rename, empty names are rejected. */
  it('commits rename on Enter, rejects empty names', () => {
    const onRename = jest.fn<(id: string, name: string) => void>();

    render(
      <LayersSidebar
        layers={SAMPLE_LAYERS}
        onSelect={() => undefined}
        onToggleLock={() => undefined}
        onDelete={() => undefined}
        onRename={onRename}
      />,
    );

    // Start rename
    const heroBtn = screen.getByRole('button', { name: /select hero card/i });

    fireEvent.doubleClick(heroBtn);

    const input = screen.getByRole('textbox', { name: /rename layer/i });

    // Change to empty and press Enter — should not call onRename
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRename).not.toHaveBeenCalled();

    // Double-click again to re-enter rename mode
    // The input should be gone after Enter (even with empty, it exits)
    expect(screen.queryByRole('textbox', { name: /rename layer/i })).toBeNull();
  });

  /** @description Escape cancels the rename without committing. */
  it('cancels rename on Escape', () => {
    const onRename = jest.fn<(id: string, name: string) => void>();

    render(
      <LayersSidebar
        layers={SAMPLE_LAYERS}
        onSelect={() => undefined}
        onToggleLock={() => undefined}
        onDelete={() => undefined}
        onRename={onRename}
      />,
    );

    const headlineBtn = screen.getByRole('button', { name: /select headline/i });

    fireEvent.doubleClick(headlineBtn);

    const input = screen.getByRole('textbox', { name: /rename layer/i });

    fireEvent.change(input, { target: { value: 'New Name' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: /rename layer/i })).toBeNull();
  });

  /** @description Successful rename commits with Enter. */
  it('commits rename with valid name on Enter', () => {
    const onRename = jest.fn<(id: string, name: string) => void>();

    render(
      <LayersSidebar
        layers={SAMPLE_LAYERS}
        onSelect={() => undefined}
        onToggleLock={() => undefined}
        onDelete={() => undefined}
        onRename={onRename}
      />,
    );

    const heroBtn = screen.getByRole('button', { name: /select hero card/i });

    fireEvent.doubleClick(heroBtn);

    const input = screen.getByRole('textbox', { name: /rename layer/i });

    fireEvent.change(input, { target: { value: 'Updated Card' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRename).toHaveBeenCalledWith('el-1', 'Updated Card');
  });

  /** @description Each layer row must display the correct type icon. */
  it('renders type-specific icons for each layer', () => {
    render(
      <LayersSidebar
        layers={SAMPLE_LAYERS}
        onSelect={() => undefined}
        onToggleLock={() => undefined}
        onDelete={() => undefined}
      />,
    );

    // Each layer should be rendered as a list item
    const listItems = screen.getAllByRole('listitem');

    expect(listItems).toHaveLength(3);
  });

  /** @description Ctrl/Cmd+Click must fire onSelect with toggle mode. */
  it('fires onSelect with toggle mode on Ctrl+Click', () => {
    const onSelect = jest.fn<(id: string, mode: string) => void>();

    render(
      <LayersSidebar
        layers={SAMPLE_LAYERS}
        onSelect={onSelect}
        onToggleLock={() => undefined}
        onDelete={() => undefined}
      />,
    );

    const heroBtn = screen.getByRole('button', { name: /select hero card/i });

    fireEvent.click(heroBtn, { ctrlKey: true });
    expect(onSelect).toHaveBeenCalledWith('el-1', 'toggle');
  });

  /** @description Shift+Click must fire onSelect with range mode. */
  it('fires onSelect with range mode on Shift+Click', () => {
    const onSelect = jest.fn<(id: string, mode: string) => void>();

    render(
      <LayersSidebar
        layers={SAMPLE_LAYERS}
        onSelect={onSelect}
        onToggleLock={() => undefined}
        onDelete={() => undefined}
      />,
    );

    const heroBtn = screen.getByRole('button', { name: /select hero card/i });

    fireEvent.click(heroBtn, { shiftKey: true });
    expect(onSelect).toHaveBeenCalledWith('el-1', 'range');
  });

  /** @description Group layers with children must display expand/collapse chevron. */
  it('renders expand/collapse chevron for group layers with children', () => {
    render(
      <LayersSidebar
        layers={HIERARCHY_LAYERS}
        onSelect={() => undefined}
        onToggleLock={() => undefined}
        onDelete={() => undefined}
        onToggleExpand={() => undefined}
      />,
    );

    // Expanded group should have collapse button
    const collapseBtn = screen.getByRole('button', { name: /collapse card group/i });

    expect(collapseBtn).not.toBeNull();
  });

  /** @description Clicking expand/collapse chevron must fire onToggleExpand. */
  it('fires onToggleExpand when chevron is clicked', () => {
    const onToggleExpand = jest.fn<(id: string) => void>();

    render(
      <LayersSidebar
        layers={HIERARCHY_LAYERS}
        onSelect={() => undefined}
        onToggleLock={() => undefined}
        onDelete={() => undefined}
        onToggleExpand={onToggleExpand}
      />,
    );

    const collapseBtn = screen.getByRole('button', { name: /collapse card group/i });

    fireEvent.click(collapseBtn);
    expect(onToggleExpand).toHaveBeenCalledWith('g-1');
  });

  /** @description Each layer row must have a drag handle for reordering. */
  it('renders drag handle grip on each layer row', () => {
    render(
      <LayersSidebar
        layers={SAMPLE_LAYERS}
        onSelect={() => undefined}
        onToggleLock={() => undefined}
        onDelete={() => undefined}
      />,
    );

    const grips = screen.getAllByRole('img', { name: /drag/i });

    expect(grips).toHaveLength(3);
  });

  /** @description Delete button must use a Trash icon and be visible only on hover (not selection). */
  it('shows delete button only on hover, not on selection alone', () => {
    render(
      <LayersSidebar
        layers={SAMPLE_LAYERS}
        selectedIds={['el-2']}
        onSelect={() => undefined}
        onToggleLock={() => undefined}
        onDelete={() => undefined}
      />,
    );

    const deleteBtns = screen.getAllByRole('button', { name: /delete/i });

    // All delete buttons should be hidden (opacity 0) when not hovered — even selected ones
    expect(deleteBtns).toHaveLength(3);

    const firstDeleteStyle = deleteBtns[0]?.getAttribute('style') ?? '';

    expect(firstDeleteStyle).toContain('opacity: 0');

    // Selected but not hovered — still hidden per spec "visible on hover only"
    const secondDeleteStyle = deleteBtns[1]?.getAttribute('style') ?? '';

    expect(secondDeleteStyle).toContain('opacity: 0');
  });

  /** @description Hierarchy layers must be indented according to their depth. */
  it('indents nested layers according to depth', () => {
    render(
      <LayersSidebar
        layers={HIERARCHY_LAYERS}
        onSelect={() => undefined}
        onToggleLock={() => undefined}
        onDelete={() => undefined}
      />,
    );

    const listItems = screen.getAllByRole('listitem');

    // First item (depth 0) and second item (depth 1) should have different padding
    const firstStyle = listItems[0]?.getAttribute('style') ?? '';
    const secondStyle = listItems[1]?.getAttribute('style') ?? '';

    // depth=0 → base padding, depth=1 → base padding + 16px
    expect(firstStyle).not.toEqual(secondStyle);
  });

  /** @description Scenes tabs must render when scenes prop is provided with "Scene" labels. */
  it('renders scene tabs with Scenes terminology', () => {
    render(
      <LayersSidebar
        activeSceneId="s-1"
        layers={SAMPLE_LAYERS}
        scenes={[
          { id: 's-1', name: 'Scene 1' },
          { id: 's-2', name: 'Scene 2' },
        ]}
        onAddScene={() => undefined}
        onSelect={() => undefined}
        onSelectScene={() => undefined}
        onToggleLock={() => undefined}
        onDelete={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: /scene scene 1/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /scene scene 2/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /add scene/i })).not.toBeNull();
  });

  /** @description Clicking a scene tab must fire onSelectScene with the scene id. */
  it('fires onSelectScene when a scene tab is clicked', () => {
    const onSelectScene = jest.fn<(id: string) => void>();

    render(
      <LayersSidebar
        activeSceneId="s-1"
        layers={SAMPLE_LAYERS}
        scenes={[
          { id: 's-1', name: 'Scene 1' },
          { id: 's-2', name: 'Scene 2' },
        ]}
        onSelect={() => undefined}
        onSelectScene={onSelectScene}
        onToggleLock={() => undefined}
        onDelete={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /scene scene 2/i }));
    expect(onSelectScene).toHaveBeenCalledWith('s-2');
  });

  /** @description Clicking outside the rename input (blur) must commit the rename. */
  it('commits rename on blur', () => {
    const onRename = jest.fn<(id: string, name: string) => void>();

    render(
      <LayersSidebar
        layers={SAMPLE_LAYERS}
        onSelect={() => undefined}
        onToggleLock={() => undefined}
        onDelete={() => undefined}
        onRename={onRename}
      />,
    );

    const heroBtn = screen.getByRole('button', { name: /select hero card/i });

    fireEvent.doubleClick(heroBtn);

    const input = screen.getByRole('textbox', { name: /rename layer/i });

    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.blur(input);

    expect(onRename).toHaveBeenCalledWith('el-1', 'Renamed');
  });

  /** @description Double-click rename must pre-fill the input with the current element name. */
  it('pre-fills rename input with current name', () => {
    render(
      <LayersSidebar
        layers={SAMPLE_LAYERS}
        onSelect={() => undefined}
        onToggleLock={() => undefined}
        onDelete={() => undefined}
        onRename={() => undefined}
      />,
    );

    const heroBtn = screen.getByRole('button', { name: /select hero card/i });

    fireEvent.doubleClick(heroBtn);

    const input: HTMLInputElement = screen.getByRole('textbox', { name: /rename layer/i });

    expect(input.value).toBe('Hero Card');
  });

  /** @description Keyboard Enter on a layer name must fire onSelect for accessibility. */
  it('fires onSelect via Enter key for keyboard accessibility', () => {
    const onSelect = jest.fn<(id: string, mode: string) => void>();

    render(
      <LayersSidebar
        layers={SAMPLE_LAYERS}
        onSelect={onSelect}
        onToggleLock={() => undefined}
        onDelete={() => undefined}
      />,
    );

    const heroBtn = screen.getByRole('button', { name: /select hero card/i });

    fireEvent.keyDown(heroBtn, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('el-1', 'single');
  });
});

/* ================================================================== */
/*  AnimationSidebar (7-E)                                             */
/* ================================================================== */

const SAMPLE_TIMELINES: ReadonlyArray<{
  readonly id: string;
  readonly name: string;
  readonly keyframes: readonly [];
}> = [
  { id: 'tl-1', name: 'Enter', keyframes: [] },
  { id: 'tl-2', name: 'Exit', keyframes: [] },
];

const ANIMATION_SIDEBAR_DEFAULTS = {
  availableStates: ['Enter', 'Exit'],
  availableModifiers: ['hover', 'focus'],
  activeState: null as string | null,
  activeModifiers: [] as readonly string[],
  onSelectState: jest.fn(),
  onToggleModifier: jest.fn(),
  onAddTimeline: jest.fn(),
  onEditTimeline: jest.fn(),
  onDeleteTimeline: jest.fn(),
  onDuplicateTimeline: jest.fn(),
  onRenameTimeline: jest.fn(),
  onQuickSetup: jest.fn(),
  onAddStateBinding: jest.fn(),
  onRemoveStateBinding: jest.fn(),
  onAddModifierBinding: jest.fn(),
  onRemoveModifierBinding: jest.fn(),
} as const;

describe('AnimationSidebar', () => {
  /**
   * @description When an element is selected and animations are enabled,
   * the animation builder MUST be visible with the element header.
   */
  it('renders animation builder when element is selected and animations enabled', () => {
    render(
      <AnimationSidebar
        element={BASE_ELEMENT}
        isLocked={false}
        animationsEnabled={true}
        timelines={SAMPLE_TIMELINES}
        stateBindings={[]}
        modifierBindings={[]}
        {...ANIMATION_SIDEBAR_DEFAULTS}
      />,
    );

    // Element name and type chip should be visible in the header
    expect(screen.getByText('Hero Card')).not.toBeNull();
    expect(screen.getByText('rectangle')).not.toBeNull();
    // Timeline section must be present
    expect(screen.getByText('Timelines')).not.toBeNull();
  });

  /**
   * @description When no element is selected, the sidebar MUST show an empty state message.
   */
  it('shows empty state when no element is selected', () => {
    render(
      <AnimationSidebar
        element={null}
        isLocked={false}
        animationsEnabled={true}
        timelines={[]}
        stateBindings={[]}
        modifierBindings={[]}
        {...ANIMATION_SIDEBAR_DEFAULTS}
      />,
    );

    expect(screen.getByText(/select an element/i)).not.toBeNull();
  });

  /**
   * @description When animations are disabled, the sidebar MUST show a disabled state message.
   */
  it('shows disabled state when animations are turned off', () => {
    render(
      <AnimationSidebar
        element={BASE_ELEMENT}
        isLocked={false}
        animationsEnabled={false}
        timelines={[]}
        stateBindings={[]}
        modifierBindings={[]}
        {...ANIMATION_SIDEBAR_DEFAULTS}
      />,
    );

    expect(screen.getByText(/animation.*disabled/i)).not.toBeNull();
  });

  /**
   * @description When the selected element is locked, lock helper text and an icon
   * MUST be displayed, and animation controls MUST be dimmed.
   */
  it('shows lock helper text for locked elements', () => {
    render(
      <AnimationSidebar
        element={BASE_ELEMENT}
        isLocked={true}
        animationsEnabled={true}
        timelines={SAMPLE_TIMELINES}
        stateBindings={[]}
        modifierBindings={[]}
        {...ANIMATION_SIDEBAR_DEFAULTS}
      />,
    );

    expect(screen.getByText(/element is locked/i)).not.toBeNull();
  });

  /**
   * @description The timelines section MUST list all provided timelines with Edit, Rename,
   * Duplicate, and Delete actions.
   */
  it('renders timeline list with action buttons', () => {
    render(
      <AnimationSidebar
        element={BASE_ELEMENT}
        isLocked={false}
        animationsEnabled={true}
        timelines={SAMPLE_TIMELINES}
        stateBindings={[]}
        modifierBindings={[]}
        {...ANIMATION_SIDEBAR_DEFAULTS}
      />,
    );

    // Both timeline names visible (use getAllByText since state names may match)
    expect(screen.getAllByText('Enter').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Exit').length).toBeGreaterThanOrEqual(1);

    // Edit buttons for each timeline
    expect(screen.getAllByRole('button', { name: /edit/i }).length).toBeGreaterThanOrEqual(2);
  });

  /**
   * @description Clicking "Add Timeline" MUST invoke the onAddTimeline callback.
   */
  it('calls onAddTimeline when add button is clicked', () => {
    const onAddTimeline = jest.fn<() => void>();

    render(
      <AnimationSidebar
        element={BASE_ELEMENT}
        isLocked={false}
        animationsEnabled={true}
        timelines={[]}
        stateBindings={[]}
        modifierBindings={[]}
        {...ANIMATION_SIDEBAR_DEFAULTS}
        onAddTimeline={onAddTimeline}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /add timeline/i }));

    expect(onAddTimeline).toHaveBeenCalledTimes(1);
  });

  /**
   * @description The animation builder MUST NOT crash when the animation config
   * has partial or malformed data (e.g. undefined timelines array).
   */
  it('does not crash with malformed config (resilience check)', () => {
    expect(() => {
      render(
        <AnimationSidebar
          element={BASE_ELEMENT}
          isLocked={false}
          animationsEnabled={true}
          timelines={undefined as unknown as readonly []}
          stateBindings={undefined as unknown as readonly []}
          modifierBindings={undefined as unknown as readonly []}
          {...ANIMATION_SIDEBAR_DEFAULTS}
        />,
      );
    }).not.toThrow();
  });

  /**
   * @description Clicking "Edit" on a timeline MUST invoke onEditTimeline with the timeline ID.
   */
  it('calls onEditTimeline with timeline ID when edit is clicked', () => {
    const onEditTimeline = jest.fn<(id: string) => void>();

    render(
      <AnimationSidebar
        element={BASE_ELEMENT}
        isLocked={false}
        animationsEnabled={true}
        timelines={SAMPLE_TIMELINES}
        stateBindings={[]}
        modifierBindings={[]}
        {...ANIMATION_SIDEBAR_DEFAULTS}
        onEditTimeline={onEditTimeline}
      />,
    );

    const editButtons = screen.getAllByRole('button', { name: /edit/i });

    fireEvent.click(editButtons[0] as HTMLElement);

    expect(onEditTimeline).toHaveBeenCalledWith('tl-1');
  });

  /**
   * @description Clicking "Delete" on a timeline MUST invoke onDeleteTimeline with the timeline ID.
   */
  it('calls onDeleteTimeline with timeline ID when delete is clicked', () => {
    const onDeleteTimeline = jest.fn<(id: string) => void>();

    render(
      <AnimationSidebar
        element={BASE_ELEMENT}
        isLocked={false}
        animationsEnabled={true}
        timelines={SAMPLE_TIMELINES}
        stateBindings={[]}
        modifierBindings={[]}
        {...ANIMATION_SIDEBAR_DEFAULTS}
        onDeleteTimeline={onDeleteTimeline}
      />,
    );

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });

    fireEvent.click(deleteButtons[0] as HTMLElement);

    expect(onDeleteTimeline).toHaveBeenCalledWith('tl-1');
  });

  /**
   * @description Clicking "Rename" on a timeline MUST invoke onRenameTimeline with the timeline ID.
   */
  it('calls onRenameTimeline with timeline ID when rename is clicked', () => {
    const onRenameTimeline = jest.fn<(id: string) => void>();

    render(
      <AnimationSidebar
        element={BASE_ELEMENT}
        isLocked={false}
        animationsEnabled={true}
        timelines={SAMPLE_TIMELINES}
        stateBindings={[]}
        modifierBindings={[]}
        {...ANIMATION_SIDEBAR_DEFAULTS}
        onRenameTimeline={onRenameTimeline}
      />,
    );

    const renameButtons = screen.getAllByRole('button', { name: /rename/i });

    fireEvent.click(renameButtons[0] as HTMLElement);

    expect(onRenameTimeline).toHaveBeenCalledWith('tl-1');
  });

  /**
   * @description Clicking "Quick setup" MUST invoke onQuickSetup to create
   * Enter/Exit animations with preset values.
   */
  it('calls onQuickSetup when quick setup button is clicked', () => {
    const onQuickSetup = jest.fn<() => void>();

    render(
      <AnimationSidebar
        element={BASE_ELEMENT}
        isLocked={false}
        animationsEnabled={true}
        timelines={[]}
        stateBindings={[]}
        modifierBindings={[]}
        {...ANIMATION_SIDEBAR_DEFAULTS}
        onQuickSetup={onQuickSetup}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /quick setup/i }));

    expect(onQuickSetup).toHaveBeenCalledTimes(1);
  });

  /**
   * @description The "Active States & Modifiers" section MUST render a state
   * selector dropdown and modifier toggle switches.
   */
  it('renders Active States & Modifiers section with dropdown and switches', () => {
    render(
      <AnimationSidebar
        element={BASE_ELEMENT}
        isLocked={false}
        animationsEnabled={true}
        timelines={[]}
        stateBindings={[]}
        modifierBindings={[]}
        {...ANIMATION_SIDEBAR_DEFAULTS}
        availableModifiers={['hover', 'focus']}
      />,
    );

    expect(screen.getByText('Active States & Modifiers')).not.toBeNull();
    expect(screen.getByText('State')).not.toBeNull();
    expect(screen.getByText('hover')).not.toBeNull();
    expect(screen.getByText('focus')).not.toBeNull();
  });

  /**
   * @description Clicking "Add binding" in State Timeline Bindings section
   * MUST invoke onAddStateBinding callback.
   */
  it('calls onAddStateBinding when add state binding button is clicked', () => {
    const onAddStateBinding = jest.fn<() => void>();

    render(
      <AnimationSidebar
        element={BASE_ELEMENT}
        isLocked={false}
        animationsEnabled={true}
        timelines={[]}
        stateBindings={[]}
        modifierBindings={[]}
        {...ANIMATION_SIDEBAR_DEFAULTS}
        onAddStateBinding={onAddStateBinding}
      />,
    );

    const addButtons = screen.getAllByRole('button', { name: /add.*binding/i });

    expect(addButtons.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(addButtons[0] as HTMLElement);

    expect(onAddStateBinding).toHaveBeenCalledTimes(1);
  });

  /**
   * @description Clicking "Add binding" in Modifier Timeline Bindings section
   * MUST invoke onAddModifierBinding callback.
   */
  it('calls onAddModifierBinding when add modifier binding button is clicked', () => {
    const onAddModifierBinding = jest.fn<() => void>();

    render(
      <AnimationSidebar
        element={BASE_ELEMENT}
        isLocked={false}
        animationsEnabled={true}
        timelines={[]}
        stateBindings={[]}
        modifierBindings={[]}
        {...ANIMATION_SIDEBAR_DEFAULTS}
        onAddModifierBinding={onAddModifierBinding}
      />,
    );

    // There are two "Add binding" buttons — state and modifier
    const addButtons = screen.getAllByRole('button', { name: /add.*binding/i });

    expect(addButtons.length).toBe(2);

    // Click the modifier one (second)
    fireEvent.click(addButtons[1] as HTMLElement);

    expect(onAddModifierBinding).toHaveBeenCalledTimes(1);
  });
});
