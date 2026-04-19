import { getCapabilityProfile } from '@broadset/model';
import { Accordion } from '@heroui/react';
import { Type } from 'lucide-react';
import type { JSX, ReactNode } from 'react';

import type { MediaAsset } from './modals';
import type { CustomPanelComponent, PanelElement, PropertyValue } from './panel-types';
import { ICON_SIZE } from './panel-types';
import {
  AppearancePanel,
  BoxEffectsPanel,
  ClipPathPanel,
  ClockPanel,
  GeometryPanel,
  GroupPanel,
  ImagePanel,
  ObjectFitPanel,
  PathPropertiesPanel,
  QrCodePanel,
  SpacingPanel,
  TextEffectsPanel,
  TickerPanel,
  TypographyPanel,
  VideoPanel,
} from './property-panels';
import { SidebarContextHeader } from './sidebar-context-header';
import { color, font, glassPanelStyle, sp } from './tokens';

const ELEMENT_TYPE_LABELS: Readonly<Record<string, string>> = {
  clock: 'Clock',
  ellipse: 'Ellipse',
  group: 'Group',
  image: 'Image',
  path: 'Path',
  qrcode: 'QR Code',
  rectangle: 'Rectangle',
  svg: 'SVG',
  text: 'Text',
  ticker: 'Ticker',
  video: 'Video',
};

function getElementTypeLabel(type: string): string {
  return ELEMENT_TYPE_LABELS[type] ?? 'Element';
}

const DEFAULT_EXPANDED_BY_TYPE: Readonly<Record<string, readonly string[]>> = {
  ellipse: ['appearance', 'geometry'],
  group: ['group-settings'],
  image: ['image-source', 'geometry'],
  path: ['path-stroke', 'geometry'],
  rectangle: ['appearance', 'geometry'],
  svg: ['path-stroke', 'geometry'],
  text: ['typography', 'geometry'],
};

function getDefaultExpandedKeys(type: string): readonly string[] {
  return DEFAULT_EXPANDED_BY_TYPE[type] ?? ['geometry', 'appearance'];
}

/* ------------------------------------------------------------------ */
/*  PropertiesSidebar — main panel orchestrator                        */
/* ------------------------------------------------------------------ */

export interface PropertiesSidebarProps {
  readonly elements: readonly PanelElement[];
  readonly documentMode: 'screen' | 'print';
  readonly availableFonts?: readonly string[] | undefined;
  readonly showAnimations?: boolean | undefined;
  readonly onUpdate: (key: string, value: PropertyValue) => void;
  readonly customPanels?: Readonly<Record<string, CustomPanelComponent>> | undefined;
  readonly onStartDrawing?: (() => void) | undefined;
  readonly onStopDrawing?: (() => void) | undefined;
  readonly onStartEditing?: (() => void) | undefined;
  readonly onStopEditing?: (() => void) | undefined;
  readonly isDrawing?: boolean | undefined;
  readonly isEditing?: boolean | undefined;
  readonly mediaAssets?: readonly MediaAsset[] | undefined;
  readonly onStartClipPathEditing?: (() => void) | undefined;
  readonly canvasWidth?: number | undefined;
  readonly canvasHeight?: number | undefined;
  readonly documentUnit?: 'px' | 'mm' | 'in' | undefined;
}

type UpdateFn = PropertiesSidebarProps['onUpdate'];

interface SelectionContext {
  readonly primary: PanelElement;
  readonly isMulti: boolean;
  readonly isLocked: boolean;
  readonly selectionCountLabel: string | undefined;
  readonly contextLabel: string;
  readonly typeChipLabel: string | undefined;
  readonly onLabelChange: ((next: string) => void) | undefined;
  readonly onToggleLock: (() => void) | undefined;
}

