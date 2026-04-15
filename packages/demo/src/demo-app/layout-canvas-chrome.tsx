import { glassPanelStyle, PageSorter, zLayer } from '@broadset/ui';
import { Button, Tooltip } from '@heroui/react';
import { Keyboard } from 'lucide-react';

import type { DemoAppLayoutProps } from './layout-types';

const HELP_ICON_SIZE = 16;

export function LayoutCanvasChrome(props: DemoAppLayoutProps): React.JSX.Element {
  const { currentDocument, editorState, editorStore, setActiveDialog } = props;

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
