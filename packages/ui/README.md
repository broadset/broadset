# @broadset/ui

HeroUI-based editor host components used by Broadset demo and integrators.

## Responsibilities

- Provide reusable UI modules (toolbar, sidebars, modals, timeline UI, property panels).
- Expose component APIs that bind to editor/store orchestration in host apps.
- Maintain design token usage and consistent HeroUI-first interaction patterns.

## Usage

```tsx
import { ExportModal, PropertiesSidebar } from '@broadset/ui';
```

## Notes

- HeroUI-first rule applies to all package UI chrome.
- Package boundary: import only via peer dependencies (`editor`, `formats`, `model`, `renderer`).
