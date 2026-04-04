import type { ElementTypeInfo } from '@broadset/ui';
import { Button, Tooltip } from '@heroui/react';
import type { LucideIcon } from 'lucide-react';
import {
  Circle,
  ClipboardCheck,
  Code,
  Film,
  Image,
  Layers,
  PenTool,
  Puzzle,
  QrCode,
  SlidersHorizontal,
  Square,
  Type,
} from 'lucide-react';
import type { JSX } from 'react';

// ---------------------------------------------------------------------------
// Element type registry for the toolbar
// ---------------------------------------------------------------------------

export const ELEMENT_TYPES: readonly ElementTypeInfo[] = [
  { type: 'text', label: 'Text' },
  { type: 'image', label: 'Image' },
  { type: 'svg', label: 'SVG' },
  { type: 'path', label: 'Path' },
  { type: 'rectangle', label: 'Rectangle' },
  { type: 'ellipse', label: 'Ellipse' },
  { type: 'qrcode', label: 'QR Code' },
];

// Map element type → lucide icon for the icon-only toolbar
export const ELEMENT_ICON_MAP: Record<string, LucideIcon> = {
  text: Type,
  image: Image,
  svg: Code,
  path: PenTool,
  rectangle: Square,
  ellipse: Circle,
  qrcode: QrCode,
};

export const ELEMENT_FALLBACK_ICON: LucideIcon = Puzzle;

// Map sidebar tab → lucide icon for the collapsed strip
export const SIDEBAR_ICON_MAP = {
  layers: Layers,
  properties: SlidersHorizontal,
  animation: Film,
  preflight: ClipboardCheck,
} as const satisfies Record<string, LucideIcon>;

// ---------------------------------------------------------------------------
// ToolbarButton — icon-only Button with auto-positioned Tooltip
// ---------------------------------------------------------------------------

interface ToolbarButtonProps {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly onPress: () => void;
  readonly isDisabled?: boolean;
  readonly 'data-testid'?: string;
  readonly 'data-playing'?: string;
}

export function ToolbarButton({
  icon: Icon,
  label,
  onPress,
  isDisabled = false,
  ...rest
}: ToolbarButtonProps): JSX.Element {
  return (
    <Tooltip>
      <Tooltip.Trigger>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={label}
          onPress={onPress}
          isDisabled={isDisabled}
          data-testid={rest['data-testid']}
          data-playing={rest['data-playing']}
        >
          <Icon size={16} />
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
  );
}
