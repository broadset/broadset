import type { BroadsetProject, TemplateGroup, TemplateGroupMember, TemplateGroupRole } from '@broadset/model';

/**
 * Create a new template group and append it to the project.
 * The group starts with a single member.
 */
export function createTemplateGroup(
  project: BroadsetProject,
  groupId: string,
  name: string,
  firstMember: TemplateGroupMember,
): BroadsetProject {
  const existing = project.templateGroups ?? [];
  const newGroup: TemplateGroup = { groupId, name, members: [firstMember] };

  return {
    ...project,
    templateGroups: [...existing, newGroup],
  };
}

/**
 * Remove a template group by ID.
 */
export function removeTemplateGroup(project: BroadsetProject, groupId: string): BroadsetProject {
  const existing = project.templateGroups ?? [];

  return {
    ...project,
    templateGroups: existing.filter((g) => g.groupId !== groupId),
  };
}

/**
 * Rename a template group.
 */
export function renameTemplateGroup(project: BroadsetProject, groupId: string, newName: string): BroadsetProject {
  return updateGroup(project, groupId, (g) => ({ ...g, name: newName }));
}

/**
 * Add a member document to a template group.
 */
export function addGroupMember(
  project: BroadsetProject,
  groupId: string,
  member: TemplateGroupMember,
): BroadsetProject {
  return updateGroup(project, groupId, (g) => ({
    ...g,
    members: [...g.members, member],
  }));
}

/**
 * Remove a member document from a template group.
 * If this would make the group empty, the entire group is removed.
 */
export function removeGroupMember(project: BroadsetProject, groupId: string, documentId: string): BroadsetProject {
  const existing = project.templateGroups ?? [];
  const updated = existing
    .map((g) => {
      if (g.groupId !== groupId) {
        return g;
      }

      return { ...g, members: g.members.filter((m) => m.documentId !== documentId) };
    })
    .filter((g) => g.members.length > 0);

  return { ...project, templateGroups: updated };
}

/**
 * Update a member's role and optional label.
 */
export function updateMemberRole(
  project: BroadsetProject,
  groupId: string,
  documentId: string,
  role: TemplateGroupRole,
  label?: string,
): BroadsetProject {
  return updateGroup(project, groupId, (g) => ({
    ...g,
    members: g.members.map((m) => {
      if (m.documentId !== documentId) {
        return m;
      }

      return { ...m, role, ...(label !== undefined ? { label } : {}) };
    }),
  }));
}

function updateGroup(
  project: BroadsetProject,
  groupId: string,
  updater: (group: TemplateGroup) => TemplateGroup,
): BroadsetProject {
  const existing = project.templateGroups ?? [];

  return {
    ...project,
    templateGroups: existing.map((g) => (g.groupId === groupId ? updater(g) : g)),
  };
}
