import { Button, type ButtonRootProps, Dropdown, Tooltip } from '@heroui/react';
import { useRef } from 'react';

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
      <Dropdown.Trigger
        aria-label={label}
        className="button button--icon-only button--sm button--ghost"
        style={{
          alignItems: 'center',
          display: 'inline-flex',
          justifyContent: 'center',
        }}
      >
        {icon}
      </Dropdown.Trigger>
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
  activateOnPressStart = false,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
  readonly activateOnPressStart?: boolean | undefined;
  readonly isActive?: boolean | undefined;
  readonly isDisabled?: boolean | undefined;
  readonly onPress: () => void;
  readonly testId?: string | undefined;
  readonly tooltipPlacement?: 'bottom' | 'left' | 'right' | 'top' | undefined;
}): React.JSX.Element {
  const hasStartedPressRef = useRef(false);
  const handlePressStart = (): void => {
    hasStartedPressRef.current = true;
    onPress();
  };
  const handlePress = (): void => {
    if (hasStartedPressRef.current) {
      hasStartedPressRef.current = false;

      return;
    }

    onPress();
  };
  const handlePressEnd = (): void => {
    queueMicrotask(() => {
      hasStartedPressRef.current = false;
    });
  };
  const pressProps: Pick<ButtonRootProps, 'onPress' | 'onPressEnd' | 'onPressStart'> =
    activateOnPressStart ?
      { onPress: handlePress, onPressEnd: handlePressEnd, onPressStart: handlePressStart }
    : { onPress };

  return (
    <Tooltip delay={0}>
      <Button
        aria-label={label}
        data-testid={testId}
        isDisabled={isDisabled}
        isIconOnly
        size="sm"
        variant={isActive ? 'primary' : 'ghost'}
        {...pressProps}
      >
        {children}
      </Button>
      <Tooltip.Content placement={tooltipPlacement}>{label}</Tooltip.Content>
    </Tooltip>
  );
}
