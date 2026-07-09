import { Accordion, Button, ButtonGroup, Chip, ListBox, Select } from '@heroui/react';
import { Copy, Lock, Pencil, Plus, Trash2, Type } from 'lucide-react';
import type { JSX } from 'react';

import { ToggleSwitch } from './inputs';
import type { PanelElement } from './panel-types';
import { ICON_SIZE } from './panel-types';
import { color, font, glassPanelStyle, sp } from './tokens';

/* ------------------------------------------------------------------ */
/*  Local types                                                        */
/* ------------------------------------------------------------------ */

interface AnimationTimelineInfo {
  readonly id: string;
  readonly name: string;
  readonly keyframes: readonly unknown[];
}

interface AnimationStateBinding {
  readonly stateName: string;
  readonly timelineId: string;
}

interface AnimationModifierBinding {
  readonly modifierName: string;
  readonly inTimelineId: string;
  readonly outTimelineId?: string | undefined;
}

function formatTimelineTime(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/* ------------------------------------------------------------------ */
/*  AnimationSidebar                                                   */
/* ------------------------------------------------------------------ */

export interface AnimationSidebarProps {
  readonly element: PanelElement | null;
  readonly isLocked: boolean;
  readonly animationsEnabled: boolean;
  readonly timelines: readonly AnimationTimelineInfo[] | undefined;
  readonly stateBindings: readonly AnimationStateBinding[] | undefined;
  readonly modifierBindings: readonly AnimationModifierBinding[] | undefined;
  readonly availableStates: readonly string[];
  readonly availableModifiers: readonly string[];
  readonly activeState: string | null;
  readonly activeModifiers: readonly string[];
  readonly editingTimelineId?: string | undefined;
  readonly isTimelinePreviewPlaying?: boolean | undefined;
  readonly timelinePreviewCurrentTimeMs?: number | undefined;
  readonly onSelectState: (state: string | null) => void;
  readonly onToggleModifier: (modifier: string) => void;
  readonly onAddTimeline: () => void;
  readonly onEditTimeline: (id: string) => void;
  readonly onDeleteTimeline: (id: string) => void;
  readonly onDuplicateTimeline: (id: string) => void;
  readonly onRenameTimeline: (id: string) => void;
  readonly onQuickSetup: () => void;
  readonly onAddStateBinding: () => void;
  readonly onRemoveStateBinding: (stateName: string) => void;
  readonly onAddModifierBinding: () => void;
  readonly onRemoveModifierBinding: (modifierName: string) => void;
}

export function AnimationSidebar({
  element,
  isLocked,
  animationsEnabled,
  timelines,
  stateBindings,
  modifierBindings,
  availableStates,
  availableModifiers,
  activeState,
  activeModifiers,
  editingTimelineId,
  isTimelinePreviewPlaying = false,
  timelinePreviewCurrentTimeMs = 0,
  onSelectState,
  onToggleModifier,
  onAddTimeline,
  onEditTimeline,
  onDeleteTimeline,
  onDuplicateTimeline,
  onRenameTimeline,
  onQuickSetup,
  onAddStateBinding,
  onRemoveStateBinding,
  onAddModifierBinding,
  onRemoveModifierBinding,
}: AnimationSidebarProps): JSX.Element {
  const safeTimelines: readonly AnimationTimelineInfo[] = timelines ?? [];
  const safeStateBindings: readonly AnimationStateBinding[] = stateBindings ?? [];
  const safeModifierBindings: readonly AnimationModifierBinding[] = modifierBindings ?? [];

  if (!element) {
    return (
      <aside
        aria-label="Animation Sidebar"
        style={{
          ...glassPanelStyle(),
          padding: sp('sp-04'),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: color('muted'),
          fontSize: font('body-compact'),
        }}
      >
        <span>Select an element to configure animations</span>
      </aside>
    );
  }

  if (!animationsEnabled) {
    return (
      <aside
        aria-label="Animation Sidebar"
        style={{
          ...glassPanelStyle(),
          padding: sp('sp-04'),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: color('muted'),
          fontSize: font('body-compact'),
        }}
      >
        <span>Animation is disabled for this document</span>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Animation Sidebar"
      style={{
        ...glassPanelStyle(),
        padding: sp('sp-04'),
        display: 'flex',
        flexDirection: 'column',
        gap: sp('sp-03'),
        fontSize: font('body-compact'),
      }}
    >
      {/* Header: element name and type chip */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: sp('sp-02'),
          borderBottom: `1px solid ${color('border')}`,
          paddingBottom: sp('sp-02'),
        }}
      >
        <span
          style={{
            fontWeight: 600,
            color: color('foreground'),
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {element.name}
        </span>
        <Chip size="sm">{element.type}</Chip>
      </header>

      {/* Lock helper */}
      {isLocked && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: sp('sp-02'),
            padding: sp('sp-02'),
            borderRadius: 6,
            backgroundColor: color('surface-secondary'),
            color: color('muted'),
            fontSize: font('label'),
          }}
        >
          <Lock size={ICON_SIZE} />
          <span>Element is locked — animation edits are disabled</span>
        </div>
      )}

      {/* Accordion sections */}
      <Accordion>
        {/* Active States & Modifiers */}
        <Accordion.Item id="states-modifiers">
          <Accordion.Heading>
            <Accordion.Trigger>Active States &amp; Modifiers</Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-03') }}>
              <div>
                <span
                  style={{
                    color: color('muted'),
                    fontSize: font('label'),
                    display: 'block',
                    marginBottom: sp('sp-01'),
                  }}
                >
                  State
                </span>
                <Select
                  aria-label="Active state"
                  isDisabled={isLocked}
                  value={activeState ?? ''}
                  onChange={(key) => {
                    onSelectState(key === '' || key == null ? null : String(key));
                  }}
                >
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      <ListBox.Item id="" textValue="None">
                        None
                      </ListBox.Item>
                      {availableStates.map((s) => (
                        <ListBox.Item id={s} key={s} textValue={s}>
                          {s}
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
              </div>

              {availableModifiers.length > 0 && (
                <div>
                  <span
                    style={{
                      color: color('muted'),
                      fontSize: font('label'),
                      display: 'block',
                      marginBottom: sp('sp-01'),
                    }}
                  >
                    Modifiers
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-01') }}>
                    {availableModifiers.map((m) => (
                      <ToggleSwitch
                        key={m}
                        ariaLabel={`Toggle ${m}`}
                        isDisabled={isLocked}
                        isSelected={activeModifiers.includes(m)}
                        onChange={() => {
                          onToggleModifier(m);
                        }}
                      >
                        {m}
                      </ToggleSwitch>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Accordion.Panel>
        </Accordion.Item>

        {/* Timelines */}
        <Accordion.Item id="timelines">
          <Accordion.Heading>
            <Accordion.Trigger>Timelines</Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-02') }}>
              {safeTimelines.map((tl) => {
                const isEditing = tl.id === editingTimelineId;

                return (
                  <div
                    key={tl.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: sp('sp-02'),
                      padding: sp('sp-02'),
                      border: `1px solid ${isEditing ? color('accent') : color('border')}`,
                      borderRadius: 6,
                      backgroundColor: isEditing ? color('surface-tertiary') : 'transparent',
                    }}
                  >
                    <span
                      style={{
                        width: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: color('foreground'),
                        fontWeight: isEditing ? 600 : 400,
                      }}
                    >
                      {tl.name}
                    </span>
                    <div
                      style={{
                        display: 'flex',
                        minWidth: 0,
                        width: '100%',
                        alignItems: 'center',
                        gap: sp('sp-01'),
                      }}
                    >
                      <span style={{ minWidth: 0, flex: 1, color: color('muted'), fontSize: font('label') }}>
                        {`${String(tl.keyframes.length)} keyframes${
                          isEditing ? ` · ${formatTimelineTime(timelinePreviewCurrentTimeMs)}` : ''
                        }`}
                      </span>
                      {isEditing ?
                        <Chip size="sm">Editing</Chip>
                      : null}
                      {isEditing ?
                        <Chip size="sm">{isTimelinePreviewPlaying ? 'Playing' : 'Paused'}</Chip>
                      : null}
                      <ButtonGroup size="sm">
                        <Button
                          aria-label={`Edit ${tl.name}`}
                          isDisabled={isLocked}
                          isIconOnly
                          variant={isEditing ? 'primary' : 'ghost'}
                          onPress={() => {
                            onEditTimeline(tl.id);
                          }}
                        >
                          <Pencil size={ICON_SIZE} />
                        </Button>
                        <Button
                          aria-label={`Rename ${tl.name}`}
                          isDisabled={isLocked}
                          isIconOnly
                          variant="ghost"
                          onPress={() => {
                            onRenameTimeline(tl.id);
                          }}
                        >
                          <Type size={ICON_SIZE} />
                        </Button>
                        <Button
                          aria-label={`Duplicate ${tl.name}`}
                          isDisabled={isLocked}
                          isIconOnly
                          variant="ghost"
                          onPress={() => {
                            onDuplicateTimeline(tl.id);
                          }}
                        >
                          <Copy size={ICON_SIZE} />
                        </Button>
                        <Button
                          aria-label={`Delete ${tl.name}`}
                          isDisabled={isLocked}
                          isIconOnly
                          variant="ghost"
                          onPress={() => {
                            onDeleteTimeline(tl.id);
                          }}
                        >
                          <Trash2 size={ICON_SIZE} />
                        </Button>
                      </ButtonGroup>
                    </div>
                  </div>
                );
              })}

              <div style={{ display: 'flex', gap: sp('sp-02') }}>
                <Button
                  aria-label="Add Timeline"
                  isDisabled={isLocked}
                  size="sm"
                  variant="ghost"
                  onPress={onAddTimeline}
                >
                  <Plus size={ICON_SIZE} />
                  Add Timeline
                </Button>
                <Button aria-label="Quick setup" isDisabled={isLocked} size="sm" variant="ghost" onPress={onQuickSetup}>
                  Quick setup
                </Button>
              </div>
            </div>
          </Accordion.Panel>
        </Accordion.Item>

        {/* State Timeline Bindings */}
        <Accordion.Item id="state-bindings">
          <Accordion.Heading>
            <Accordion.Trigger>State Timeline Bindings</Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-02') }}>
              {safeStateBindings.length === 0 ?
                <span style={{ color: color('muted'), fontSize: font('label') }}>No state bindings configured</span>
              : safeStateBindings.map((binding) => (
                  <div
                    key={binding.stateName}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: sp('sp-02'),
                      padding: `${sp('sp-01')} 0`,
                    }}
                  >
                    <Chip size="sm">{binding.stateName}</Chip>
                    <span style={{ flex: 1, color: color('muted'), fontSize: font('label') }}>
                      → Timeline {binding.timelineId}
                    </span>
                    <Button
                      aria-label={`Remove ${binding.stateName} binding`}
                      isDisabled={isLocked}
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      onPress={() => {
                        onRemoveStateBinding(binding.stateName);
                      }}
                    >
                      <Trash2 size={ICON_SIZE} />
                    </Button>
                  </div>
                ))
              }
              <Button
                aria-label="Add state binding"
                isDisabled={isLocked}
                size="sm"
                variant="ghost"
                onPress={onAddStateBinding}
              >
                <Plus size={ICON_SIZE} />
                Add binding
              </Button>
            </div>
          </Accordion.Panel>
        </Accordion.Item>

        {/* Modifier Timeline Bindings */}
        <Accordion.Item id="modifier-bindings">
          <Accordion.Heading>
            <Accordion.Trigger>Modifier Timeline Bindings</Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-02') }}>
              {safeModifierBindings.length === 0 ?
                <span style={{ color: color('muted'), fontSize: font('label') }}>No modifier bindings configured</span>
              : safeModifierBindings.map((binding) => (
                  <div
                    key={binding.modifierName}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: sp('sp-02'),
                      padding: `${sp('sp-01')} 0`,
                    }}
                  >
                    <Chip size="sm">{binding.modifierName}</Chip>
                    <span style={{ flex: 1, color: color('muted'), fontSize: font('label') }}>
                      → In: {binding.inTimelineId}
                      {binding.outTimelineId != null ? `, Out: ${binding.outTimelineId}` : ''}
                    </span>
                    <Button
                      aria-label={`Remove ${binding.modifierName} binding`}
                      isDisabled={isLocked}
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      onPress={() => {
                        onRemoveModifierBinding(binding.modifierName);
                      }}
                    >
                      <Trash2 size={ICON_SIZE} />
                    </Button>
                  </div>
                ))
              }
              <Button
                aria-label="Add modifier binding"
                isDisabled={isLocked}
                size="sm"
                variant="ghost"
                onPress={onAddModifierBinding}
              >
                <Plus size={ICON_SIZE} />
                Add binding
              </Button>
            </div>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </aside>
  );
}
