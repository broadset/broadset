/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import type { JSX } from 'react';

import type { PropertyValue } from './panels';
import { ImagePanel, ObjectFitPanel } from './panels';

jest.mock('./modals', () => {
  const mockReact = jest.requireActual<{
    useState: <T>(initialValue: T) => readonly [T, (nextValue: T | ((currentValue: T) => T)) => void];
  }>('react');

  function MediaLibraryModal(props: {
    readonly isOpen: boolean;
    readonly assets: readonly {
      readonly id: string;
      readonly name: string;
      readonly url: string;
      readonly category: string;
    }[];
    readonly categories: readonly string[];
    readonly onSelect: (asset: {
      readonly id: string;
      readonly name: string;
      readonly url: string;
      readonly category: string;
    }) => void;
    readonly onClose: () => void;
    readonly onUploadRequest?: (() => void) | undefined;
  }): JSX.Element | null {
    const [selectedId, setSelectedId] = mockReact.useState<string | null>(null);

    if (!props.isOpen) {
      return null;
    }

    const selectedAsset = props.assets.find((asset) => asset.id === selectedId) ?? null;

    return (
      <div aria-label="Media Library" role="dialog">
        {props.assets.map((asset) => (
          <button
            key={asset.id}
            aria-label={asset.name}
            onClick={() => {
              setSelectedId(asset.id);
            }}
          >
            {asset.name}
          </button>
        ))}
        <button
          aria-label="Select"
          disabled={selectedAsset === null}
          onClick={() => {
            if (selectedAsset !== null) {
              props.onSelect(selectedAsset);
            }
          }}
        >
          Select
        </button>
      </div>
    );
  }

  return { MediaLibraryModal };
});

describe('ImagePanel', () => {
  const mediaAssets = [
    {
      id: 'asset-1',
      name: 'Headline Frame',
      url: 'https://cdn.example.com/frame.png',
      category: 'Frames',
    },
    {
      id: 'asset-2',
      name: 'Breaking Background',
      url: 'https://cdn.example.com/breaking.jpg',
      category: 'Backgrounds',
    },
  ] as const;

  /** @description Image source workflow must show a thumbnail/name row and open the media library from a primary action. */
  it('renders selected source summary row and opens media library', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(
      <ImagePanel
        content="https://cdn.example.com/frame.png"
        assetId="asset-1"
        assets={mediaAssets}
        onUpdate={onUpdate}
      />,
    );

    expect(screen.getByRole('img', { name: /selected image thumbnail/i })).not.toBeNull();
    expect(screen.getByText('Headline Frame')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /choose from library/i }));

    expect(screen.getByRole('dialog', { name: /media library/i })).not.toBeNull();
  });

  /** @description Selecting media from the library must update both content and assetId to keep URL and asset linkage in sync. */
  it('updates content and assetId when media is selected from library', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(<ImagePanel content="https://example.com/photo.jpg" assets={mediaAssets} onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: /choose from library/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Breaking Background' }));
    fireEvent.click(screen.getByRole('button', { name: /^select$/i }));

    expect(onUpdate).toHaveBeenCalledWith('content', 'https://cdn.example.com/breaking.jpg');
    expect(onUpdate).toHaveBeenCalledWith('assetId', 'asset-2');
  });

  /** @description Raw URL entry must stay behind an explicit advanced action so library selection remains the default workflow. */
  it('reveals URL input only after Replace URL action is expanded', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(<ImagePanel content="https://example.com/photo.jpg" onUpdate={onUpdate} />);

    expect(screen.queryByRole('textbox', { name: /source url/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /replace url/i }));

    const urlInput = screen.getByRole('textbox', { name: /source url/i });

    fireEvent.change(urlInput, { target: { value: 'https://example.com/manual.jpg' } });
    expect(onUpdate).toHaveBeenCalledWith('content', 'https://example.com/manual.jpg');
    expect(onUpdate).toHaveBeenCalledWith('assetId', '');
  });

  /** @description Object-fit options must use plain-English labels so users are never shown raw implementation tokens. */
  it('shows plain-English object-fit labels', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(<ObjectFitPanel objectFit="scale-down" onUpdate={onUpdate} />);

    expect(screen.getByRole('button', { name: /object fit/i })).not.toBeNull();
    expect(screen.getAllByText('Scale down').length).toBeGreaterThan(0);
    expect(screen.queryByText(/scale-down/i)).toBeNull();
  });
});
