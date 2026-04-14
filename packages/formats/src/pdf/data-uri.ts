interface DecodedDataUri {
  readonly mime: string;
  readonly bytes: Uint8Array;
}

function group(m: RegExpMatchArray, i: number): string {
  return m[i] ?? '';
}

export function decodeDataUri(uri: string): DecodedDataUri | undefined {
  const match = uri.match(/^data:([^;,]+)(?:;([^,]*))?,(.*)/s);

  if (!match) {
    return undefined;
  }

  const mime = group(match, 1);
  const encoding = match[2] ?? '';
  const data = group(match, 3);

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

  const encoder = new TextEncoder();

  return { mime, bytes: encoder.encode(decodeURIComponent(data)) };
}
