import { sp } from '@broadset/ui';
import { Separator } from '@heroui/react';
import { Maximize2, Minimize2, Minus, Pause, Play, Plus, RotateCcw } from 'lucide-react';

import { IconToolButton } from '../demo-components';
import { ZOOM_STEP } from '../demo-types';
import type { DemoAppLayoutProps } from './layout-types';
import { ZoomPercentDisplay } from './zoom-percent-display';

export function LayoutToolbarActions(props: DemoAppLayoutProps): React.JSX.Element {
  const {
    editorStore,
    handleAlignSelection,
    handleDistributeSelection,
    handleResetPlayback,
    handleToggleFullscreen,
    handleTogglePlayback,
    handleZoomStep,
    handleZoomToFit,
    hasGroupedSelection,
    isFullscreen,
    isPlaying,
    selectedElements,
    selectedMovableElements,
    temporalState,
  } = props;

  return (
    <>
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          flexWrap: 'wrap',
          gap: sp('sp-01'),
          whiteSpace: 'nowrap',
        }}
      >
        <IconToolButton
          label="Undo"
          isDisabled={temporalState.pastStates.length === 0}
          onPress={() => {
            editorStore.getState().undo();
          }}
        >
          <RotateCcw size={16} />
        </IconToolButton>
        <IconToolButton
          label="Redo"
          isDisabled={temporalState.futureStates.length === 0}
          onPress={() => {
            editorStore.getState().redo();
          }}
        >
          <RotateCcw size={16} style={{ transform: 'scaleX(-1)' }} />
        </IconToolButton>
        <IconToolButton
          label={isPlaying ? 'Pause playback' : 'Play playback'}
          testId="demo-playback-toggle"
          onPress={handleTogglePlayback}
        >
          {isPlaying ?
            <Pause size={16} />
          : <Play size={16} />}
        </IconToolButton>
        <IconToolButton label="Reset playback" testId="demo-playback-reset" onPress={handleResetPlayback}>
          <RotateCcw size={16} />
        </IconToolButton>
      </div>

      {selectedElements.length >= 2 ?
        <>
          <Separator orientation="vertical" />
          <div style={{ alignItems: 'center', display: 'flex', gap: sp('sp-02'), whiteSpace: 'nowrap' }}>
            <IconToolButton
              label="Align left"
              isDisabled={selectedMovableElements.length < 2}
              onPress={() => {
                handleAlignSelection('left');
              }}
            >
              <span aria-hidden="true">⇤</span>
            </IconToolButton>
            <IconToolButton
              label="Align center"
              isDisabled={selectedMovableElements.length < 2}
              onPress={() => {
                handleAlignSelection('center-x');
              }}
            >
              <span aria-hidden="true">↔</span>
            </IconToolButton>
            <IconToolButton
              label="Align right"
              isDisabled={selectedMovableElements.length < 2}
              onPress={() => {
                handleAlignSelection('right');
              }}
            >
              <span aria-hidden="true">⇥</span>
            </IconToolButton>
            <IconToolButton
              label="Align top"
              isDisabled={selectedMovableElements.length < 2}
              onPress={() => {
                handleAlignSelection('top');
              }}
            >
              <span aria-hidden="true">⇡</span>
            </IconToolButton>
            <IconToolButton
              label="Align middle"
              isDisabled={selectedMovableElements.length < 2}
              onPress={() => {
                handleAlignSelection('center-y');
              }}
            >
              <span aria-hidden="true">↕</span>
            </IconToolButton>
            <IconToolButton
              label="Align bottom"
              isDisabled={selectedMovableElements.length < 2}
              onPress={() => {
                handleAlignSelection('bottom');
              }}
            >
              <span aria-hidden="true">⇣</span>
            </IconToolButton>
            <IconToolButton
              label="Distribute horizontal"
              isDisabled={selectedMovableElements.length < 3}
              onPress={() => {
                handleDistributeSelection('horizontal');
              }}
            >
              <span aria-hidden="true">⇹</span>
            </IconToolButton>
            <IconToolButton
              label="Distribute vertical"
              isDisabled={selectedMovableElements.length < 3}
              onPress={() => {
                handleDistributeSelection('vertical');
              }}
            >
              <span aria-hidden="true">⇵</span>
            </IconToolButton>
            <IconToolButton
              label="Group selection"
              onPress={() => {
                editorStore.getState().groupElements();
              }}
            >
              <span aria-hidden="true">⊡</span>
            </IconToolButton>
            <IconToolButton
              label="Ungroup selection"
              isDisabled={!hasGroupedSelection}
              onPress={() => {
                editorStore.getState().ungroupElements();
              }}
            >
              <span aria-hidden="true">⊟</span>
            </IconToolButton>
          </div>
        </>
      : null}

      <Separator orientation="vertical" />

      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          gap: sp('sp-01'),
          paddingLeft: sp('sp-01'),
          whiteSpace: 'nowrap',
        }}
      >
        <IconToolButton
          label="Zoom out"
          onPress={() => {
            handleZoomStep(-ZOOM_STEP);
          }}
        >
          <Minus size={16} />
        </IconToolButton>
        <IconToolButton label="Zoom to fit" onPress={handleZoomToFit}>
          <Maximize2 size={16} />
        </IconToolButton>
        <IconToolButton
          label="Zoom in"
          onPress={() => {
            handleZoomStep(ZOOM_STEP);
          }}
        >
          <Plus size={16} />
        </IconToolButton>
        <ZoomPercentDisplay editorStore={editorStore} />
        <IconToolButton
          label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          onPress={() => {
            void handleToggleFullscreen();
          }}
        >
          {isFullscreen ?
            <Minimize2 size={16} />
          : <Maximize2 size={16} />}
        </IconToolButton>
      </div>
    </>
  );
}
