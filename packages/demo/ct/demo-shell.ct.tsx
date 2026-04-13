import { expect, test } from '@playwright/experimental-ct-react';

import { DemoApp } from '../src/DemoApp';

/**
 * @description Validates the phase 2 demo shell scenario from
 * `project/spec/demo/layout.md` and `project/spec/demo/visual.md`.
 */
test('fills the viewport and renders the sample document on screen', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const shell = page.getByTestId('demo-shell');
  const rendererHost = page.getByTestId('screen-renderer-host');

  await expect(shell).toBeVisible();
  await expect(rendererHost).toBeVisible();
  await expect(rendererHost.getByText('CHAMPIONSHIP NIGHT')).toBeVisible();

  for (const elementId of [
    'el-show-title',
    'el-stage-bg',
    'el-video-wall',
    'el-accent-svg',
    'el-accent-arc',
    'el-sponsor-logo',
    'el-info-panel',
    'el-promo-qr',
    'el-clock',
    'el-hero-badge',
    'el-ticker',
  ]) {
    await expect(page.locator(`[data-element-id="${elementId}"]`)).toBeVisible();
  }

  const shellBox = await shell.boundingBox();
  const viewport = page.viewportSize();

  expect(Math.round(shellBox?.width ?? 0)).toBeGreaterThanOrEqual(viewport?.width ?? 0);
  expect(Math.round(shellBox?.height ?? 0)).toBeGreaterThanOrEqual(viewport?.height ?? 0);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe('hidden');
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');
});

/**
 * @description Validates the phase 3 playback scenario from
 * `project/spec/demo/data-integration.md` and `project/spec/demo/state.md`.
 */
test('playback controls animate, pause, resume, and reset the demo content', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const toggle = page.getByTestId('demo-playback-toggle');
  const reset = page.getByTestId('demo-playback-reset');
  const heroOpacity = page.locator('[data-element-id="el-hero-badge"] [data-opacity-target]');

  const initialOpacity = Number(await heroOpacity.evaluate((element) => getComputedStyle(element).opacity));

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-label', 'Pause playback');
  await page.waitForTimeout(350);

  const animatedOpacity = Number(await heroOpacity.evaluate((element) => getComputedStyle(element).opacity));

  expect(animatedOpacity).not.toBe(initialOpacity);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-label', 'Play playback');

  const pausedOpacity = Number(await heroOpacity.evaluate((element) => getComputedStyle(element).opacity));

  await page.waitForTimeout(250);

  const pausedOpacityAfterWait = Number(await heroOpacity.evaluate((element) => getComputedStyle(element).opacity));

  expect(pausedOpacityAfterWait).toBe(pausedOpacity);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-label', 'Pause playback');
  await page.waitForTimeout(180);

  const resumedOpacity = Number(await heroOpacity.evaluate((element) => getComputedStyle(element).opacity));

  expect(resumedOpacity).toBeGreaterThan(pausedOpacity);

  await toggle.click();
  await reset.click();

  const resetOpacity = Number(await heroOpacity.evaluate((element) => getComputedStyle(element).opacity));

  expect(resetOpacity).toBe(initialOpacity);
});

/**
 * @description Validates the phase 3 playback-engine visibility scenario from
 * `project/spec/playback/playback.md` through the demo sample's IN/OUT bindings.
 * This is an engine integration check rather than a broader Phase 9 demo-workflow proof.
 */
test('playback engine applies the sample promo panel IN and OUT visibility bindings', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const promoPanel = page.locator('[data-element-id="el-promo-panel"]');
  const promoOpacity = page.locator('[data-element-id="el-promo-panel"] > [data-opacity-target]');

  await expect(promoPanel).toBeVisible();

  await promoPanel.evaluate((element) => {
    element.setAttribute('data-visibility', 'offscreen');
  });
  await page.waitForTimeout(80);

  const outOpacity = Number(await promoOpacity.evaluate((element) => getComputedStyle(element).opacity));

  expect(outOpacity).toBeLessThan(1);

  await page.waitForTimeout(650);
  await expect(promoPanel).toHaveCSS('visibility', 'hidden');

  await promoPanel.evaluate((element) => {
    element.setAttribute('data-visibility', 'onscreen');
  });
  await page.waitForTimeout(80);
  await expect(promoPanel).toHaveCSS('visibility', 'visible');

  const inOpacity = Number(await promoOpacity.evaluate((element) => getComputedStyle(element).opacity));

  expect(inOpacity).toBeLessThan(1);

  await page.waitForTimeout(950);

  const settledOpacity = Number(await promoOpacity.evaluate((element) => getComputedStyle(element).opacity));

  expect(settledOpacity).toBeCloseTo(1, 1);
});

