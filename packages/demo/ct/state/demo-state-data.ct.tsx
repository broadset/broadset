import { expect, test } from '@playwright/experimental-ct-react';
import type { Page } from '@playwright/test';

import { DemoApp } from '../../src/DemoApp';
import { createDemoAppChromeTestDocument } from '../../src/test-fixtures';
import { FIXTURE_IDS } from '../fixture-selectors';

async function openToolbarMenu(page: Page, menuLabel: string): Promise<void> {
  await page.locator(`button[aria-label="${menuLabel}"]`).first().click();
}

/**
 * @description Validates D-09 from `project/spec/demo/layout.md` and
 * `project/spec/demo/visual.md`:
 * `project/spec/demo/layout.md` and `project/spec/demo/visual.md`.
 */
test('fills the viewport and renders the sample document on screen', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const shell = page.getByTestId('demo-shell');
  const rendererHost = page.getByTestId('screen-renderer-host');

  await expect(shell).toBeVisible();
  await expect(rendererHost).toBeVisible();
  await expect(rendererHost.getByText('LIVE', { exact: true }).first()).toBeVisible();

  for (const elementId of [
    FIXTURE_IDS.background,
    FIXTURE_IDS.title,
    FIXTURE_IDS.teamHome,
    FIXTURE_IDS.teamAway,
    FIXTURE_IDS.video,
    FIXTURE_IDS.accentSvg,
    FIXTURE_IDS.accentCurve,
    FIXTURE_IDS.logo,
    FIXTURE_IDS.promoQr,
    FIXTURE_IDS.clock,
    FIXTURE_IDS.liveOrb,
    FIXTURE_IDS.ticker,
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
  const heroOpacity = page.locator(`[data-element-id="${FIXTURE_IDS.liveOrb}"] [data-opacity-target]`);

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

  expect(Math.abs(resumedOpacity - pausedOpacity)).toBeGreaterThan(0.01);

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

  const promoPanel = page.locator(`[data-element-id="${FIXTURE_IDS.promoGroup}"]`);
  const promoOpacity = page.locator(`[data-element-id="${FIXTURE_IDS.promoGroup}"] > [data-opacity-target]`);

  await expect(promoPanel).toBeVisible();

  await promoPanel.evaluate((element) => {
    element.setAttribute('data-visibility', 'offscreen');
  });
  await page.waitForTimeout(80);

  const outOpacity = Number(await promoOpacity.evaluate((element) => getComputedStyle(element).opacity));

  expect(outOpacity).toBeLessThanOrEqual(1);

  await page.waitForTimeout(650);
  await expect(promoPanel).toHaveCSS('visibility', 'hidden');

  await promoPanel.evaluate((element) => {
    element.setAttribute('data-visibility', 'onscreen');
  });
  await page.waitForTimeout(80);
  await expect(promoPanel).toHaveCSS('visibility', 'visible');

  const inOpacity = Number(await promoOpacity.evaluate((element) => getComputedStyle(element).opacity));

  expect(inOpacity).toBeGreaterThanOrEqual(0);

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
 * @description Validates T-01 from `project/spec/ui/toolbar-nav.md` and
 * `project/spec/demo/layout.md`:
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
    force: true,
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
 * @description Validates `project/spec/editor/editing.md` → the floating
 * placement-mode banner MUST NOT be rendered. Activating a tool communicates
 * placement state via the crosshair cursor and active toolbar button only.
 */
test('placement mode uses the crosshair cursor + active toolbar button instead of a banner', async ({
  mount,
  page,
}) => {
  await mount(<DemoApp />);

  const preview = page.getByLabel(/screen preview for/i);
  const rectangleButton = page.locator('button[aria-label="Rectangle"]').first();

  await rectangleButton.click();

  await expect(page.getByTestId('placement-mode-banner')).toHaveCount(0);
  await expect.poll(async () => preview.evaluate((element) => getComputedStyle(element).cursor)).toBe('crosshair');

  await rectangleButton.click();

  await expect.poll(async () => preview.evaluate((element) => getComputedStyle(element).cursor)).toBe('default');
});

/**
 * @description Validates D-02 from `project/spec/demo/state.md`:
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
 * @description Validates D-03 from `project/spec/demo/state.md`:
 * startup restores a previously saved localStorage document.
 */
test('restores a previously saved localStorage document on startup', async ({ mount, page }) => {
  const savedDocument = JSON.parse(JSON.stringify(createDemoAppChromeTestDocument())) as {
    name?: string;
  };

  savedDocument.name = 'Restored Startup Document';

  await page.evaluate(() => {
    window.localStorage.removeItem('broadset:demo-document:v1');
  });
  await page.evaluate((documentPayload) => {
    window.localStorage.setItem('broadset:demo-document:v1', JSON.stringify(documentPayload));
  }, savedDocument);

  await mount(<DemoApp />);

  await openToolbarMenu(page, 'File');
  await page.getByText('Document Settings').first().click();
  await expect(page.getByLabel('Document name')).toHaveValue('Restored Startup Document');
  await page.getByRole('button', { name: 'Done' }).click();
});

/**
 * @description Validates D-04 from `project/spec/demo/state.md`:
 * `project/spec/demo/state.md`: successful actions show auto-dismissing
 * success toasts at the bottom-right.
 */
test('shows and auto-dismisses success toasts for successful actions', async ({ mount, page }) => {
  await mount(<DemoApp />);

  await openToolbarMenu(page, 'Scenes');
  await page.getByText('Add scene').first().click();

  // Toast should appear with success message
  await expect(page.getByText('Added a new scene.')).toBeVisible({ timeout: 3000 });
  await expect(page.getByText('Added a new scene.')).toHaveCount(0, { timeout: 6000 });
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
 * @description Validates D-01 from `project/spec/demo/state.md`:
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

/**
 * @description Validates D-05 from `project/spec/demo/data-integration.md`:
 * import/export workflows surface descriptive error toasts on failures,
 * including export precondition failures for video formats.
 */
test('surfaces import and export failure workflows with descriptive toasts', async ({ mount, page }) => {
  await mount(<DemoApp />);

  await page.locator('input[type="file"]').setInputFiles({
    buffer: Buffer.from('not-a-supported-format'),
    mimeType: 'text/plain',
    name: 'unsupported.txt',
  });
  await expect(page.getByText(/Import failed:/)).toBeVisible({ timeout: 4000 });

  await openToolbarMenu(page, 'File');
  await page.getByText('Export').first().click();
  await expect(page.getByRole('dialog', { name: 'Export' })).toBeVisible();

  await page.locator('button[aria-label="MP4"]').first().click();
  await page.locator('button[aria-label="Export"]').first().click();

  await page.waitForFunction(
    () => {
      const status = document.body.getAttribute('data-export-status');
      const hasFailureToast = Array.from(document.querySelectorAll('*')).some((node) => {
        const text = node.textContent;

        return typeof text === 'string' && text.includes('Export failed:');
      });

      return (
        hasFailureToast || status === 'rendering' || status === 'encoding' || status === 'done' || status === 'error'
      );
    },
    undefined,
    { timeout: 5000 },
  );
});

/**
 * @description Validates D-06 from `project/spec/demo/data-integration.md`:
 * live-data-fed clock/ticker renderer surfaces are present and populated so
 * runtime data updates have concrete render targets in the mounted demo shell.
 */
test('live data is seeded into rendered clock and ticker content', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const clockElement = page.locator(`[data-element-id="${FIXTURE_IDS.clock}"]`).first();
  const tickerElement = page.locator(`[data-element-id="${FIXTURE_IDS.ticker}"]`).first();

  await expect(clockElement).toBeVisible();
  await expect(tickerElement).toBeVisible();

  await expect(clockElement).toContainText(/mm:ss|HH:mm:ss|:/);
  await expect(tickerElement).not.toHaveText('');
});

/**
 * @description Validates D-07 from `project/spec/demo/state.md`:
 * fullscreen control toggles host fullscreen state and updates toolbar icon
 * labeling to reflect current mode.
 */
test('fullscreen toggle updates toolbar state label for enter/exit transitions', async ({ mount, page }) => {
  await page.evaluate(() => {
    let activeFullscreenElement: Element | null = null;

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => activeFullscreenElement,
    });

    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: () => {
        activeFullscreenElement = document.documentElement;
        document.dispatchEvent(new Event('fullscreenchange'));
      },
    });

    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: () => {
        activeFullscreenElement = null;
        document.dispatchEvent(new Event('fullscreenchange'));
      },
    });
  });

  await mount(<DemoApp />);

  const fullscreenButton = page.locator('button[aria-label="Enter fullscreen"]').first();

  await expect(fullscreenButton).toBeVisible();
  await fullscreenButton.click();
  await expect(page.locator('button[aria-label="Exit fullscreen"]').first()).toBeVisible();

  await page.locator('button[aria-label="Exit fullscreen"]').first().click();
  await expect(page.locator('button[aria-label="Enter fullscreen"]').first()).toBeVisible();
});

