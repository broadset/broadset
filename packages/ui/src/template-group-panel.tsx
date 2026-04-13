import type { TemplateGroup, TemplateGroupRole } from '@broadset/model';
import { Accordion, Button, Input, ListBox, Select } from '@heroui/react';
import { Folder, Pencil, Plus, Trash2 } from 'lucide-react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';

import { FieldShell, ICON_SIZE, isTemplateGroupRole, TEMPLATE_GROUP_ROLE_OPTIONS } from './panel-types';
import { color, font, glassPanelStyle, sp } from './tokens';

/* ------------------------------------------------------------------ */
/*  TemplateGroupPanel                                                 */
/* ------------------------------------------------------------------ */

export interface TemplateGroupPanelProps {
  /** All template groups in the project. */
  readonly groups: readonly TemplateGroup[];
  /** Available documents to be assigned as members. */
  readonly availableDocuments: readonly { readonly id: string; readonly name: string }[];
  readonly onCreateGroup: (name: string) => void;
  readonly onRemoveGroup: (groupId: string) => void;
  readonly onRenameGroup: (groupId: string, newName: string) => void;
  readonly onAddMember: (groupId: string, documentId: string, role: TemplateGroupRole) => void;
  readonly onRemoveMember: (groupId: string, documentId: string) => void;
  readonly onUpdateMemberRole: (groupId: string, documentId: string, role: TemplateGroupRole, label?: string) => void;
}

/**
 * Project-level panel for managing template groups (multi-format document linking).
 */