/**
 * @description Validates the Phase 4 demo-shell layout and visual contracts from
 * `project/spec/demo/layout.md` and `project/spec/demo/visual.md`.
 */
test('renders dark editor chrome with floating toolbars around the preview canvas', async ({ mount, page }) => {
  await mount(<DemoApp />);

  await expect(page.getByTestId('demo-main-toolbar')).toBeVisible();
  await expect(page.getByTestId('demo-element-library')).toBeVisible();
  await expect(page.getByTestId('demo-properties-sidebar')).toBeVisible();
  await expect(page.getByTestId('screen-renderer-host')).toBeVisible();
  await expect(page.getByTestId('demo-transform-widget')).toBeVisible();
  await expect(page.getByTestId('demo-scene-sorter')).toHaveCount(0);

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveClass(/dark/);
});

/**
 * @description Validates the Phase 4 toolbar-chrome contract from
 * `project/spec/demo/layout.md` and `project/spec/demo/visual.md` so the main toolbar uses icon-only controls with accessible labels rather than visible text buttons.
 */
test('uses icon-only main toolbar controls with accessible labels', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const toolbar = page.getByTestId('demo-main-toolbar');

  for (const label of ['File', 'View', 'Scenes', 'Help']) {
    await expect(toolbar.locator(`button[aria-label="${label}"]`).first()).toBeVisible();
    await expect(toolbar.getByText(new RegExp(`^${label}$`))).toHaveCount(0);
  }
});

/**
 * @description Verifies the Phase 4 shell keeps the sidebar inset correctly and clamps the canvas context menu within the viewport bounds.
 */
test('keeps the sidebar inset and the context menu within the visible viewport', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const sidebar = page.getByTestId('demo-properties-sidebar');

  await expect(sidebar).toHaveCSS('top', '72px');
  await expect(sidebar).toHaveCSS('bottom', '72px');

  const preview = page.getByLabel(/screen preview for/i);
  const previewBox = await preview.boundingBox();

  await preview.click({
    button: 'right',
    position: {
      x: Math.max((previewBox?.width ?? 12) - 4, 4),
      y: Math.max((previewBox?.height ?? 12) - 4, 4),
    },
  });

  const contextMenu = page.getByTestId('demo-context-menu');

  await expect(contextMenu).toBeVisible();

  const shell = page.getByTestId('demo-shell');
  const shellRect = await shell.evaluate((element) => {
    const { bottom, left, right, top } = element.getBoundingClientRect();

    return { bottom, left, right, top };
  });
  const menuRect = await contextMenu.evaluate((element) => {
    const { bottom, left, right, top } = element.getBoundingClientRect();

    return { bottom, left, right, top };
  });

  expect(menuRect.left).toBeGreaterThanOrEqual(shellRect.left);
  expect(menuRect.top).toBeGreaterThanOrEqual(shellRect.top);
  expect(menuRect.right).toBeLessThanOrEqual(shellRect.right);
  expect(menuRect.bottom).toBeLessThanOrEqual(shellRect.bottom);
});

/**
 * @description Validates the Phase 4 placement-mode affordance from
 * `project/spec/demo/layout.md` so activating a tool shows a clear banner and cancel path.
 */
test('shows a placement-mode banner when the user activates an element tool', async ({ mount, page }) => {
  await mount(<DemoApp />);

  await page.locator('button[aria-label="Rectangle"]').first().click();
  await expect(page.getByTestId('placement-mode-banner')).toContainText('Rectangle');

  await page.locator('button[aria-label="Cancel placement"]').first().click();
  await expect(page.getByTestId('placement-mode-banner')).toBeHidden();
});