function makeSelectionContext(
  elements: readonly PanelElement[],
  primary: PanelElement,
  onUpdate: UpdateFn,
): SelectionContext {
  const isMulti = elements.length > 1;
  const isLocked = primary.locked === true;

  return {
    primary,
    isMulti,
    isLocked,
    selectionCountLabel: isMulti ? `${String(elements.length)} elements` : undefined,
    contextLabel: isMulti ? 'Multiple selection' : primary.name || getElementTypeLabel(primary.type),
    typeChipLabel: isMulti ? undefined : getElementTypeLabel(primary.type),
    onLabelChange: isMulti
      ? undefined
      : (nextName: string): void => {
          onUpdate('name', nextName);
        },
    onToggleLock: isMulti
      ? undefined
      : (): void => {
          onUpdate('locked', !isLocked);
        },
  };
}

function EmptyPropertiesAside(): JSX.Element {
  return (
    <aside
      aria-label="Properties"
      role="region"
      className="p-3"
      style={{ ...glassPanelStyle(), alignItems: 'center', display: 'flex', justifyContent: 'center' }}
    >
      <p style={{ color: color('muted'), fontSize: font('body-compact'), margin: 0 }}>
        Select an element to edit its properties
      </p>
    </aside>
  );
}

function PropertiesAsideShell({
  context,
  children,
}: {
  readonly context: SelectionContext;
  readonly children: ReactNode;
}): JSX.Element {
  const { isLocked } = context;

  return (
    <aside aria-label="Properties" role="region" className="p-3" style={glassPanelStyle()}>
      <SidebarContextHeader
        icon={<Type size={ICON_SIZE} />}
        label={context.contextLabel}
        {...(context.onLabelChange !== undefined ? { onLabelChange: context.onLabelChange } : {})}
        typeChipLabel={context.typeChipLabel}
        countChipLabel={context.selectionCountLabel}
        isLocked={isLocked}
        onToggleLock={context.onToggleLock}
      />
      {isLocked && (
        <p style={{ color: color('muted'), fontSize: font('label'), margin: 0, marginBottom: sp('sp-03') }}>
          Element is locked. Unlock to edit properties.
        </p>
      )}
      <div
        aria-label="Properties controls"
        aria-disabled={isLocked}
        inert={isLocked}
        style={isLocked ? { pointerEvents: 'none' } : undefined}
      >
        <fieldset disabled={isLocked} style={{ border: 0, margin: 0, minWidth: 0, padding: 0 }}>
          {children}
        </fieldset>
      </div>
    </aside>
  );
}

interface PanelDescriptor {
  readonly id: string;
  readonly title: string;
  readonly render: () => JSX.Element;
}

type CapabilityProfile = ReturnType<typeof getCapabilityProfile>;

interface PanelBuildContext {
  readonly props: PropertiesSidebarProps;
  readonly primary: PanelElement;
  readonly profile: CapabilityProfile;
  readonly isScreenMode: boolean;
}

/**
 * Factory for one accordion item. Returns null to mean "hide this panel for
 * this selection". Kept as a list so the orchestrator is a straight map +
 * filter — no nested conditionals, low cognitive complexity.
 */
type PanelFactory = (ctx: PanelBuildContext) => PanelDescriptor | null;

const GEOMETRY_PANEL: PanelFactory = ({ props, primary }) => ({
  id: 'geometry',
  title: 'Geometry',
  render: () => (
    <GeometryPanel
      name={primary.name}
      x={primary.x}
      y={primary.y}
      width={primary.width}
      height={primary.height}
      rotation={primary.rotation}
      rotateX={primary.rotateX}
      rotateY={primary.rotateY}
      rotateZ={primary.rotateZ}
      translateZ={primary.translateZ}
      autoSize={primary.autoSize}
      elementType={primary.type}
      onUpdate={props.onUpdate}
      documentMode={props.documentMode}
      {...(props.canvasWidth !== undefined ? { canvasWidth: props.canvasWidth } : {})}
      {...(props.canvasHeight !== undefined ? { canvasHeight: props.canvasHeight } : {})}
      {...(props.documentUnit !== undefined ? { documentUnit: props.documentUnit } : {})}
    />
  ),
});

