/** @vitest-environment jsdom */

import type { BroadsetDocument, BroadsetElement } from '@broadset/model';
import { resolveContentAsPlainString } from '@broadset/model';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { setupDemoShellMocks } from './demo-shell-test-utils';
import { DemoApp } from './DemoApp';

function mockCanvasBounds(element: HTMLElement, rect: Partial<DOMRect>): void {
  const merged = {
    bottom: rect.bottom ?? 100,
    height: rect.height ?? 100,
    left: rect.left ?? 0,
    right: rect.right ?? 100,
    toJSON: () => ({}),
    top: rect.top ?? 0,
    width: rect.width ?? 100,
    x: rect.x ?? 0,
    y: rect.y ?? 0,
  } as DOMRect;

  element.getBoundingClientRect = (): DOMRect => merged;
}

function latestDocument(updateDocument: ReturnType<typeof vi.fn>): BroadsetDocument {
  const calls = updateDocument.mock.calls;
  const latest = calls.at(-1);

  if (latest === undefined) throw new Error('updateDocument was never called');

  const [doc] = latest as [BroadsetDocument];

  return doc;
}

function findNewPath(doc: BroadsetDocument, existingIds: ReadonlySet<string>): BroadsetElement {
  const found = doc.elements.find((candidate) => candidate.type === 'path' && !existingIds.has(candidate.id));

  if (found === undefined) throw new Error('No newly-drawn path element found in document');

  return found;
}

function createShellWithRenderer(): { readonly updateDocument: ReturnType<typeof vi.fn> } {
  const { mockedCreateScreenRenderer } = setupDemoShellMocks();
  const overlayRoot = document.body.appendChild(document.createElement('div'));
  const updateDocument = vi.fn();

  mockedCreateScreenRenderer.mockReturnValue({
    destroy: vi.fn(() => {
      overlayRoot.remove();
    }),
    getOverlayRoot: vi.fn(() => overlayRoot),
    host: document.createElement('div'),
    updateDocument,
    updateSettings: vi.fn(),
  });

  return { updateDocument };
}

function seedDrawingSession(updateDocument: ReturnType<typeof vi.fn>): {
  readonly preview: HTMLElement;
  readonly existingPathIds: ReadonlySet<string>;
} {
  const before = latestDocument(updateDocument);
  const existingPathIds = new Set(before.elements.filter((e) => e.type === 'path').map((e) => e.id));

  fireEvent.click(screen.getByRole('button', { name: /^path$/i }));

  const preview = screen.getByLabelText(/screen preview for/i);

  mockCanvasBounds(preview, { height: 100, left: 0, top: 0, width: 100 });

  return { existingPathIds, preview };
}

describe('Path tool: drawing interaction', () => {
  /** @description Path toolbar button activates placement; clicking the canvas creates a new path element. */
  it('places a new path element on first canvas click after selecting the Path tool', () => {
    const { updateDocument } = createShellWithRenderer();

    render(<DemoApp />);

    const { preview, existingPathIds } = seedDrawingSession(updateDocument);

    fireEvent.click(preview, { clientX: 50, clientY: 50 });

    const newPath = findNewPath(latestDocument(updateDocument), existingPathIds);

    expect(newPath.type).toBe('path');
  });

  /** @description After the path element is placed, further canvas clicks append M then L commands via appendPathPoint. */
  it('appends M and L commands as the user clicks additional points on the canvas', () => {
    const { updateDocument } = createShellWithRenderer();

    render(<DemoApp />);

    const { preview, existingPathIds } = seedDrawingSession(updateDocument);

    fireEvent.click(preview, { clientX: 10, clientY: 10 });
    fireEvent.click(preview, { clientX: 60, clientY: 20 });
    fireEvent.click(preview, { clientX: 30, clientY: 70 });

    const newPath = findNewPath(latestDocument(updateDocument), existingPathIds);
    const newPathContent = resolveContentAsPlainString(newPath.content);
    const commandMatches = newPathContent.match(/[MLZ]/g) ?? [];

    expect(newPathContent).toMatch(/^M/);
    expect(commandMatches.filter((c) => c === 'L').length).toBeGreaterThanOrEqual(1);
  });

  /** @description Enter while path drawing is active closes the path with a Z command and exits drawing mode. */
  it('closes the path with Z when Enter is pressed during drawing', () => {
    const { updateDocument } = createShellWithRenderer();

    render(<DemoApp />);

    const { preview, existingPathIds } = seedDrawingSession(updateDocument);

    fireEvent.click(preview, { clientX: 10, clientY: 10 });
    fireEvent.click(preview, { clientX: 60, clientY: 20 });
    fireEvent.click(preview, { clientX: 30, clientY: 70 });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    });

    const newPath = findNewPath(latestDocument(updateDocument), existingPathIds);

    expect(resolveContentAsPlainString(newPath.content).trim().endsWith('Z')).toBe(true);
  });

  /** @description Escape while path drawing is active commits the current points without closing and exits drawing mode. */
  it('commits the path without Z when Escape is pressed during drawing', () => {
    const { updateDocument } = createShellWithRenderer();

    render(<DemoApp />);

    const { preview, existingPathIds } = seedDrawingSession(updateDocument);

    fireEvent.click(preview, { clientX: 10, clientY: 10 });
    fireEvent.click(preview, { clientX: 60, clientY: 20 });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    });

    const newPath = findNewPath(latestDocument(updateDocument), existingPathIds);
    const newPathContent = resolveContentAsPlainString(newPath.content);

    expect(newPathContent.includes('Z')).toBe(false);
    expect((newPathContent.match(/[ML]/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });
});
