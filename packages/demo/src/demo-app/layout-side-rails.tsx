import { cancelPlacement } from '@broadset/editor';
import { color, font, glassPanelStyle, sp } from '@broadset/ui';
import { Button, Card, CardContent, Chip, Toolbar, Tooltip } from '@heroui/react';
import { Layers, LayoutTemplate, Plus, ShieldCheck, Sliders, Workflow, X } from 'lucide-react';

import { IconToolButton } from '../demo-components';
import { FLOATING_OFFSET } from '../demo-types';
import { ELEMENT_TOOL_TYPES } from './constants';
import type { DemoAppLayoutProps } from './layout-types';

export function LayoutSideRails(props: DemoAppLayoutProps): React.JSX.Element {
  const {
    editorState,
    editorStore,
    handleElementSelect,
    handleSidebarTabToggle,
    isSidebarOpen,
    placementLabel,
    pushToast,
    selectedElement,
    setIsSidebarOpen,
    sidebarTab,
  } = props;

  return (
    <>
      <div
        className="pointer-events-none absolute z-30"
        style={{
          left: `${String(FLOATING_OFFSET)}px`,
          top: `${String(FLOATING_OFFSET + 44)}px`,
        }}
      >
        <Toolbar
          aria-label="Element toolbar"
          className="pointer-events-auto"
          data-testid="demo-element-library"
          isAttached
          orientation="vertical"
          style={{
            ...glassPanelStyle(),
            borderRadius: '0.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: sp('sp-01'),
            padding: sp('sp-01'),
          }}
        >
          {ELEMENT_TOOL_TYPES.map((elementType) => {
            return (
              <Tooltip key={elementType.type} delay={0}>
                <Tooltip.Trigger>
                  <span>
                    <IconToolButton
                      isActive={editorState.pendingPlacementType === elementType.type}
                      label={elementType.label}
                      onPress={() => {
                        handleElementSelect(elementType.type);
                      }}
                      tooltipPlacement="right"
                    >
                      {elementType.icon ?? <Plus size={16} />}
                    </IconToolButton>
                  </span>
                </Tooltip.Trigger>
                <Tooltip.Content>{elementType.label}</Tooltip.Content>
              </Tooltip>
            );
          })}
        </Toolbar>
      </div>

      {editorState.pendingPlacementType ?
        <div
          className="pointer-events-none absolute z-30"
          data-testid="placement-mode-banner"
          style={{
            left: `${String(FLOATING_OFFSET + 72)}px`,
            top: `${String(FLOATING_OFFSET + 44)}px`,
          }}
        >
          <Card className="pointer-events-auto" style={glassPanelStyle()} variant="secondary">
            <CardContent className="flex items-center gap-3 p-3">
              <Chip color="warning" size="sm" variant="soft">
                Placement mode
              </Chip>
              <span style={{ color: color('foreground'), fontSize: font('body-compact') }}>
                {placementLabel} placement is active. Click the canvas to add a new element.
              </span>
              <Button
                aria-label="Cancel placement"
                size="sm"
                variant="ghost"
                onPress={() => {
                  cancelPlacement(editorStore);
                  pushToast('info', `${placementLabel} placement cancelled.`);
                }}
              >
                Cancel placement
              </Button>
            </CardContent>
          </Card>
        </div>
      : null}

      <div
        className="pointer-events-none absolute z-30"
        style={{
          right: `${String(FLOATING_OFFSET)}px`,
          top: `${String(FLOATING_OFFSET)}px`,
        }}
      >
        <Toolbar
          aria-label="Sidebar toolbar"
          className="pointer-events-auto"
          isAttached
          style={{
            ...glassPanelStyle(),
            alignItems: 'center',
            borderRadius: '0.75rem',
            display: 'flex',
            gap: sp('sp-01'),
            padding: sp('sp-01'),
          }}
        >
          {isSidebarOpen ?
            <>
              <Tooltip delay={0}>
                <Tooltip.Trigger>
                  <span>
                    <Button
                      aria-label="Close sidebar"
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      onPress={() => {
                        setIsSidebarOpen(false);
                      }}
                    >
                      <X size={16} />
                    </Button>
                  </span>
                </Tooltip.Trigger>
                <Tooltip.Content placement="left">Close sidebar</Tooltip.Content>
              </Tooltip>
              <span
                aria-hidden="true"
                style={{
                  backgroundColor: color('border'),
                  display: 'inline-block',
                  height: '18px',
                  width: '1px',
                }}
              />
            </>
          : null}

          <IconToolButton
            isActive={isSidebarOpen && sidebarTab === 'layers'}
            label="Layers"
            onPress={() => {
              handleSidebarTabToggle('layers');
            }}
            tooltipPlacement="left"
          >
            <Layers size={16} />
          </IconToolButton>
          <IconToolButton
            isActive={isSidebarOpen && sidebarTab === 'properties'}
            isDisabled={selectedElement === null}
            label="Properties"
            onPress={() => {
              handleSidebarTabToggle('properties');
            }}
            tooltipPlacement="left"
          >
            <Sliders size={16} />
          </IconToolButton>
          <IconToolButton
            isActive={isSidebarOpen && sidebarTab === 'animation'}
            isDisabled={selectedElement === null}
            label="Animation"
            onPress={() => {
              handleSidebarTabToggle('animation');
            }}
            tooltipPlacement="left"
          >
            <Workflow size={16} />
          </IconToolButton>
          <IconToolButton
            isActive={isSidebarOpen && sidebarTab === 'preflight'}
            label="Pre-flight"
            onPress={() => {
              handleSidebarTabToggle('preflight');
            }}
            tooltipPlacement="left"
          >
            <ShieldCheck size={16} />
          </IconToolButton>
          <IconToolButton
            isActive={isSidebarOpen && sidebarTab === 'template-groups'}
            label="Template Groups"
            onPress={() => {
              handleSidebarTabToggle('template-groups');
            }}
            tooltipPlacement="left"
          >
            <LayoutTemplate size={16} />
          </IconToolButton>
        </Toolbar>
      </div>
    </>
  );
}