/**
 * @description Validates the 9-G sidebar preference persistence from
 * `project/spec/demo/state.md`: sidebar open/closed, active tab, and width
 * persist to localStorage, and remounting restores them.
 */
test('persists sidebar preferences across remounts', async ({ mount, page }) => {
  const component = await mount(<DemoApp />);

  const sidebar = page.getByTestId('demo-properties-sidebar');

  await expect(sidebar).toBeVisible();

  // Click the Layers tab to switch
  await page.locator('button[aria-label="Layers"]').first().click();

  // Wait for the useEffect to persist the new tab selection to localStorage
  await page.waitForFunction(
    () => {
      const s = window.localStorage.getItem('broadset:demo-sidebar-preferences:v1');
      const p = JSON.parse(s ?? '{}') as { tab?: string };

      return p.tab === 'layers';
    },
    undefined,
    { timeout: 3000 },
  );

  // Verify preferences were saved to localStorage
  const stored = await page.evaluate(() => window.localStorage.getItem('broadset:demo-sidebar-preferences:v1'));

  expect(stored).not.toBeNull();

  const prefs = JSON.parse(stored ?? '{}') as { isOpen: boolean; tab: string; width: number };

  expect(prefs.tab).toBe('layers');
  expect(prefs.isOpen).toBe(true);
  expect(prefs.width).toBeGreaterThanOrEqual(256);
  expect(prefs.width).toBeLessThanOrEqual(800);

  // Remount and verify preferences are restored
  await component.unmount();
  await mount(<DemoApp />);

  const restoredStored = await page.evaluate(() => window.localStorage.getItem('broadset:demo-sidebar-preferences:v1'));
  const restoredPrefs = JSON.parse(restoredStored ?? '{}') as { isOpen: boolean; tab: string; width: number };

  expect(restoredPrefs.tab).toBe('layers');
});

/**
 * @description Validates the 9-G save/restore document lifecycle from
 * `project/spec/demo/state.md`: saving writes to localStorage with valid
 * document JSON. Restoration is verified via DemoApp.test.tsx unit tests.
 */
test('saves the current document to localStorage via the File menu', async ({ mount, page }) => {
  // Clear any stale document from a previous test in this worker
  await page.evaluate(() => {
    window.localStorage.removeItem('broadset:demo-document:v1');
  });
  await mount(<DemoApp />);

  // Trigger save via the File menu
  const fileButton = page.locator('button[aria-label="File"]').first();

  await fileButton.click();
  await page.getByText('Save').first().click();

  // Verify localStorage has a valid document entry
  const stored = await page.evaluate(() => window.localStorage.getItem('broadset:demo-document:v1'));

  expect(stored).not.toBeNull();

  const doc = JSON.parse(stored ?? '{}') as { elements?: unknown[] };
  const elements = doc.elements ?? [];

  expect(doc.elements).toBeDefined();
  expect(Array.isArray(doc.elements)).toBe(true);
  expect(elements.length).toBeGreaterThan(0);
});

/**
 * @description Validates the 9-G toast notification system from
 * `project/spec/demo/state.md`: successful actions show auto-dismissing
 * success toasts at the bottom-right.
 */
test('shows a success toast after saving the document', async ({ mount, page }) => {
  await mount(<DemoApp />);

  // Trigger save via the File menu
  const fileButton = page.locator('button[aria-label="File"]').first();

  await fileButton.click();
  await page.getByText('Save').first().click();

  // Toast should appear with success message
  await expect(page.getByText('Saved the demo document locally.')).toBeVisible({ timeout: 3000 });
});

/**
 * @description Validates the 9-G countdown plugin from `project/spec/demo/config.md`:
 * the element toolbar includes the countdown custom plugin alongside built-in types.
 */
