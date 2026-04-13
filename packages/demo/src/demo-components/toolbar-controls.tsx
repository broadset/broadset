import { Button, Dropdown, Tooltip } from '@heroui/react';

export function ToolbarMenu({
  label,
  icon,
  children,
}: {
  readonly label: string;
  readonly icon: React.ReactNode;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Dropdown>
      <Button aria-label={label} isIconOnly size="sm" variant="ghost">
        {icon}
      </Button>
      <Dropdown.Popover>
        <Dropdown.Menu aria-label={`${label} menu`}>{children}</Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

export function IconToolButton({
  label,
  children,
  isActive = false,
  isDisabled = false,
  onPress,
  testId,
  tooltipPlacement = 'bottom',
}: {
  readonly label: string;
  readonly children: React.ReactNode;
  readonly isActive?: boolean | undefined;
  readonly isDisabled?: boolean | undefined;
  readonly onPress: () => void;
  readonly testId?: string | undefined;
  readonly tooltipPlacement?: 'bottom' | 'left' | 'right' | 'top' | undefined;
}): React.JSX.Element {
  return (
    <Tooltip delay={0}>
      <Button
        aria-label={label}
        data-testid={testId}
        isDisabled={isDisabled}
        isIconOnly
        size="sm"
        variant={isActive ? 'primary' : 'ghost'}
        onPress={onPress}
      >
        {children}
      </Button>
      <Tooltip.Content placement={tooltipPlacement}>{label}</Tooltip.Content>
    </Tooltip>
  );
}
