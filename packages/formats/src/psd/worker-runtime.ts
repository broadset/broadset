/// <reference lib="webworker" />

import { parsePsdBytesV1 } from './import-parse';
import { collectPsdTransferablesV1 } from './worker-transfer';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<unknown>): void => {
  const data = event.data;

  if (
    typeof data !== 'object' ||
    data === null ||
    !('bytes' in data) ||
    !(data.bytes instanceof Uint8Array) ||
    !('maxResultBytes' in data) ||
    typeof data.maxResultBytes !== 'number'
  ) {
    self.postMessage({ kind: 'malformed', message: 'PSD worker received invalid bytes.' });

    return;
  }

  const result = parsePsdBytesV1(data.bytes);

  if (result.kind !== 'ok') {
    self.postMessage(result);

    return;
  }

  const transfer = collectPsdTransferablesV1(result, data.maxResultBytes);

  if (transfer.status === 'rejected') {
    self.postMessage({ kind: 'malformed', message: 'PSD worker decoded result exceeded the transfer byte limit.' });

    return;
  }

  self.postMessage(result, transfer.transfer);
};