const APPEARANCE_PANEL: PanelFactory = ({ props, primary, profile, isScreenMode }) =>
  !profile.appearance
    ? null
    : {
        id: 'appearance',
        title: 'Appearance',
        render: () => (
          <AppearancePanel
            backgroundColor={primary.backgroundColor}
            backgroundGradient={primary.backgroundGradient}
            showGradient={isScreenMode && primary.type === 'rectangle'}
            borderWidth={primary.borderWidth}
            borderColor={primary.borderColor}
            borderStyle={primary.borderStyle}
            borderRadius={primary.borderRadius}
            opacity={primary.opacity}
            onUpdate={props.onUpdate}
          />
        ),
      };

const TYPOGRAPHY_PANEL: PanelFactory = ({ props, primary, profile }) =>
  !profile.typography
    ? null
    : {
        id: 'typography',
        title: 'Typography',
        render: () => (
          <TypographyPanel
            fontFamily={primary.fontFamily}
            availableFonts={props.availableFonts}
            fontSize={primary.fontSize}
            fontColor={primary.fontColor}
            fontWeight={primary.fontWeight}
            fontStyle={primary.fontStyle}
            textAlignment={primary.textAlignment}
            verticalAlignment={primary.verticalAlignment}
            textDecoration={primary.textDecoration}
            textTransform={primary.textTransform}
            lineHeight={primary.lineHeight}
            letterSpacing={primary.letterSpacing}
            wordSpacing={primary.wordSpacing}
            isAnimationMode={false}
            onUpdate={props.onUpdate}
          />
        ),
      };

const TEXT_EFFECTS_PANEL: PanelFactory = ({ props, primary, profile }) =>
  !profile.typography
    ? null
    : {
        id: 'text-effects',
        title: 'Text Effects',
        render: () => (
          <TextEffectsPanel
            textStroke={primary.textStroke}
            textShadow={primary.textShadow}
            textTransform={primary.textTransform}
            onUpdate={props.onUpdate}
          />
        ),
      };

const SPACING_PANEL: PanelFactory = ({ props, primary, profile }) =>
  !profile.typography && primary.type !== 'group'
    ? null
    : {
        id: 'spacing',
        title: 'Spacing',
        render: () => <SpacingPanel padding={primary.padding} onUpdate={props.onUpdate} />,
      };

const BOX_EFFECTS_PANEL: PanelFactory = ({ props, primary, profile }) =>
  !profile.boxEffects
    ? null
    : {
        id: 'box-effects',
        title: 'Box Effects',
        render: () => (
          <BoxEffectsPanel
            boxShadow={primary.boxShadow}
            filter={primary.filter}
            backdropFilter={primary.backdropFilter}
            mixBlendMode={primary.mixBlendMode}
            isolation={primary.isolation}
            documentMode={props.documentMode}
            onUpdate={props.onUpdate}
          />
        ),
      };

const CLIP_PATH_PANEL: PanelFactory = ({ props, primary, profile, isScreenMode }) =>
  !profile.clipPath || !isScreenMode
    ? null
    : {
        id: 'clip-path',
        title: 'Clip Path',
        render: () => (
          <ClipPathPanel
            maskType={primary.maskType}
            customClipPath={primary.customClipPath}
            onStartEditingClipPath={props.onStartClipPathEditing}
            onUpdate={props.onUpdate}
          />
        ),
      };