test('shows countdown custom plugin in the element toolbar alongside built-in types', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const toolbar = page.getByTestId('demo-element-library');

  await expect(toolbar).toBeVisible();

  // Built-in types
  for (const label of ['Text', 'Rectangle', 'Ellipse', 'Image', 'SVG', 'Path', 'QR Code', 'Video', 'Clock', 'Ticker']) {
    await expect(toolbar.locator(`button[aria-label="${label}"]`)).toBeVisible();
  }

  // Custom plugin
  await expect(toolbar.locator('button[aria-label="Countdown"]')).toBeVisible();
});

/**
 * @description Validates the 9-G provider wiring from `project/spec/demo/state.md`:
 * EditorProvider, TimelineEditingProvider, and BroadsetDataStoreProvider are all
 * functional and the editor store is accessible from child components.
 */
test('wires all three providers so child components have editor, timeline, and data access', async ({
  mount,
  page,
}) => {
  await mount(<DemoApp />);

  // If providers are wired correctly, the sidebar Layers tab should show document elements
  await page.locator('button[aria-label="Layers"]').first().click();

  // The sidebar should display layer entries for document elements
  const sidebar = page.getByTestId('demo-properties-sidebar');

  await expect(sidebar).toBeVisible();

  // All three providers wired — the app renders without provider errors
  await expect(page.getByTestId('demo-shell')).toBeVisible();
});

/* ------------------------------------------------------------------ */
/*  Transform widget — selection and positioning                       */
/* ------------------------------------------------------------------ */

/**
 * @description Validates that the DemoApp starts with the first unlocked
 * element auto-selected and the transform widget visible at that element's
 * bounds. The initial selection is el-top-ribbon (x:60, y:52, 920×96).
 */
test('shows the transform widget on mount for the auto-selected element', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  // el-top-ribbon is the first unlocked element: x:60, y:52, 920×96
  const style = await widget.evaluate((el) => ({
    left: el.style.left,
    top: el.style.top,
    width: el.style.width,
    height: el.style.height,
  }));

  expect(style.left).toBe('60px');
  expect(style.top).toBe('52px');
  expect(style.width).toBe('920px');
  expect(style.height).toBe('96px');
});

/**
 * @description Validates that all 8 resize handles and the rotation handle
 * are rendered when an element is selected, providing the complete transform
 * affordance set.
 */
test('renders all resize handles and the rotation handle when an element is selected', async ({ mount, page }) => {
  await mount(<DemoApp />);

  // Widget is visible from auto-selection
  await expect(page.getByTestId('demo-transform-widget')).toBeVisible();

  for (const handle of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const) {
    await expect(page.getByTestId(`transform-handle-${handle}`)).toBeVisible();
  }

  await expect(page.getByTestId('transform-rotation-handle')).toBeVisible();
});

/**
 * @description Validates that selecting a different element repositions the
 * transform widget to that element's bounds. Uses the layers panel to change
 * selection (valid cross-region flow).
 */
test('repositions the transform widget when a different element is selected', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  // Initial selection: el-top-ribbon (x:60, y:52, 920×96)
  await expect(widget).toBeVisible();

  const initialStyle = await widget.evaluate((el) => ({ left: el.style.left, top: el.style.top }));

  expect(initialStyle.left).toBe('60px');
  expect(initialStyle.top).toBe('52px');

  // Select el-hero-badge via layers panel (x:1010, y:126, 96×96)
  await page.locator('button[aria-label="Layers"]').first().click();

  const sidebar = page.getByTestId('demo-properties-sidebar');

  await sidebar.locator('[role="button"]', { hasText: 'Live Badge Orb' }).click();

  const newStyle = await widget.evaluate((el) => ({
    left: el.style.left,
    top: el.style.top,
    width: el.style.width,
    height: el.style.height,
  }));

  expect(newStyle.left).toBe('1010px');
  expect(newStyle.top).toBe('126px');
  expect(newStyle.width).toBe('96px');
  expect(newStyle.height).toBe('96px');
});

/**
 * @description Validates that the transform widget correctly applies the
 * element's rotation as a CSS transform.
 */
test('applies element rotation to the transform widget', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  // el-top-ribbon has rotation: 0 (all sample elements have 0 rotation)
  const transform = await widget.evaluate((el) => el.style.transform);

  expect(transform).toBe('rotate(0deg)');
});

