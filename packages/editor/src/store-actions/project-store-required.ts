import { type EditorConfig, projectFormatV1 } from '@broadset/model';

export function resolveRequiredElementIds(
  config: Partial<EditorConfig> | undefined,
): ReadonlySet<projectFormatV1.Id> {
  const requiredElementIds = new Set<projectFormatV1.Id>();

  for (const value of config?.requiredElements ?? []) {
    const parsed = projectFormatV1.idSchema.safeParse(value);

    if (parsed.success) requiredElementIds.add(parsed.data);
  }

  return requiredElementIds;
}