const PATH_PROPERTIES_PANEL: PanelFactory = ({ props, primary, profile }) =>
  !profile.svgStrokeFill && !profile.pathEditing && primary.type !== 'svg'
    ? null
    : {
        id: 'path-stroke',
        title: 'Path Properties',
        render: () => (
          <PathPropertiesPanel
            stroke={primary.stroke}
            strokeWidth={primary.strokeWidth}
            strokeOpacity={primary.strokeOpacity}
            strokeDasharray={primary.strokeDasharray}
            strokeDashoffset={primary.strokeDashoffset}
            strokeLinecap={primary.strokeLinecap}
            strokeLinejoin={primary.strokeLinejoin}
            fill={primary.fill}
            fillOpacity={primary.fillOpacity}
            fillRule={primary.fillRule}
            content={primary.content}
            onUpdate={props.onUpdate}
            onStartDrawing={props.onStartDrawing ?? ((): void => undefined)}
            onStopDrawing={props.onStopDrawing ?? ((): void => undefined)}
            onStartEditing={props.onStartEditing ?? ((): void => undefined)}
            onStopEditing={props.onStopEditing ?? ((): void => undefined)}
            isDrawing={props.isDrawing ?? false}
            isEditing={props.isEditing ?? false}
          />
        ),
      };

const IMAGE_PANEL: PanelFactory = ({ props, primary }) =>
  primary.type !== 'image'
    ? null
    : {
        id: 'image-source',
        title: 'Image',
        render: () => (
          <ImagePanel
            content={primary.content}
            assetId={primary.assetId}
            assets={props.mediaAssets}
            objectFit={primary.objectFit}
            onUpdate={props.onUpdate}
          />
        ),
      };

// Object Fit is inlined in ImagePanel for images; standalone accordion kept
// for other fit-capable types (svg, video) so they keep the control.
const OBJECT_FIT_PANEL: PanelFactory = ({ props, primary, profile }) =>
  !profile.objectFit || primary.type === 'image'
    ? null
    : {
        id: 'object-fit',
        title: 'Object Fit',
        render: () => <ObjectFitPanel objectFit={primary.objectFit} onUpdate={props.onUpdate} />,
      };

const QR_CODE_PANEL: PanelFactory = ({ props, primary }) =>
  primary.type !== 'qrcode'
    ? null
    : {
        id: 'qrcode',
        title: 'QR Code',
        render: () => (
          <QrCodePanel
            content={primary.content}
            errorCorrection={primary.errorCorrection}
            foregroundColor={primary.qrForegroundColor}
            backgroundColor={primary.qrBackgroundColor}
            onUpdate={props.onUpdate}
          />
        ),
      };

const GROUP_PANEL_FACTORY: PanelFactory = ({ props, primary }) =>
  primary.type !== 'group'
    ? null
    : {
        id: 'group-settings',
        title: 'Group',
        render: () => (
          <GroupPanel
            name={primary.name}
            opacity={primary.opacity}
            clipChildren={primary.clipChildren}
            booleanOperation={primary.booleanOperation}
            documentMode={props.documentMode}
            onUpdate={props.onUpdate}
          />
        ),
      };

const VIDEO_PANEL_FACTORY: PanelFactory = ({ props, primary }) =>
  primary.type !== 'video'
    ? null
    : {
        id: 'video',
        title: 'Video',
        render: () => (
          <VideoPanel
            sourceUrl={primary.content}
            autoplay={primary.videoAutoplay ?? false}
            loop={primary.videoLoop ?? false}
            muted={primary.videoMuted ?? false}
            startTime={primary.videoStartTime ?? 0}
            endTime={primary.videoEndTime ?? 0}
            onUpdate={props.onUpdate}
          />
        ),
      };

const CLOCK_PANEL_FACTORY: PanelFactory = ({ props, primary }) =>
  primary.type !== 'clock'
    ? null
    : {
        id: 'clock',
        title: 'Clock',
        render: () => (
          <ClockPanel
            format={primary.content}
            mode={primary.clockMode ?? 'realtime'}
            startValue={primary.clockStartValue ?? ''}
            targetValue={primary.clockTargetValue ?? ''}
            countdownTo={primary.clockCountdownTo ?? ''}
            onUpdate={props.onUpdate}
          />
        ),
      };

