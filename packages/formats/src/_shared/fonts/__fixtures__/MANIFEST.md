# `_shared/fonts` test fixtures

Font fixtures consumed by the `_shared/fonts/` test suite. Kept small and
committed to git so font-ops subset / metrics / embed-permission tests
can run end-to-end without network access.

| File           | Size  | Source                                                                               | License                                           | Exercises                          |
| -------------- | ----- | ------------------------------------------------------------------------------------ | ------------------------------------------------- | ---------------------------------- |
| `codicon.ttf`  | ~78KB | Microsoft VS Code — [`codicon`](https://github.com/microsoft/vscode-codicons) (v0.x) | [MIT](https://github.com/microsoft/vscode-codicons/blob/main/LICENSE) | subsetting, metrics, glyph-to-Unicode map |

Fixture additions require:

1. Provenance row above (source + license + what it exercises).
2. Size <1 MB per fixture.
3. Committed byte-for-byte (no transform).