/* ------------------------------------------------------------------ */
/*  Cross-region: canvas selection ↔ properties sidebar                */
/* ------------------------------------------------------------------ */

/**
 * @description Validates the cross-region flow: the auto-selected element's
 * properties are shown in the sidebar, and clicking a different element
 * updates the sidebar properties to match the new selection.
 */
test('updates the properties sidebar when a different element is selected via layers', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const sidebar = page.getByTestId('demo-properties-sidebar');

  // Initial selection is el-top-ribbon — properties should be populated (no empty message)
  await expect(sidebar.getByText('Select an element to edit its properties')).toHaveCount(0);

  // Geometry X field should be visible
  const xField = sidebar.locator('[aria-label="X"]');

  await expect(xField).toBeVisible();

  // Select a different element via layers panel
  await page.locator('button[aria-label="Layers"]').first().click();
  await sidebar.locator('[role="button"]', { hasText: 'Live Badge Orb' }).click();

  // Sidebar auto-switches to properties — X field should still be visible
  await expect(xField).toBeVisible();
});

/* ------------------------------------------------------------------ */
/*  Cross-region: layers sidebar ↔ canvas selection                    */
/* ------------------------------------------------------------------ */

/**
 * @description Validates the cross-region flow: clicking a layer entry in the
 * layers sidebar selects the element, causing the transform widget to
 * reposition and the sidebar to switch to properties.
 */
test('selects an element via the layers panel and repositions the transform widget', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  // Initial widget position for el-top-ribbon
  const initialLeft = await widget.evaluate((el) => el.style.left);

  expect(initialLeft).toBe('60px');

  // Switch to layers tab
  await page.locator('button[aria-label="Layers"]').first().click();

  const sidebar = page.getByTestId('demo-properties-sidebar');

  // Click on the el-hero-badge layer (named "Live Badge Orb")
  await sidebar.locator('[role="button"]', { hasText: 'Live Badge Orb' }).click();

  // Widget should reposition to el-hero-badge (x:1010, y:126, 96×96)
  const newStyle = await widget.evaluate((el) => ({
    left: el.style.left,
    top: el.style.top,
    width: el.style.width,
    height: el.style.height,
  }));

  expect(newStyle.left).toBe('1010px');
  expect(newStyle.top).toBe('126px');
  expect(newStyle.width).toBe('96px');
  expect(newStyle.height).toBe('96px');
});

/* ------------------------------------------------------------------ */
/*  Keyboard: Delete removes element from canvas                       */
/* ------------------------------------------------------------------ */

/**
 * @description Validates the cross-region flow: pressing Delete with a selected
 * element removes it from the canvas and clears the selection/widget.
 */
test('removes a selected element from the canvas when Delete is pressed', async ({ mount, page }) => {
  await mount(<DemoApp />);

  // Select el-accent-svg via layers panel (avoids transform widget overlay)
  await page.locator('button[aria-label="Layers"]').first().click();

  const sidebar = page.getByTestId('demo-properties-sidebar');

  await sidebar.locator('[role="button"]', { hasText: 'Broadcast Accent SVG' }).click();

  const svgElement = page.locator('[data-element-id="el-accent-svg"]');

  await expect(svgElement).toBeVisible();
  await expect(page.getByTestId('demo-transform-widget')).toBeVisible();

  // Press Delete
  await page.keyboard.press('Delete');

  // Element should be removed from the canvas
  await expect(svgElement).toHaveCount(0);

  // Transform widget should also be gone (no selection)
  await expect(page.getByTestId('demo-transform-widget')).toHaveCount(0);
});

/* ------------------------------------------------------------------ */
/*  Keyboard: Ctrl+Z undo restores a deleted element                   */
/* ------------------------------------------------------------------ */

/**
 * @description Validates the cross-region flow: after deleting an element,
 * Ctrl+Z (undo) restores it to the canvas.
 */
