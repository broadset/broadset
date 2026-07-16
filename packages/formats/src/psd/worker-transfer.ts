type PsdTransferResultV1 =
  | { readonly status: 'accepted'; readonly byteLength: number; readonly transfer: ArrayBuffer[] }
  | { readonly status: 'rejected' };

const OBJECT_OVERHEAD_BYTES = 16;
const PRIMITIVE_BYTES = 8;

function descriptorValue(descriptor: PropertyDescriptor): unknown {
  const value: unknown = descriptor.value;

  return value;
}

function supportedContainer(value: object): boolean {
  const prototype: unknown = Object.getPrototypeOf(value);

  return prototype === null || prototype === Object.prototype || prototype === Array.prototype;
}

class PsdCloneGraphMeterV1 {
  private readonly visited = new WeakSet();
  private readonly buffers = new Set<ArrayBuffer>();
  private readonly pending: unknown[];
  private readonly maxBytes: number;
  private byteLength = 0;

  constructor(value: unknown, maxBytes: number) {
    this.pending = [value];
    this.maxBytes = maxBytes;
  }

  measure(): PsdTransferResultV1 {
    while (this.pending.length > 0) {
      if (!this.visit(this.pending.pop())) return { status: 'rejected' };
    }

    return { status: 'accepted', byteLength: this.byteLength, transfer: [...this.buffers] };
  }

  private visit(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return this.addString(value);
    if (typeof value === 'function' || typeof value === 'symbol') return false;
    if (typeof value !== 'object') return this.add(PRIMITIVE_BYTES);
    if (this.visited.has(value)) return true;

    this.visited.add(value);

    return this.visitObject(value);
  }

  private visitObject(value: object): boolean {
    const buffer = this.transferableBuffer(value);

    if (buffer !== undefined) return this.addBuffer(buffer);
    if (!supportedContainer(value) || !this.add(OBJECT_OVERHEAD_BYTES)) return false;

    return this.visitProperties(value);
  }

  private transferableBuffer(value: object): ArrayBufferLike | undefined {
    if (value instanceof ArrayBuffer) return value;
    if (ArrayBuffer.isView(value)) return value.buffer;

    return undefined;
  }

  private addBuffer(buffer: ArrayBufferLike): boolean {
    if (!(buffer instanceof ArrayBuffer)) return false;
    if (this.buffers.has(buffer)) return true;
    if (!this.add(buffer.byteLength)) return false;

    this.buffers.add(buffer);

    return true;
  }

  private visitProperties(value: object): boolean {
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === 'string' && !this.addString(key)) return false;

      const descriptor = Object.getOwnPropertyDescriptor(value, key);

      if (descriptor === undefined) continue;
      if (!('value' in descriptor)) return false;

      this.pending.push(descriptorValue(descriptor));
    }

    return true;
  }

  private addString(value: string): boolean {
    if (value.length > Math.floor((this.maxBytes - this.byteLength) / 2)) return false;

    this.byteLength += value.length * 2;

    return true;
  }

  private add(addition: number): boolean {
    if (!Number.isSafeInteger(addition) || addition < 0 || addition > this.maxBytes - this.byteLength) return false;

    this.byteLength += addition;

    return true;
  }
}

export function collectPsdTransferablesV1(value: unknown, maxBytes: number): PsdTransferResultV1 {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) return { status: 'rejected' };

  return new PsdCloneGraphMeterV1(value, maxBytes).measure();
}
