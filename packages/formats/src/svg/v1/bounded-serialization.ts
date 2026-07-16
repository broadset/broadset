interface BoundedWriterV1 {
  readonly appendRaw: (value: string) => boolean;
  readonly appendEscaped: (value: string, attribute: boolean) => boolean;
  readonly value: () => string | undefined;
}

interface BoundedSvgSerializationV1 {
  readonly status: 'within-limit' | 'exceeded';
  readonly value?: string;
}

const ESCAPE_BATCH_SIZE = 1_024;

function codePointByteLength(codePoint: number): number {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;

  return 4;
}

function measureWithin(value: string, remainingBytes: number): number | undefined {
  let byteLength = 0;

  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.codePointAt(index);

    if (codePoint === undefined) continue;

    byteLength += codePointByteLength(codePoint);

    if (byteLength > remainingBytes) return undefined;
    if (codePoint > 0xffff) index += 1;
  }

  return byteLength;
}

function escapedValue(character: string, attribute: boolean): string | undefined {
  if (character === '&') return '&amp;';
  if (character === '<') return '&lt;';
  if (attribute && character === '"') return '&quot;';

  return undefined;
}

function createBoundedWriter(maxBytes: number): BoundedWriterV1 {
  const chunks: string[] = [];
  let byteLength = 0;
  let exceeded = false;

  function appendRaw(value: string): boolean {
    if (exceeded) return false;

    const measured = measureWithin(value, maxBytes - byteLength);

    if (measured === undefined) {
      exceeded = true;

      return false;
    }

    chunks.push(value);
    byteLength += measured;

    return true;
  }

  function appendEscaped(value: string, attribute: boolean): boolean {
    const pending: string[] = [];
    let runStart = 0;

    function flush(): boolean {
      if (pending.length === 0) return true;

      const combined = pending.join('');

      pending.length = 0;

      return appendRaw(combined);
    }

    for (let index = 0; index < value.length; index += 1) {
      const codePoint = value.codePointAt(index);

      if (codePoint === undefined) continue;

      const character = String.fromCodePoint(codePoint);
      const escaped = escapedValue(character, attribute);

      if (escaped !== undefined) {
        if (runStart < index) pending.push(value.slice(runStart, index));
        pending.push(escaped);
        runStart = index + character.length;

        if (pending.length >= ESCAPE_BATCH_SIZE && !flush()) return false;
      }

      if (codePoint > 0xffff) index += 1;
    }

    if (runStart < value.length) pending.push(value.slice(runStart));

    return flush();
  }

  function value(): string | undefined {
    return exceeded ? undefined : chunks.join('');
  }

  return { appendRaw, appendEscaped, value };
}

function serializeNonElementNode(node: Node, writer: BoundedWriterV1): boolean {
  if (node.nodeType === Node.TEXT_NODE) return writer.appendEscaped(node.nodeValue ?? '', false);

  if (node.nodeType === Node.CDATA_SECTION_NODE) {
    return writer.appendRaw('<![CDATA[') && writer.appendRaw(node.nodeValue ?? '') && writer.appendRaw(']]>');
  }

  if (node.nodeType === Node.COMMENT_NODE) {
    return writer.appendRaw('<!--') && writer.appendRaw(node.nodeValue ?? '') && writer.appendRaw('-->');
  }

  return true;
}

function serializeElement(element: Element, writer: BoundedWriterV1): boolean {
  if (!writer.appendRaw(`<${element.tagName}`)) return false;

  for (let index = 0; index < element.attributes.length; index += 1) {
    const attribute = element.attributes[index];

    if (attribute === undefined) continue;
    if (!writer.appendRaw(` ${attribute.name}="`)) return false;
    if (!writer.appendEscaped(attribute.value, true)) return false;
    if (!writer.appendRaw('"')) return false;
  }

  if (!writer.appendRaw('>')) return false;

  for (let index = 0; index < element.childNodes.length; index += 1) {
    const child = element.childNodes[index];

    if (child !== undefined && !serializeNode(child, writer)) return false;
  }

  return writer.appendRaw(`</${element.tagName}>`);
}

function serializeNode(node: Node, writer: BoundedWriterV1): boolean {
  return node instanceof Element ? serializeElement(node, writer) : serializeNonElementNode(node, writer);
}

export function serializeSvgElementUpTo(element: Element, maxBytes: number): BoundedSvgSerializationV1 {
  const writer = createBoundedWriter(maxBytes);

  if (!serializeNode(element, writer)) return { status: 'exceeded' };

  const value = writer.value();

  return value === undefined ? { status: 'exceeded' } : { status: 'within-limit', value };
}
