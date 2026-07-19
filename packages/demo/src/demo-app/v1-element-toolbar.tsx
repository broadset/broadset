import type { ProjectEditorStore } from '@broadset/editor';
import { Toolbar } from '@heroui/react';
import {
  Circle,
  Clock,
  CodeXml,
  Group,
  Image,
  MessageSquareText,
  PenTool,
  QrCode,
  Square,
  Timer,
  Type,
  Video,
} from 'lucide-react';

import { IconToolButton } from '../demo-components';
import { useEditorSelector } from './helpers';

interface V1ElementToolbarProps {
  readonly editorStore: ProjectEditorStore;
}

const PLACEMENT_TOOLS = [
  { icon: Type, label: 'Text', type: 'text' },
  { icon: Image, label: 'Image', type: 'image' },
  { icon: CodeXml, label: 'SVG', type: 'svg' },
  { icon: PenTool, label: 'Path', type: 'path' },
  { icon: Square, label: 'Rectangle', type: 'rectangle' },
  { icon: Circle, label: 'Ellipse', type: 'ellipse' },
  { icon: QrCode, label: 'QR code', type: 'qrcode' },
  { icon: Group, label: 'Group', type: 'group' },
  { icon: Video, label: 'Video', type: 'video' },
  { icon: Clock, label: 'Clock', type: 'clock' },
  { icon: MessageSquareText, label: 'Ticker', type: 'ticker' },
  { icon: Timer, label: 'Countdown', type: 'countdown' },
] as const;

export function V1ElementToolbar({ editorStore }: V1ElementToolbarProps): React.JSX.Element {
  const activeType = useEditorSelector(editorStore, (state) =>
    state.placement?.type === 'placement-anchor' ? state.placement.elementType : null,
  );

  return (
    <Toolbar aria-label="Element toolbar" isAttached>
      {PLACEMENT_TOOLS.map((tool) => {
        const Icon = tool.icon;

        return (
          <IconToolButton
            isActive={activeType === tool.type}
            key={tool.type}
            label={tool.label}
            onPress={() => {
              const state = editorStore.getState();

              if (state.placement?.type === 'placement-anchor' && state.placement.elementType === tool.type) {
                state.cancelPlacement();
              } else {
                state.beginPlacement(tool.type);
              }
            }}
          >
            <Icon aria-hidden="true" size={16} />
          </IconToolButton>
        );
      })}
    </Toolbar>
  );
}
