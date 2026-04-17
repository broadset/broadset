import { getCapabilityProfile } from '@broadset/model';
import { Accordion } from '@heroui/react';
import { Type } from 'lucide-react';
import type { JSX } from 'react';

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
}

export function PropertiesSidebar({
  elements,
  documentMode,
  availableFonts,
  showAnimations,
  onUpdate,
  customPanels,
  onStartDrawing,
  onStopDrawing,
  onStartEditing,
  onStopEditing,
  isDrawing = false,
  isEditing = false,
  mediaAssets,
  onStartClipPathEditing,
}: PropertiesSidebarProps): JSX.Element {
  if (elements.length === 0) {
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

  const primary = elements[0];

  if (primary === undefined) {
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

  const isMulti = elements.length > 1;
  const isLocked = primary.locked === true;
  const selectionCountLabel = isMulti ? `${String(elements.length)} elements` : undefined;
  const contextLabel = isMulti ? 'Multiple selection' : primary.name || primary.id;
  const contextSubtitle = isMulti ? 'Common properties' : primary.id;
  const typeChipLabel = isMulti ? undefined : getElementTypeLabel(primary.type);

  const CustomPanel = customPanels?.[primary.type];

  if (CustomPanel !== undefined) {
    return (
      <aside aria-label="Properties" role="region" className="p-3" style={glassPanelStyle()}>
        <SidebarContextHeader
          icon={<Type size={ICON_SIZE} />}
          label={contextLabel}
          subtitle={contextSubtitle}
          typeChipLabel={typeChipLabel}
          countChipLabel={selectionCountLabel}
          isLocked={isLocked}
          onToggleLock={
            isMulti ? undefined : (
              () => {
                onUpdate('locked', !isLocked);
              }
            )
          }
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
            <CustomPanel documentMode={documentMode} element={primary} onUpdate={onUpdate} />
          </fieldset>
        </div>
      </aside>
    );
  }

  const profile = getCapabilityProfile(primary.type);
  const isScreenMode = documentMode === 'screen';
  const showGradient = isScreenMode && primary.type === 'rectangle';
  const isQrCode = primary.type === 'qrcode';
  const isGroup = primary.type === 'group';
  const isImage = primary.type === 'image';
  const isVideo = primary.type === 'video';
  const isClock = primary.type === 'clock';
  const isTicker = primary.type === 'ticker';
  const showSpacing = profile.typography || isGroup;
  const showPathProperties = profile.svgStrokeFill || profile.pathEditing || primary.type === 'svg';

  const defaultExpanded = getDefaultExpandedKeys(primary.type);

  return (
    <aside aria-label="Properties" role="region" className="p-3" style={glassPanelStyle()}>
      <SidebarContextHeader
        icon={<Type size={ICON_SIZE} />}
        label={contextLabel}
        subtitle={contextSubtitle}
        typeChipLabel={typeChipLabel}
        countChipLabel={selectionCountLabel}
        isLocked={isLocked}
        onToggleLock={
          isMulti ? undefined : (
            () => {
              onUpdate('locked', !isLocked);
            }
          )
        }
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
          <Accordion allowsMultipleExpanded defaultExpandedKeys={defaultExpanded}>
            <Accordion.Item id="geometry">
              <Accordion.Heading>
                <Accordion.Trigger>Geometry</Accordion.Trigger>
              </Accordion.Heading>
              <Accordion.Panel>
                <GeometryPanel
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
                  onUpdate={onUpdate}
                  documentMode={documentMode}
                />
              </Accordion.Panel>
            </Accordion.Item>

            {/* 2. Appearance */}
            {profile.appearance ?
              <Accordion.Item id="appearance">
                <Accordion.Heading>
                  <Accordion.Trigger>Appearance</Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <AppearancePanel
                    backgroundColor={primary.backgroundColor}
                    backgroundGradient={primary.backgroundGradient}
                    showGradient={showGradient}
                    borderWidth={primary.borderWidth}
                    borderColor={primary.borderColor}
                    borderStyle={primary.borderStyle}
                    borderRadius={primary.borderRadius}
                    opacity={primary.opacity}
                    blendMode={primary.blendMode}
                    onUpdate={onUpdate}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            : null}

            {/* 3. Typography */}
            {profile.typography ?
              <Accordion.Item id="typography">
                <Accordion.Heading>
                  <Accordion.Trigger>Typography</Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <TypographyPanel
                    fontFamily={primary.fontFamily}
                    availableFonts={availableFonts}
                    fontSize={primary.fontSize}
                    fontColor={primary.fontColor}
                    fontWeight={primary.fontWeight}
                    fontStyle={primary.fontStyle}
                    textAlignment={primary.textAlignment}
                    verticalAlignment={primary.verticalAlignment}
                    textDecoration={primary.textDecoration}
                    textTransform={primary.textTransform}
                    isAnimationMode={false}
                    onUpdate={onUpdate}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            : null}

            {/* 4. Text Effects */}
            {profile.typography ?
              <Accordion.Item id="text-effects">
                <Accordion.Heading>
                  <Accordion.Trigger>Text Effects</Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <TextEffectsPanel
                    letterSpacing={primary.letterSpacing}
                    lineHeight={primary.lineHeight}
                    wordSpacing={primary.wordSpacing}
                    textStroke={primary.textStroke}
                    textShadow={primary.textShadow}
                    textTransform={primary.textTransform}
                    onUpdate={onUpdate}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            : null}

            {/* 5. Spacing */}
            {showSpacing ?
              <Accordion.Item id="spacing">
                <Accordion.Heading>
                  <Accordion.Trigger>Spacing</Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <SpacingPanel padding={primary.padding} onUpdate={onUpdate} />
                </Accordion.Panel>
              </Accordion.Item>
            : null}

            {/* 6. Box Effects */}
            {profile.boxEffects ?
              <Accordion.Item id="box-effects">
                <Accordion.Heading>
                  <Accordion.Trigger>Box Effects</Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <BoxEffectsPanel
                    boxShadow={primary.boxShadow}
                    filter={primary.filter}
                    backdropFilter={primary.backdropFilter}
                    mixBlendMode={primary.mixBlendMode}
                    isolation={primary.isolation}
                    documentMode={documentMode}
                    onUpdate={onUpdate}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            : null}

            {/* 7. Clip Path */}
            {profile.clipPath && isScreenMode ?
              <Accordion.Item id="clip-path">
                <Accordion.Heading>
                  <Accordion.Trigger>Clip Path</Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <ClipPathPanel
                    maskType={primary.maskType}
                    customClipPath={primary.customClipPath}
                    onStartEditingClipPath={onStartClipPathEditing}
                    onUpdate={onUpdate}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            : null}

            {/* 8. Path Properties */}
            {showPathProperties ?
              <Accordion.Item id="path-stroke">
                <Accordion.Heading>
                  <Accordion.Trigger>Path Properties</Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
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
                    onUpdate={onUpdate}
                    onStartDrawing={onStartDrawing ?? (() => undefined)}
                    onStopDrawing={onStopDrawing ?? (() => undefined)}
                    onStartEditing={onStartEditing ?? (() => undefined)}
                    onStopEditing={onStopEditing ?? (() => undefined)}
                    isDrawing={isDrawing}
                    isEditing={isEditing}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            : null}

            {/* 9. Image */}
            {isImage ?
              <Accordion.Item id="image-source">
                <Accordion.Heading>
                  <Accordion.Trigger>Image</Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <ImagePanel
                    content={primary.content}
                    assetId={primary.assetId}
                    assets={mediaAssets}
                    onUpdate={onUpdate}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            : null}

            {/* 10. Object Fit */}
            {profile.objectFit ?
              <Accordion.Item id="object-fit">
                <Accordion.Heading>
                  <Accordion.Trigger>Object Fit</Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <ObjectFitPanel objectFit={primary.objectFit} onUpdate={onUpdate} />
                </Accordion.Panel>
              </Accordion.Item>
            : null}

            {/* 11. QR Code */}
            {isQrCode ?
              <Accordion.Item id="qrcode">
                <Accordion.Heading>
                  <Accordion.Trigger>QR Code</Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <QrCodePanel
                    content={primary.content}
                    errorCorrection={primary.errorCorrection}
                    foregroundColor={primary.qrForegroundColor}
                    backgroundColor={primary.qrBackgroundColor}
                    onUpdate={onUpdate}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            : null}

            {/* 12. Group */}
            {isGroup ?
              <Accordion.Item id="group-settings">
                <Accordion.Heading>
                  <Accordion.Trigger>Group</Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <GroupPanel
                    name={primary.name}
                    opacity={primary.opacity}
                    clipChildren={primary.clipChildren}
                    booleanOperation={primary.booleanOperation}
                    documentMode={documentMode}
                    onUpdate={onUpdate}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            : null}

            {/* Video */}
            {isVideo ?
              <Accordion.Item id="video">
                <Accordion.Heading>
                  <Accordion.Trigger>Video</Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <VideoPanel
                    sourceUrl={primary.content}
                    autoplay={primary.videoAutoplay ?? false}
                    loop={primary.videoLoop ?? false}
                    muted={primary.videoMuted ?? false}
                    startTime={primary.videoStartTime ?? 0}
                    endTime={primary.videoEndTime ?? 0}
                    onUpdate={onUpdate}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            : null}

            {/* Clock */}
            {isClock ?
              <Accordion.Item id="clock">
                <Accordion.Heading>
                  <Accordion.Trigger>Clock</Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <ClockPanel
                    format={primary.content}
                    mode={primary.clockMode ?? 'realtime'}
                    startValue={primary.clockStartValue ?? ''}
                    targetValue={primary.clockTargetValue ?? ''}
                    countdownTo={primary.clockCountdownTo ?? ''}
                    onUpdate={onUpdate}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            : null}

            {/* Ticker */}
            {isTicker ?
              <Accordion.Item id="ticker">
                <Accordion.Heading>
                  <Accordion.Trigger>Ticker</Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <TickerPanel
                    items={primary.tickerItems ?? ['New item']}
                    speed={primary.tickerSpeed ?? 100}
                    direction={primary.tickerDirection ?? 'left'}
                    gap={primary.tickerGap ?? 20}
                    paused={primary.tickerPaused ?? false}
                    onUpdate={onUpdate}
                    onUpdateItems={(items) => {
                      onUpdate('tickerItems', JSON.stringify(items));
                    }}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            : null}

            {/* 13. Animation Builder — rendered when showAnimations is enabled */}
            {showAnimations === true ?
              <Accordion.Item id="animation-builder">
                <Accordion.Heading>
                  <Accordion.Trigger>Animation Builder</Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <section aria-label="Animation Builder" role="region" className="flex flex-col gap-2">
                    <p style={{ color: color('muted'), fontSize: font('body-compact'), margin: 0 }}>
                      Animation builder controls
                    </p>
                  </section>
                </Accordion.Panel>
              </Accordion.Item>
            : null}
          </Accordion>
        </fieldset>
      </div>
    </aside>
  );
}
