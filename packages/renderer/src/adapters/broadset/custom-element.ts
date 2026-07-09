import type { BroadsetDocument } from '@broadset/model';

import type { ScreenRendererController } from '../../core/contracts';
import { createScreenRenderer } from './create-screen-renderer';

/**
 * Web Components wrapper that keeps the Broadset screen renderer alive across
 * DOM mount/unmount and document replacement. Broadset-specific because it
 * binds to `BroadsetDocument` via the `documentData` setter; generic
 * consumers use `createScreenRenderer` directly.
 */
export class BroadsetScreenRendererElement extends HTMLElement {
  private controller: ScreenRendererController | null = null;
  private currentDocument: BroadsetDocument | null = null;

  connectedCallback(): void {
    if (this.controller === null) {
      this.controller = createScreenRenderer({
        host: this,
        ...(this.currentDocument === null ? {} : { document: this.currentDocument }),
      });

      return;
    }

    if (this.currentDocument !== null) {
      this.controller.updateDocument(this.currentDocument);
    }
  }

  disconnectedCallback(): void {
    this.controller?.destroy();
    this.controller = null;
  }

  get documentData(): BroadsetDocument | null {
    return this.currentDocument;
  }

  set documentData(value: BroadsetDocument | null) {
    this.currentDocument = value;

    if (value === null) {
      this.controller?.destroy();
      this.controller = null;
      this.replaceChildren();

      return;
    }

    if (this.isConnected) {
      if (this.controller === null) {
        this.controller = createScreenRenderer({ host: this, document: value });

        return;
      }

      this.controller.updateDocument(value);
    }
  }
}

/**
 * Registers the Broadset screen renderer as a Custom Element under the given
 * tag name. Idempotent — safe to call more than once. Broadset-specific
 * because it wraps `BroadsetScreenRendererElement`.
 */
export function defineBroadsetScreenRenderer(tagName = 'broadset-screen-renderer'): void {
  if (customElements.get(tagName) !== undefined) {
    return;
  }

  customElements.define(tagName, BroadsetScreenRendererElement);
}
