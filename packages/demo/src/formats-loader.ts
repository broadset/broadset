import type * as FormatsNamespace from '@broadset/formats';

type FormatsModule = typeof FormatsNamespace;

let formatsCache: FormatsModule | null = null;

export async function loadFormats(): Promise<FormatsModule> {
  formatsCache ??= await import('@broadset/formats');

  return formatsCache;
}

export function resetFormatsCache(): void {
  formatsCache = null;
}
