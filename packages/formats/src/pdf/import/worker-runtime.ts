/// <reference lib="webworker" />

import { parsePdfBytesV1 } from './parse';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<unknown>): void => {
  if (!(event.data instanceof Uint8Array)) {
    self.postMessage({ kind: 'malformed' });

    return;
  }

  void parsePdfBytesV1(event.data).then((result): void => {
    self.postMessage(result);
  });
};
