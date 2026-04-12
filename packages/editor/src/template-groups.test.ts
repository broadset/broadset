/** @jest-environment jsdom */

import type { BroadsetProject, TemplateGroupMember } from '@broadset/model';
import { broadsetProjectSchema, createEmptyBroadsetDocument } from '@broadset/model';

import {
  addGroupMember,
  createTemplateGroup,
  removeGroupMember,
  removeTemplateGroup,
  renameTemplateGroup,
  updateMemberRole,
} from './template-groups';

function createMinimalProject(overrides?: Partial<BroadsetProject>): BroadsetProject {
  const now = new Date().toISOString();
  const doc1 = createEmptyBroadsetDocument();
  const doc2 = createEmptyBroadsetDocument();

  // Override the generated IDs to be deterministic
  const docHd = { ...doc1, id: 'doc-hd', name: '1920×1080' };
  const docVert = { ...doc2, id: 'doc-vertical', name: '1080×1920' };

  return {
    $schema: undefined,
    schemaVersion: 1 as const,
    id: 'proj-1',
    name: 'Test Project',
    createdAt: now,
    updatedAt: now,
    settings: { fonts: [], palette: [], defaultDocumentMode: 'screen' as const },
    assets: [],
    documents: [docHd, docVert],
    ...overrides,
  };
}

const MEMBER_HD: TemplateGroupMember = { documentId: 'doc-hd', role: '16:9' };
const MEMBER_VERT: TemplateGroupMember = { documentId: 'doc-vertical', role: '9:16', label: 'Social Vertical' };

describe('template-groups CRUD', () => {
  /** @description Creating a group must append it to the project's templateGroups array. */
  it('creates a new template group', () => {
    const project = createMinimalProject();
    const result = createTemplateGroup(project, 'tg-1', 'Scorebug', MEMBER_HD);

    expect(result.templateGroups).toHaveLength(1);
    expect(result.templateGroups?.[0]?.groupId).toBe('tg-1');
    expect(result.templateGroups?.[0]?.name).toBe('Scorebug');
    expect(result.templateGroups?.[0]?.members).toHaveLength(1);
    expect(result.templateGroups?.[0]?.members[0]?.documentId).toBe('doc-hd');
  });

  /** @description Creating a group when templateGroups is undefined must initialize the array. */
  it('handles undefined templateGroups', () => {
    const project = createMinimalProject({ templateGroups: undefined });
    const result = createTemplateGroup(project, 'tg-1', 'Test', MEMBER_HD);

    expect(result.templateGroups).toHaveLength(1);
  });

  /** @description Removing a group must filter it from the templateGroups array. */
  it('removes a template group by id', () => {
    let project = createMinimalProject();

    project = createTemplateGroup(project, 'tg-1', 'Group A', MEMBER_HD);
    project = createTemplateGroup(project, 'tg-2', 'Group B', MEMBER_VERT);
    project = removeTemplateGroup(project, 'tg-1');

    expect(project.templateGroups).toHaveLength(1);
    expect(project.templateGroups?.[0]?.groupId).toBe('tg-2');
  });

  /** @description Renaming a group must update only the targeted group. */
  it('renames a template group', () => {
    let project = createMinimalProject();

    project = createTemplateGroup(project, 'tg-1', 'Old Name', MEMBER_HD);
    project = renameTemplateGroup(project, 'tg-1', 'New Name');

    expect(project.templateGroups?.[0]?.name).toBe('New Name');
  });

  /** @description Adding a member must append to the group's members array. */
  it('adds a member to a group', () => {
    let project = createMinimalProject();

    project = createTemplateGroup(project, 'tg-1', 'Scorebug', MEMBER_HD);
    project = addGroupMember(project, 'tg-1', MEMBER_VERT);

    expect(project.templateGroups?.[0]?.members).toHaveLength(2);
    expect(project.templateGroups?.[0]?.members[1]?.documentId).toBe('doc-vertical');
    expect(project.templateGroups?.[0]?.members[1]?.label).toBe('Social Vertical');
  });

  /** @description Removing the last member must remove the entire group. */
  it('removes a member and cleans up empty groups', () => {
    let project = createMinimalProject();

    project = createTemplateGroup(project, 'tg-1', 'One Member', MEMBER_HD);
    project = removeGroupMember(project, 'tg-1', 'doc-hd');

    expect(project.templateGroups).toHaveLength(0);
  });

  /** @description Removing one of multiple members preserves the group. */
  it('removes one member and keeps the group', () => {
    let project = createMinimalProject();

    project = createTemplateGroup(project, 'tg-1', 'Scorebug', MEMBER_HD);
    project = addGroupMember(project, 'tg-1', MEMBER_VERT);
    project = removeGroupMember(project, 'tg-1', 'doc-hd');

    expect(project.templateGroups).toHaveLength(1);
    expect(project.templateGroups?.[0]?.members).toHaveLength(1);
    expect(project.templateGroups?.[0]?.members[0]?.documentId).toBe('doc-vertical');
  });

  /** @description Updating a member's role must change only the targeted member. */
  it('updates a member role', () => {
    let project = createMinimalProject();

    project = createTemplateGroup(project, 'tg-1', 'Scorebug', MEMBER_HD);
    project = addGroupMember(project, 'tg-1', MEMBER_VERT);
    project = updateMemberRole(project, 'tg-1', 'doc-vertical', 'custom', 'Ultra-wide Banner');

    const member = project.templateGroups?.[0]?.members[1];

    expect(member?.role).toBe('custom');
    expect(member?.label).toBe('Ultra-wide Banner');
  });

  /** @description Round-trip through the schema must preserve all template group data. */
  it('round-trips through schema validation', () => {
    let project = createMinimalProject();

    project = createTemplateGroup(project, 'tg-1', 'Scorebug', MEMBER_HD);
    project = addGroupMember(project, 'tg-1', MEMBER_VERT);

    const result = broadsetProjectSchema.safeParse(project);

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.templateGroups).toHaveLength(1);
      expect(result.data.templateGroups?.[0]?.members).toHaveLength(2);
    }
  });
});
