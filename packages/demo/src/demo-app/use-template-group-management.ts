import {
  addGroupMember,
  createTemplateGroup,
  removeGroupMember,
  removeTemplateGroup,
  renameTemplateGroup,
  updateMemberRole,
} from '@broadset/editor';
import type { BroadsetDocument, BroadsetProject, TemplateGroup, TemplateGroupRole } from '@broadset/model';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useMemo } from 'react';

export interface UseTemplateGroupManagementOptions {
  readonly currentDocument: BroadsetDocument;
  readonly templateGroups: readonly TemplateGroup[];
  readonly setTemplateGroups: Dispatch<SetStateAction<TemplateGroup[]>>;
}

export interface TemplateGroupManagementResult {
  readonly availableDocuments: readonly { readonly id: string; readonly name: string }[];
  readonly handleCreateGroup: (name: string) => void;
  readonly handleRemoveGroup: (groupId: string) => void;
  readonly handleRenameGroup: (groupId: string, newName: string) => void;
  readonly handleAddMember: (groupId: string, documentId: string, role: TemplateGroupRole) => void;
  readonly handleRemoveMember: (groupId: string, documentId: string) => void;
  readonly handleUpdateMemberRole: (
    groupId: string,
    documentId: string,
    role: TemplateGroupRole,
    label?: string,
  ) => void;
}

export function useTemplateGroupManagement({
  currentDocument,
  templateGroups,
  setTemplateGroups,
}: UseTemplateGroupManagementOptions): TemplateGroupManagementResult {
  const projectForTemplateOps = useMemo<BroadsetProject>(
    () => ({
      schemaVersion: 1 as const,
      id: 'demo-project',
      name: 'Demo Project',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      settings: { fonts: [], palette: [], defaultDocumentMode: 'screen' as const },
      assets: [],
      documents: [currentDocument],
      templateGroups: templateGroups.map((group) => ({
        ...group,
        members: [...group.members],
      })),
    }),
    [currentDocument, templateGroups],
  );

  const availableDocuments = useMemo(
    () => [{ id: currentDocument.id, name: currentDocument.name }],
    [currentDocument.id, currentDocument.name],
  );

  const handleCreateGroup = useCallback(
    (name: string): void => {
      const groupId = `tg-${crypto.randomUUID().slice(0, 8)}`;
      const firstMember = { documentId: currentDocument.id, role: '16:9' as TemplateGroupRole };
      const updated = createTemplateGroup(projectForTemplateOps, groupId, name, firstMember);

      setTemplateGroups(updated.templateGroups ?? []);
    },
    [currentDocument.id, projectForTemplateOps, setTemplateGroups],
  );

  const handleRemoveGroup = useCallback(
    (groupId: string): void => {
      const updated = removeTemplateGroup(projectForTemplateOps, groupId);

      setTemplateGroups(updated.templateGroups ?? []);
    },
    [projectForTemplateOps, setTemplateGroups],
  );

  const handleRenameGroup = useCallback(
    (groupId: string, newName: string): void => {
      const updated = renameTemplateGroup(projectForTemplateOps, groupId, newName);

      setTemplateGroups(updated.templateGroups ?? []);
    },
    [projectForTemplateOps, setTemplateGroups],
  );

  const handleAddMember = useCallback(
    (groupId: string, documentId: string, role: TemplateGroupRole): void => {
      const updated = addGroupMember(projectForTemplateOps, groupId, { documentId, role });

      setTemplateGroups(updated.templateGroups ?? []);
    },
    [projectForTemplateOps, setTemplateGroups],
  );

  const handleRemoveMember = useCallback(
    (groupId: string, documentId: string): void => {
      const updated = removeGroupMember(projectForTemplateOps, groupId, documentId);

      setTemplateGroups(updated.templateGroups ?? []);
    },
    [projectForTemplateOps, setTemplateGroups],
  );

  const handleUpdateMemberRole = useCallback(
    (groupId: string, documentId: string, role: TemplateGroupRole, label?: string): void => {
      const updated = updateMemberRole(projectForTemplateOps, groupId, documentId, role, label);

      setTemplateGroups(updated.templateGroups ?? []);
    },
    [projectForTemplateOps, setTemplateGroups],
  );

  return {
    availableDocuments,
    handleAddMember,
    handleCreateGroup,
    handleRemoveGroup,
    handleRemoveMember,
    handleRenameGroup,
    handleUpdateMemberRole,
  };
}
