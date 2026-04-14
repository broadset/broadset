export function decodeDataUri(uri: string): { readonly mime: string; readonly bytes: Uint8Array } | undefined {
  const match = uri.match(/^data:([^;,]+)(?:;([^,]*))?,(.*)/s);

  if (!match) return undefined;

  const mime = match[1] ?? '';
  const encoding = match[2] ?? '';
  const data = match[3] ?? '';

  if (encoding === 'base64') {
    try {
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);

      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      return { mime, bytes };
    } catch {
      return undefined;
    }
  }

  return { mime, bytes: new TextEncoder().encode(decodeURIComponent(data)) };
}

export function bytesToDataUri(bytes: Uint8Array, mime: string): string {
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return `data:${mime};base64,${btoa(binary)}`;
}