export function TemplateGroupPanel({
  groups,
  availableDocuments,
  onCreateGroup,
  onRemoveGroup,
  onRenameGroup,
  onAddMember,
  onRemoveMember,
  onUpdateMemberRole,
}: TemplateGroupPanelProps): JSX.Element {
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleCreateGroup = useCallback(() => {
    const trimmed = newGroupName.trim();

    if (trimmed.length > 0) {
      onCreateGroup(trimmed);
      setNewGroupName('');
    }
  }, [newGroupName, onCreateGroup]);

  const startRename = useCallback((groupId: string, currentName: string) => {
    setEditingGroupId(groupId);
    setEditingName(currentName);
  }, []);

  const commitRename = useCallback(() => {
    if (editingGroupId !== null && editingName.trim().length > 0) {
      onRenameGroup(editingGroupId, editingName.trim());
    }

    setEditingGroupId(null);
    setEditingName('');
  }, [editingGroupId, editingName, onRenameGroup]);

  return (
    <aside
      aria-label="Template Groups"
      role="region"
      style={{
        ...glassPanelStyle(),
        display: 'flex',
        flexDirection: 'column',
        gap: sp('sp-03'),
        padding: sp('sp-03'),
      }}
    >
      <span style={{ fontSize: font('body-compact'), fontWeight: 600, color: color('foreground') }}>
        Template Groups
      </span>

      {/* Create new group */}
      <div style={{ display: 'flex', gap: sp('sp-02'), alignItems: 'flex-end' }}>
        <Input
          aria-label="New group name"
          placeholder="Group name"
          value={newGroupName}
          onChange={(e) => {
            setNewGroupName(e.currentTarget.value);
          }}
        />
        <Button
          aria-label="Create template group"
          isDisabled={newGroupName.trim().length === 0}
          size="sm"
          variant="ghost"
          onPress={handleCreateGroup}
        >
          <Plus size={ICON_SIZE} />
          Add
        </Button>
      </div>

      {/* Group list */}
      {groups.length === 0 ?
        <span style={{ color: color('muted'), fontSize: font('label') }}>No template groups</span>
      : <Accordion allowsMultipleExpanded>
          {groups.map((group) => (
            <Accordion.Item key={group.groupId} id={group.groupId}>
              <Accordion.Heading>
                <Accordion.Trigger>
                  {editingGroupId === group.groupId ?
                    <Input
                      aria-label="Rename group"
                      autoFocus
                      value={editingName}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename();
                      }}
                      onChange={(e) => {
                        setEditingName(e.currentTarget.value);
                      }}
                    />
                  : <div style={{ display: 'flex', alignItems: 'center', gap: sp('sp-02') }}>
                      <Folder size={ICON_SIZE} />
                      <span style={{ flex: 1 }}>{group.name}</span>
                    </div>
                  }
                </Accordion.Trigger>
              </Accordion.Heading>
              <div style={{ display: 'flex', gap: sp('sp-01') }}>
                <Button
                  aria-label={`Rename ${group.name}`}
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  onPress={() => {
                    startRename(group.groupId, group.name);
                  }}
                >
                  <Pencil size={ICON_SIZE} />
                </Button>
                <Button
                  aria-label={`Remove ${group.name}`}
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  onPress={() => {
                    onRemoveGroup(group.groupId);
                  }}
                >
                  <Trash2 size={ICON_SIZE} />
                </Button>
              </div>
              <Accordion.Panel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-02') }}>
                  {/* Existing members */}
                  {group.members.map((member) => {
                    const doc = availableDocuments.find((d) => d.id === member.documentId);

                    return (
                      <div
                        key={member.documentId}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: sp('sp-02'),
                          padding: `${sp('sp-01')} 0`,
                        }}
                      >
                        <span
                          style={{
                            flex: 1,
                            fontSize: font('label'),
                            color: doc ? color('foreground') : color('danger'),
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {doc?.name ?? member.documentId}
                          {member.label ? ` (${member.label})` : ''}
                        </span>
                        <FieldShell label="Role">
                          <Select
                            aria-label={`Role for ${doc?.name ?? member.documentId}`}
                            value={member.role}
                            onChange={(key) => {
                              if (key !== null) {
                                const val = String(key);

                                if (isTemplateGroupRole(val)) {
                                  onUpdateMemberRole(group.groupId, member.documentId, val);
                                }
                              }
                            }}
                          >
                            <Select.Trigger>
                              <Select.Value />
                              <Select.Indicator />
                            </Select.Trigger>
                            <Select.Popover>
                              <ListBox>
                                {TEMPLATE_GROUP_ROLE_OPTIONS.map((opt) => (
                                  <ListBox.Item id={opt} key={opt} textValue={opt}>
                                    {opt}
                                  </ListBox.Item>
                                ))}
                              </ListBox>
                            </Select.Popover>
                          </Select>
                        </FieldShell>
                        <Button
                          aria-label={`Remove ${doc?.name ?? member.documentId} from group`}
                          isIconOnly
                          size="sm"
                          variant="ghost"
                          onPress={() => {
                            onRemoveMember(group.groupId, member.documentId);
                          }}
                        >
                          <Trash2 size={ICON_SIZE} />
                        </Button>
                      </div>
                    );
                  })}

                  {/* Add member */}
                  <TemplateGroupAddMember
                    availableDocuments={availableDocuments}
                    existingMemberIds={group.members.map((m) => m.documentId)}
                    groupId={group.groupId}
                    onAddMember={onAddMember}
                  />
                </div>
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      }
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/*  TemplateGroupAddMember (internal)                                  */
/* ------------------------------------------------------------------ */

/** Internal component for adding a member to a template group. */
function TemplateGroupAddMember({
  groupId,
  availableDocuments,
  existingMemberIds,
  onAddMember,
}: {
  readonly groupId: string;
  readonly availableDocuments: readonly { readonly id: string; readonly name: string }[];
  readonly existingMemberIds: readonly string[];
  readonly onAddMember: (groupId: string, documentId: string, role: TemplateGroupRole) => void;
}): JSX.Element {
  const unassigned = availableDocuments.filter((d) => !existingMemberIds.includes(d.id));
  const [selectedDoc, setSelectedDoc] = useState('');
  const [selectedRole, setSelectedRole] = useState<TemplateGroupRole>('16:9');

  const handleAdd = useCallback(() => {
    if (selectedDoc.length > 0) {
      onAddMember(groupId, selectedDoc, selectedRole);
      setSelectedDoc('');
      setSelectedRole('16:9');
    }
  }, [groupId, selectedDoc, selectedRole, onAddMember]);

  if (unassigned.length === 0) {
    return <span style={{ color: color('muted'), fontSize: font('label') }}>All documents assigned</span>;
  }

  return (
    <div style={{ display: 'flex', gap: sp('sp-02'), alignItems: 'flex-end' }}>
      <FieldShell label="Document">
        <Select
          aria-label="Select document to add"
          value={selectedDoc}
          onChange={(key) => {
            if (key !== null) setSelectedDoc(String(key));
          }}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {unassigned.map((doc) => (
                <ListBox.Item id={doc.id} key={doc.id} textValue={doc.name}>
                  {doc.name}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </FieldShell>
      <FieldShell label="Role">
        <Select
          aria-label="Select role for new member"
          value={selectedRole}
          onChange={(key) => {
            if (key !== null) {
              const val = String(key);

              if (isTemplateGroupRole(val)) {
                setSelectedRole(val);
              }
            }
          }}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {TEMPLATE_GROUP_ROLE_OPTIONS.map((opt) => (
                <ListBox.Item id={opt} key={opt} textValue={opt}>
                  {opt}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </FieldShell>
      <Button
        aria-label="Add member to group"
        isDisabled={selectedDoc.length === 0}
        size="sm"
        variant="ghost"
        onPress={handleAdd}
      >
        <Plus size={ICON_SIZE} />
      </Button>
    </div>
  );
}
