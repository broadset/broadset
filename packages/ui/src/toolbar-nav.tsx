import { Button, Tabs } from '@heroui/react';
import type { JSX, Key } from 'react';

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
        <Button
          key={info.type}
          size="sm"
          variant="ghost"
          onPress={() => {
            onSelect(info.type);
          }}
        >
          {info.label}
        </Button>
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
    <div aria-label="Pages">
      <Tabs
        aria-label="Pages"
        selectedKey={String(activePageIndex)}
        onSelectionChange={(key: Key) => {
          onPageSelect(Number(key));
        }}
      >
        <Tabs.List>
          {pages.map((page, index) => (
            <Tabs.Tab key={page.id} id={String(index)}>
              Page {index + 1}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
      <Button
        size="sm"
        variant="ghost"
        aria-label="Add page"
        onPress={() => {
          onPageAdd();
        }}
      >
        +
      </Button>
      {pages.length > 1 && (
        <Button
          size="sm"
          variant="ghost"
          aria-label="Remove page"
          onPress={() => {
            onPageRemove(activePageIndex);
          }}
        >
          −
        </Button>
      )}
    </div>
  );
}
