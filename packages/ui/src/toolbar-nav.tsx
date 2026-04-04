import type { JSX } from 'react';

// ---------------------------------------------------------------------------
// Element Library
// ---------------------------------------------------------------------------

export interface ElementTypeInfo {
  readonly type: string;
  readonly label: string;
  readonly icon?: string;
}

export interface ElementLibraryProps {
  readonly elementTypes: readonly ElementTypeInfo[];
  readonly onSelect: (type: string) => void;
}

export function ElementLibrary({ elementTypes, onSelect }: ElementLibraryProps): JSX.Element {
  return (
    <div role="group" aria-label="Element library">
      {elementTypes.map((info) => (
        <button
          key={info.type}
          type="button"
          onClick={() => {
            onSelect(info.type);
          }}
        >
          {info.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page Sorter
// ---------------------------------------------------------------------------

export interface PageInfo {
  readonly id: string;
}

export interface PageSorterProps {
  readonly pages: readonly PageInfo[];
  readonly activePageIndex: number;
  readonly onPageSelect: (index: number) => void;
  readonly onPageAdd: () => void;
  readonly onPageRemove: (index: number) => void;
}

export function PageSorter({
  pages,
  activePageIndex,
  onPageSelect,
  onPageAdd,
  onPageRemove,
}: PageSorterProps): JSX.Element {
  return (
    <div role="tablist" aria-label="Pages">
      {pages.map((page, index) => (
        <button
          key={page.id}
          role="tab"
          type="button"
          aria-selected={index === activePageIndex}
          onClick={() => {
            onPageSelect(index);
          }}
        >
          Page {index + 1}
        </button>
      ))}
      <button
        type="button"
        aria-label="Add page"
        onClick={() => {
          onPageAdd();
        }}
      >
        +
      </button>
      {pages.length > 1 && (
        <button
          type="button"
          aria-label="Remove page"
          onClick={() => {
            onPageRemove(activePageIndex);
          }}
        >
          −
        </button>
      )}
    </div>
  );
}