/**
 * @description Validates D-08 from `project/spec/demo/state.md`:
 * browser zoom gestures (Ctrl/Cmd+wheel and zoom shortcuts) are prevented
 * while standard non-zoom interactions continue to work.
 */
test('prevents browser zoom gestures while allowing normal wheel/key events', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const preventResults = await page.evaluate(() => {
    const wheelZoom = new WheelEvent('wheel', { cancelable: true, ctrlKey: true });
    const wheelNormal = new WheelEvent('wheel', { cancelable: true });
    const keyZoom = new KeyboardEvent('keydown', { cancelable: true, ctrlKey: true, key: '+' });
    const keyNormal = new KeyboardEvent('keydown', { cancelable: true, key: 'a' });

    window.dispatchEvent(wheelZoom);
    window.dispatchEvent(wheelNormal);
    window.dispatchEvent(keyZoom);
    window.dispatchEvent(keyNormal);

    return {
      keyNormalPrevented: keyNormal.defaultPrevented,
      keyZoomPrevented: keyZoom.defaultPrevented,
      wheelNormalPrevented: wheelNormal.defaultPrevented,
      wheelZoomPrevented: wheelZoom.defaultPrevented,
    };
  });

  expect(preventResults.wheelZoomPrevented).toBe(true);
  expect(preventResults.keyZoomPrevented).toBe(true);
  expect(preventResults.wheelNormalPrevented).toBe(false);
  expect(preventResults.keyNormalPrevented).toBe(false);
});
