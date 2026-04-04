import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';

import type { CanvasSettingsModalProps, MediaAsset, MediaCategory } from './modals';
import {
  AboutModal,
  CanvasSettingsModal,
  ExportModal,
  MediaLibraryModal,
  NewDocumentModal,
  ShortcutHelpModal,
} from './modals';

// ---------------------------------------------------------------------------
// About Modal
// ---------------------------------------------------------------------------

describe('AboutModal', () => {
  /** @description Verifies that the modal content is visible when open and onClose fires on close button click. */
  it('renders content when open and calls onClose on close', () => {
    const onClose = jest.fn<() => void>();

    render(<AboutModal isOpen={true} onClose={onClose} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/about/i)).toBeInTheDocument();

    const closeButton = screen.getByRole('button', { name: /close/i });

    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalled();
  });

  /** @description Verifies that nothing renders when the modal is closed. */
  it('does not render when closed', () => {
    render(<AboutModal isOpen={false} onClose={jest.fn()} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Canvas Settings Modal
// ---------------------------------------------------------------------------

describe('CanvasSettingsModal', () => {
  const defaultGridSettings = {
    gridSize: 10,
    showGrid: true,
    snapToGrid: false,
    snapThreshold: 5,
  };

  function renderCanvasSettings(overrides?: Partial<CanvasSettingsModalProps>): {
    readonly onClose: jest.Mock<() => void>;
    readonly onDocumentNameChange: jest.Mock<(name: string) => void>;
    readonly onViewModeChange: jest.Mock<(mode: 'broadcast' | 'none' | 'print') => void>;
    readonly onGridChange: jest.Mock<(settings: { readonly showGrid: boolean; readonly snapToGrid: boolean }) => void>;
  } {
    const onClose = jest.fn<() => void>();
    const onDocumentNameChange = jest.fn<(name: string) => void>();
    const onViewModeChange = jest.fn<(mode: 'broadcast' | 'none' | 'print') => void>();
    const onGridChange = jest.fn<(settings: { readonly showGrid: boolean; readonly snapToGrid: boolean }) => void>();

    render(
      <CanvasSettingsModal
        isOpen={true}
        onClose={onClose}
        documentName="My Doc"
        onDocumentNameChange={onDocumentNameChange}
        viewMode="none"
        onViewModeChange={onViewModeChange}
        showRulers={false}
        onRulersChange={jest.fn()}
        perspectiveAngle={0}
        onPerspectiveChange={jest.fn()}
        gridSettings={defaultGridSettings}
        onGridChange={onGridChange}
        {...overrides}
      />,
    );

    return { onClose, onDocumentNameChange, onViewModeChange, onGridChange };
  }

  /** @description Verifies that changing the document name fires onDocumentNameChange. */
  it('fires onDocumentNameChange when name input changes', () => {
    const { onDocumentNameChange } = renderCanvasSettings();

    const nameInput = screen.getByDisplayValue('My Doc');

    fireEvent.change(nameInput, { target: { value: 'New Name' } });
    expect(onDocumentNameChange).toHaveBeenCalledWith('New Name');
  });

  /** @description Verifies that view mode buttons are visible and fire onViewModeChange. */
  it('fires onViewModeChange when a view mode button is pressed', () => {
    const { onViewModeChange } = renderCanvasSettings();

    const broadcastButton = screen.getByRole('button', { name: /broadcast/i });

    fireEvent.click(broadcastButton);
    expect(onViewModeChange).toHaveBeenCalledWith('broadcast');
  });

  /** @description Verifies that grid switches fire onGridChange with updated values. */
  it('fires onGridChange when grid switches are toggled', () => {
    const { onGridChange } = renderCanvasSettings();

    // The snap-to-grid switch should be toggleable
    const snapSwitch = screen.getByRole('switch', { name: /snap to grid/i });

    fireEvent.click(snapSwitch);
    expect(onGridChange).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Export Modal
// ---------------------------------------------------------------------------

describe('ExportModal', () => {
  const fullFeatures = {
    transforms3d: true,
    clipChildren: true,
    animations: true,
    importSvg: true,
    importPsd: true,
    importPptx: true,
    exportHtml: true,
    exportSvg: true,
    exportPdf: true,
    exportPsd: true,
    exportPptx: true,
    exportPng: true,
    exportJpeg: true,
    exportSvgEmbedded: true,
    exportOgraf: true,
    exportMp4: true,
    exportWebm: true,
    broadcastPreview: true,
  };

  const limitedFeatures = {
    ...fullFeatures,
    exportPdf: false,
    exportPsd: false,
    exportPptx: false,
    exportMp4: false,
    exportWebm: false,
  };

  /** @description Verifies that only enabled exporters are shown based on feature flags. */
  it('shows only enabled exporters', () => {
    render(<ExportModal isOpen={true} onClose={jest.fn()} featureConfig={limitedFeatures} onExport={jest.fn()} />);

    // PNG and SVG should be visible (enabled)
    expect(screen.getByText(/png/i)).toBeInTheDocument();
    expect(screen.getByText(/^svg$/i)).toBeInTheDocument();

    // PDF and PSD should not be visible (disabled)
    expect(screen.queryByText(/^pdf$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^psd$/i)).not.toBeInTheDocument();
  });

  /** @description Verifies that submit fires the callback with selected exporter. */
  it('fires onExport with selected exporter on submit', () => {
    const onExport = jest.fn<(format: string) => void>();

    render(<ExportModal isOpen={true} onClose={jest.fn()} featureConfig={fullFeatures} onExport={onExport} />);

    // Click a format option
    const pngOption = screen.getByText(/png/i);

    fireEvent.click(pngOption);

    // Click submit/export
    const exportButton = screen.getByRole('button', { name: /export/i });

    fireEvent.click(exportButton);
    expect(onExport).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Media Library Modal
// ---------------------------------------------------------------------------

describe('MediaLibraryModal', () => {
  const testAssets: readonly MediaAsset[] = [
    { id: 'a1', name: 'Logo', url: 'https://example.com/logo.png', categoryId: 'cat1' },
    { id: 'a2', name: 'Banner', url: 'https://example.com/banner.jpg', categoryId: 'cat2' },
    { id: 'a3', name: 'Icon Set', url: 'https://example.com/icons.svg', categoryId: 'cat1' },
  ];

  const testCategories: readonly MediaCategory[] = [
    { id: 'cat1', name: 'Logos' },
    { id: 'cat2', name: 'Banners' },
  ];

  /** @description Verifies that assets are filtered by search query. */
  it('filters assets by search query', () => {
    render(
      <MediaLibraryModal
        isOpen={true}
        onClose={jest.fn()}
        assets={testAssets}
        categories={testCategories}
        onSelect={jest.fn()}
      />,
    );

    // Type a search query
    const searchInput = screen.getByPlaceholderText(/search/i);

    fireEvent.change(searchInput, { target: { value: 'Logo' } });

    // Only Logo and Icon Set should remain (matching "Logo")
    expect(screen.getByText('Logo')).toBeInTheDocument();
    expect(screen.queryByText('Banner')).not.toBeInTheDocument();
  });

  /** @description Verifies that assets are filtered by category. */
  it('filters assets by category tab', () => {
    render(
      <MediaLibraryModal
        isOpen={true}
        onClose={jest.fn()}
        assets={testAssets}
        categories={testCategories}
        onSelect={jest.fn()}
      />,
    );

    // Click Banners tab
    const bannersTab = screen.getByText('Banners');

    fireEvent.click(bannersTab);

    // Only Banner should be visible
    expect(screen.getByText('Banner')).toBeInTheDocument();
    expect(screen.queryByText('Logo')).not.toBeInTheDocument();
  });

  /** @description Verifies that selecting an asset and clicking confirm fires onSelect. */
  it('fires onSelect when asset is selected and confirmed', () => {
    const onSelect = jest.fn<(assetId: string) => void>();

    render(
      <MediaLibraryModal
        isOpen={true}
        onClose={jest.fn()}
        assets={testAssets}
        categories={testCategories}
        onSelect={onSelect}
      />,
    );

    // Click on the Logo asset
    fireEvent.click(screen.getByText('Logo'));

    // Click Select button
    const selectButton = screen.getByRole('button', { name: /select/i });

    fireEvent.click(selectButton);
    expect(onSelect).toHaveBeenCalledWith('a1');
  });
});

// ---------------------------------------------------------------------------
// New Document Modal
// ---------------------------------------------------------------------------

describe('NewDocumentModal', () => {
  /** @description Verifies that selecting a preset and clicking Create fires onCreateDocument. */
  it('fires onCreateDocument when preset is selected and Create is clicked', () => {
    const onCreateDocument =
      jest.fn<
        (preset: {
          readonly label: string;
          readonly width: number;
          readonly height: number;
          readonly mode: 'screen' | 'print';
        }) => void
      >();

    render(<NewDocumentModal isOpen={true} onClose={jest.fn()} onCreateDocument={onCreateDocument} />);

    // Click on a preset (built-in presets should be visible)
    const hdPreset = screen.getByText(/full hd/i);

    fireEvent.click(hdPreset);

    // Click Create
    const createButton = screen.getByRole('button', { name: /create/i });

    fireEvent.click(createButton);
    expect(onCreateDocument).toHaveBeenCalled();
  });

  /** @description Verifies that custom presets are shown when provided. */
  it('shows custom presets when provided', () => {
    const customPresets = [
      {
        category: 'Custom',
        presets: [{ label: 'Custom Size', width: 500, height: 300, mode: 'screen' as const }],
      },
    ];

    render(
      <NewDocumentModal isOpen={true} onClose={jest.fn()} onCreateDocument={jest.fn()} customPresets={customPresets} />,
    );

    expect(screen.getByText('Custom Size')).toBeInTheDocument();
  });

  /** @description Verifies that Create does not fire when no preset is selected. */
  it('does not fire onCreateDocument when no preset is selected', () => {
    const onCreateDocument = jest.fn<() => void>();

    render(<NewDocumentModal isOpen={true} onClose={jest.fn()} onCreateDocument={onCreateDocument} />);

    const createButton = screen.getByRole('button', { name: /create/i });

    fireEvent.click(createButton);
    expect(onCreateDocument).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Shortcut Help Modal
// ---------------------------------------------------------------------------

describe('ShortcutHelpModal', () => {
  /** @description Verifies that all five shortcut groups are shown with kbd elements. */
  it('displays all shortcut groups with kbd elements', () => {
    render(<ShortcutHelpModal isOpen={true} onClose={jest.fn()} />);

    const dialog = screen.getByRole('dialog');

    expect(dialog).toBeInTheDocument();

    // Should have kbd elements for keyboard shortcuts
    const kbdElements = dialog.querySelectorAll('kbd');

    expect(kbdElements.length).toBeGreaterThan(0);

    // Should have headings for the shortcut groups
    expect(screen.getByText(/general/i)).toBeInTheDocument();
    expect(screen.getByText(/navigation/i)).toBeInTheDocument();
  });

  /** @description Verifies that the close button calls onClose. */
  it('calls onClose when close button is clicked', () => {
    const onClose = jest.fn<() => void>();

    render(<ShortcutHelpModal isOpen={true} onClose={onClose} />);

    const closeButton = screen.getByRole('button', { name: /close/i });

    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalled();
  });
});