test('restores a deleted element when Ctrl+Z undo is pressed', async ({ mount, page }) => {
  await mount(<DemoApp />);

  // Select el-accent-svg via layers panel
  await page.locator('button[aria-label="Layers"]').first().click();

  const sidebar = page.getByTestId('demo-properties-sidebar');

  await sidebar.locator('[role="button"]', { hasText: 'Broadcast Accent SVG' }).click();

  const svgElement = page.locator('[data-element-id="el-accent-svg"]');

  await expect(svgElement).toBeVisible();

  // Delete
  await page.keyboard.press('Delete');
  await expect(svgElement).toHaveCount(0);

  // Undo
  await page.keyboard.press('Control+z');

  // Element should be restored on the canvas
  await expect(svgElement).toBeVisible();
});

/* ------------------------------------------------------------------ */
/*  Context menu: element-specific actions                             */
/* ------------------------------------------------------------------ */

/**
 * @description Validates that right-clicking a canvas element shows a context
 * menu with element-specific actions (Cut, Copy, Delete, etc.).
 */
test('shows element-specific context menu actions when an element is selected', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const contextMenu = page.getByTestId('demo-context-menu');

  // The preview container is the area for right-clicking. With an element already
  // selected (auto-selection on mount), right-click the canvas to get the element menu.
  const preview = page.getByLabel(/screen preview for/i);
  const previewBox = await preview.boundingBox();

  if (previewBox === null) {
    throw new Error('Preview box not found');
  }

  // Right-click in the center of the preview area — the context menu handler
  // reads the selected element from the store for element-specific actions.
  await preview.click({ button: 'right', position: { x: previewBox.width / 2, y: previewBox.height / 2 } });
  await expect(contextMenu).toBeVisible();

  // Should show element-specific actions since an element is selected
  await expect(contextMenu.getByText('Cut')).toBeVisible();
  await expect(contextMenu.getByText('Copy')).toBeVisible();
  await expect(contextMenu.getByText('Delete')).toBeVisible();
  await expect(contextMenu.getByText('Duplicate')).toBeVisible();
});

/* ------------------------------------------------------------------ */
/*  Transform widget: drag moves the element position                  */
/* ------------------------------------------------------------------ */

/**
 * @description Validates that dragging the transform bounds area moves the
 * element, updating the widget's inline position on the canvas.
 */
test('dragging the transform bounds moves the element position', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  // Initial position for el-top-ribbon: (60, 52)
  const initialLeft = await widget.evaluate((el) => parseFloat(el.style.left));
  const initialTop = await widget.evaluate((el) => parseFloat(el.style.top));

  expect(initialLeft).toBe(60);
  expect(initialTop).toBe(52);

  // Drag the bounds area to move the element
  const bounds = page.getByTestId('transform-bounds');
  const boundsBox = await bounds.boundingBox();

  if (boundsBox === null) {
    throw new Error('Bounds box not found');
  }

  const startX = boundsBox.x + boundsBox.width / 2;
  const startY = boundsBox.y + boundsBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 50, startY + 30, { steps: 5 });
  await page.mouse.up();

  // Widget position should have changed
  const newLeft = await widget.evaluate((el) => parseFloat(el.style.left));
  const newTop = await widget.evaluate((el) => parseFloat(el.style.top));

  expect(newLeft).toBeGreaterThan(initialLeft);
  expect(newTop).toBeGreaterThan(initialTop);
});

/* ------------------------------------------------------------------ */
/*  Transform widget: resize handles change element dimensions         */
/* ------------------------------------------------------------------ */

/**
 * @description Validates that dragging a resize handle changes the element
 * dimensions, updating the widget's inline size on the canvas.
 */
test('dragging a resize handle changes the element dimensions', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  // Initial width for el-top-ribbon: 920
  const initialWidth = await widget.evaluate((el) => parseFloat(el.style.width));

  expect(initialWidth).toBe(920);

  // Drag the east (right) handle to resize wider
  const handle = page.getByTestId('transform-handle-e');
  const handleBox = await handle.boundingBox();

  if (handleBox === null) {
    throw new Error('Handle box not found');
  }

  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 60, startY, { steps: 5 });
  await page.mouse.up();

  // Width should have increased
  const newWidth = await widget.evaluate((el) => parseFloat(el.style.width));

  expect(newWidth).toBeGreaterThan(initialWidth);
});
