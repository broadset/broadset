import { color, font, glassPanelStyle, PageSorter, sp, zLayer } from '@broadset/ui';
import { Button, Tooltip } from '@heroui/react';
import { Keyboard } from 'lucide-react';

import type { DemoAppLayoutProps } from './layout-types';

const HELP_ICON_SIZE = 16;

export function LayoutCanvasChrome(props: DemoAppLayoutProps): React.JSX.Element {
  const { currentDocument, editorState, editorStore, resolutionLabel, setActiveDialog } = props;

  return (
    <div className="absolute bottom-2 left-2 flex items-end gap-2" style={{ zIndex: zLayer('chrome') }}>
      <PageSorter
        activePageIndex={editorState.activePageIndex}
        pages={currentDocument.pages}
        onPageAdd={() => {
          editorStore.getState().addPage();
        }}
        onPageRemove={(index) => {
          editorStore.getState().removePage(index);
        }}
        onPageSelect={(index) => {
          editorStore.getState().switchPage(index);
        }}
      />

      <div
        data-testid="canvas-info-strip"
        style={{
          ...glassPanelStyle(),
          alignItems: 'center',
          display: 'flex',
          gap: sp('sp-02'),
          padding: `${sp('sp-01')} ${sp('sp-03')}`,
          whiteSpace: 'nowrap',
        }}
      >
        <span
          style={{
            color: color('foreground'),
            fontSize: font('label'),
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {currentDocument.name}
        </span>
        <span aria-hidden="true" style={{ color: color('muted') }}>
          •
        </span>
        <span style={{ color: color('muted'), fontSize: font('label') }}>{resolutionLabel}</span>
      </div>

      <Tooltip delay={0}>
        <Button
          aria-label="Shortcuts"
          data-testid="persistent-help-button"
          isIconOnly
          size="sm"
          style={glassPanelStyle()}
          variant="ghost"
          onPress={() => {
            setActiveDialog('shortcuts');
          }}
        >
          <Keyboard size={HELP_ICON_SIZE} />
        </Button>
        <Tooltip.Content>Keyboard shortcuts</Tooltip.Content>
      </Tooltip>
    </div>
  );
}