const TICKER_PANEL_FACTORY: PanelFactory = ({ props, primary }) =>
  primary.type !== 'ticker'
    ? null
    : {
        id: 'ticker',
        title: 'Ticker',
        render: () => (
          <TickerPanel
            items={primary.tickerItems ?? ['New item']}
            speed={primary.tickerSpeed ?? 100}
            direction={primary.tickerDirection ?? 'left'}
            gap={primary.tickerGap ?? 20}
            paused={primary.tickerPaused ?? false}
            onUpdate={props.onUpdate}
            onUpdateItems={(items): void => {
              props.onUpdate('tickerItems', JSON.stringify(items));
            }}
          />
        ),
      };

const ANIMATION_BUILDER_PANEL: PanelFactory = ({ props }) =>
  props.showAnimations !== true
    ? null
    : {
        id: 'animation-builder',
        title: 'Animation Builder',
        render: () => (
          <section aria-label="Animation Builder" className="flex flex-col gap-2">
            <p style={{ color: color('muted'), fontSize: font('body-compact'), margin: 0 }}>
              Animation builder controls
            </p>
          </section>
        ),
      };

const PANEL_FACTORIES: readonly PanelFactory[] = [
  GEOMETRY_PANEL,
  APPEARANCE_PANEL,
  TYPOGRAPHY_PANEL,
  TEXT_EFFECTS_PANEL,
  SPACING_PANEL,
  BOX_EFFECTS_PANEL,
  CLIP_PATH_PANEL,
  PATH_PROPERTIES_PANEL,
  IMAGE_PANEL,
  OBJECT_FIT_PANEL,
  QR_CODE_PANEL,
  GROUP_PANEL_FACTORY,
  VIDEO_PANEL_FACTORY,
  CLOCK_PANEL_FACTORY,
  TICKER_PANEL_FACTORY,
  ANIMATION_BUILDER_PANEL,
];

function buildPanelDescriptors(props: PropertiesSidebarProps, primary: PanelElement): readonly PanelDescriptor[] {
  const ctx: PanelBuildContext = {
    props,
    primary,
    profile: getCapabilityProfile(primary.type),
    isScreenMode: props.documentMode === 'screen',
  };

  return PANEL_FACTORIES.map((factory) => factory(ctx)).filter((d): d is PanelDescriptor => d !== null);
}

function PropertiesAccordion({
  descriptors,
  defaultExpanded,
}: {
  readonly descriptors: readonly PanelDescriptor[];
  readonly defaultExpanded: readonly string[];
}): JSX.Element {
  return (
    <Accordion allowsMultipleExpanded defaultExpandedKeys={defaultExpanded}>
      {descriptors.map((descriptor) => (
        <Accordion.Item id={descriptor.id} key={descriptor.id}>
          <Accordion.Heading>
            <Accordion.Trigger>{descriptor.title}</Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>{descriptor.render()}</Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  );
}

export function PropertiesSidebar(props: PropertiesSidebarProps): JSX.Element {
  const primary = props.elements[0];

  if (props.elements.length === 0 || primary === undefined) {
    return <EmptyPropertiesAside />;
  }

  const context = makeSelectionContext(props.elements, primary, props.onUpdate);
  const CustomPanel = props.customPanels?.[primary.type];

  if (CustomPanel !== undefined) {
    return (
      <PropertiesAsideShell context={context}>
        <CustomPanel documentMode={props.documentMode} element={primary} onUpdate={props.onUpdate} />
      </PropertiesAsideShell>
    );
  }

  const descriptors = buildPanelDescriptors(props, primary);

  return (
    <PropertiesAsideShell context={context}>
      <PropertiesAccordion descriptors={descriptors} defaultExpanded={getDefaultExpandedKeys(primary.type)} />
    </PropertiesAsideShell>
  );
}
