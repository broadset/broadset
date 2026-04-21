import { color, glassPanelStyle, sp } from '@broadset/ui';
import { Button, Toolbar, Tooltip } from '@heroui/react';
import { Layers, LayoutTemplate, Plus, ShieldCheck, Sliders, Workflow, X } from 'lucide-react';

import { IconToolButton } from '../demo-components';
import { FLOATING_OFFSET } from '../demo-types';
import { ELEMENT_TOOL_TYPES } from './constants';
import type { DemoAppLayoutProps } from './layout-types';

export function LayoutSideRails(props: DemoAppLayoutProps): React.JSX.Element {
  const {
    canvasSettings,
    editorState,
    handleElementSelect,
    handleSidebarTabToggle,
    isSidebarOpen,
    selectedElement,
    setIsSidebarOpen,
    sidebarTab,
  } = props;

  const isExperimental = canvasSettings.showExperimentalFeatures;

  const activePlacement = editorState.placement;
  const activePlacementType =
    activePlacement !== null && 'elementType' in activePlacement ? activePlacement.elementType : null;

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
                      isActive={activePlacementType === elementType.type}
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
                <Tooltip.Content placement="bottom">Close sidebar</Tooltip.Content>
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
            tooltipPlacement="bottom"
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
            tooltipPlacement="bottom"
          >
            <Sliders size={16} />
          </IconToolButton>
          {isExperimental ?
            <IconToolButton
              isActive={isSidebarOpen && sidebarTab === 'animation'}
              isDisabled={selectedElement === null}
              label="Animation"
              onPress={() => {
                handleSidebarTabToggle('animation');
              }}
              tooltipPlacement="bottom"
            >
              <Workflow size={16} />
            </IconToolButton>
          : null}
          {isExperimental ?
            <IconToolButton
              isActive={isSidebarOpen && sidebarTab === 'preflight'}
              label="Pre-flight"
              onPress={() => {
                handleSidebarTabToggle('preflight');
              }}
              tooltipPlacement="bottom"
            >
              <ShieldCheck size={16} />
            </IconToolButton>
          : null}
          {isExperimental ?
            <IconToolButton
              isActive={isSidebarOpen && sidebarTab === 'template-groups'}
              label="Template Groups"
              onPress={() => {
                handleSidebarTabToggle('template-groups');
              }}
              tooltipPlacement="bottom"
            >
              <LayoutTemplate size={16} />
            </IconToolButton>
          : null}
        </Toolbar>
      </div>
    </>
  );
}
