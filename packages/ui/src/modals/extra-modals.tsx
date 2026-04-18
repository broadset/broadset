import { Button, Input, Kbd, Modal } from '@heroui/react';
import { X } from 'lucide-react';
import { type ChangeEvent, type JSX, useCallback, useState } from 'react';

import { NumField } from '../inputs';
import { color, sp } from '../tokens';
import { DEFAULT_SHORTCUTS, LEFT_COLUMN_GROUPS, RIGHT_COLUMN_GROUPS } from './constants';
import { ModalShell } from './modal-shell';
import type { ShortcutMap, TemplateEntry } from './types';

export interface ShortcutHelpModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly shortcuts?: ShortcutMap | undefined;
}

export function ShortcutHelpModal({ isOpen, onClose, shortcuts }: ShortcutHelpModalProps): JSX.Element | null {
  const groups = { ...DEFAULT_SHORTCUTS, ...shortcuts };

  return (
    <ModalShell isOpen={isOpen} size="lg" title="Keyboard Shortcuts" onClose={onClose}>
      <Modal.Header>
        <span style={{ flex: 1, fontWeight: 700 }}>Keyboard Shortcuts</span>
        <Button aria-label="Close" isIconOnly size="sm" variant="ghost" onPress={onClose}>
          <X size={16} />
        </Button>
      </Modal.Header>
      <Modal.Body>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: sp('sp-05') }}>
          <div>
            {LEFT_COLUMN_GROUPS.map((groupName) => {
              const entries = groups[groupName];

              if (entries === undefined) return null;

              return (
                <div key={groupName} style={{ marginBottom: sp('sp-04') }}>
                  <h4 style={{ fontWeight: 600, marginBottom: sp('sp-02') }}>{groupName}</h4>
                  {entries.map((entry) => (
                    <div
                      key={entry.action}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: `${sp('sp-01')} 0`,
                      }}
                    >
                      <span>{entry.action}</span>
                      <span>
                        {entry.keys.map((key, i) => (
                          <Kbd key={i}>{key}</Kbd>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <div>
            {RIGHT_COLUMN_GROUPS.map((groupName) => {
              const entries = groups[groupName];

              if (entries === undefined) return null;

              return (
                <div key={groupName} style={{ marginBottom: sp('sp-04') }}>
                  <h4 style={{ fontWeight: 600, marginBottom: sp('sp-02') }}>{groupName}</h4>
                  {entries.map((entry) => (
                    <div
                      key={entry.action}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: `${sp('sp-01')} 0`,
                      }}
                    >
                      <span>{entry.action}</span>
                      <span>
                        {entry.keys.map((key, i) => (
                          <Kbd key={i}>{key}</Kbd>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </Modal.Body>
    </ModalShell>
  );
}

export interface GuidePositionModalProps {
  readonly isOpen: boolean;
  readonly position: number;
  readonly unit: string;
  readonly onApply: (position: number) => void;
  readonly onDelete: () => void;
  readonly onClose: () => void;
}

export function GuidePositionModal({
  isOpen,
  position,
  unit,
  onApply,
  onDelete,
  onClose,
}: GuidePositionModalProps): JSX.Element | null {
  const [localPosition, setLocalPosition] = useState(position);

  const handleApply = useCallback(() => {
    onApply(localPosition);
  }, [localPosition, onApply]);

  const handleKeyDown = useCallback(
    (event: { readonly key: string; preventDefault(): void; stopPropagation(): void }) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    },
    [onClose],
  );

  return (
    <ModalShell isOpen={isOpen} size="sm" title="Guide Position" onClose={onClose}>
      <Modal.Header>
        <span style={{ flex: 1, fontWeight: 700 }}>Guide Position</span>
      </Modal.Header>
      <Modal.Body>
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- wrapper only exists to capture Escape for the inner NumField; the modal's default Escape handler is reserved for dismissing the dialog. */}
        <div onKeyDown={handleKeyDown}>
          <NumField label={`Position (${unit})`} value={localPosition} onChange={setLocalPosition} onCommit={onApply} />
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button aria-label="Delete guide" variant="danger" onPress={onDelete}>
          Delete
        </Button>
        <Button aria-label="Apply" variant="primary" onPress={handleApply}>
          Apply
        </Button>
      </Modal.Footer>
    </ModalShell>
  );
}

export interface TemplateBrowserModalProps {
  readonly isOpen: boolean;
  readonly templates: readonly TemplateEntry[];
  readonly hasUnsavedChanges: boolean;
  readonly onSelectTemplate: (template: TemplateEntry) => void;
  readonly onClose: () => void;
}

export function TemplateBrowserModal({
  isOpen,
  templates,
  hasUnsavedChanges,
  onSelectTemplate,
  onClose,
}: TemplateBrowserModalProps): JSX.Element | null {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateEntry | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const filteredTemplates = templates.filter(
    (t) => searchQuery === '' || t.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const groupedTemplates = filteredTemplates.reduce<Record<string, TemplateEntry[]>>((acc, t) => {
    const group = acc[t.category] ?? [];

    group.push(t);
    acc[t.category] = group;

    return acc;
  }, {});

  const sortedCategories = Object.keys(groupedTemplates).sort((a, b) => a.localeCompare(b));

  const handleCreate = useCallback(() => {
    if (selectedTemplate === null) return;

    if (hasUnsavedChanges) {
      setShowConfirmation(true);
    } else {
      onSelectTemplate(selectedTemplate);
    }
  }, [selectedTemplate, hasUnsavedChanges, onSelectTemplate]);

  const handleConfirmCreate = useCallback(() => {
    if (selectedTemplate !== null) {
      onSelectTemplate(selectedTemplate);
    }
  }, [selectedTemplate, onSelectTemplate]);

  return (
    <ModalShell isOpen={isOpen} size="lg" title="Template Browser" onClose={onClose}>
      <Modal.Header>
        <span style={{ flex: 1, fontWeight: 700 }}>Template Browser</span>
      </Modal.Header>
      <Modal.Body>
        <Input
          aria-label="Search templates"
          value={searchQuery}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setSearchQuery(e.currentTarget.value);
          }}
        />

        {templates.length === 0 ?
          <p style={{ color: color('muted'), textAlign: 'center', padding: sp('sp-05') }}>No templates available</p>
        : filteredTemplates.length === 0 ?
          <p style={{ color: color('muted'), textAlign: 'center', padding: sp('sp-05') }}>No templates found</p>
        : sortedCategories.map((category) => (
            <div key={category} style={{ marginTop: sp('sp-04') }}>
              <h4 style={{ fontWeight: 600, marginBottom: sp('sp-02') }}>{category}</h4>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                  gap: sp('sp-03'),
                }}
              >
                {groupedTemplates[category]?.map((template) => (
                  <Button
                    key={template.id}
                    aria-label={template.name}
                    style={{
                      border:
                        selectedTemplate?.id === template.id ? `2px solid ${color('accent')}` : '1px solid transparent',
                      padding: sp('sp-02'),
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                    }}
                    variant="ghost"
                    onPress={() => {
                      setSelectedTemplate(template);
                    }}
                  >
                    <img alt={template.name} src={template.thumbnail} style={{ width: '100%', height: 'auto' }} />
                    <span>{template.name}</span>
                  </Button>
                ))}
              </div>
            </div>
          ))
        }

        {showConfirmation && (
          <div
            aria-label="Confirmation"
            style={{
              marginTop: sp('sp-04'),
              padding: sp('sp-04'),
              borderRadius: '8px',
              backgroundColor: color('surface-secondary'),
            }}
          >
            <p>You have unsaved changes. Creating a new document will discard them.</p>
            <div style={{ display: 'flex', gap: sp('sp-02'), marginTop: sp('sp-03') }}>
              <Button
                variant="ghost"
                onPress={() => {
                  setShowConfirmation(false);
                }}
              >
                Cancel
              </Button>
              <Button variant="danger" onPress={handleConfirmCreate}>
                Discard &amp; Create
              </Button>
            </div>
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="ghost" onPress={onClose}>
          Cancel
        </Button>
        <Button
          aria-label="Create from template"
          isDisabled={selectedTemplate === null}
          variant="primary"
          onPress={handleCreate}
        >
          Create
        </Button>
      </Modal.Footer>
    </ModalShell>
  );
}
