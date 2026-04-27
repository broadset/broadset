# python-pptx Oracle Fixture

This directory is for locally generated oracle fixtures created by `python-pptx`.

Run from `packages/formats`:

```bash
python3 -m pip install -r scripts/requirements-pptx-oracle.txt
npm run pptx:oracle:generate
npm run pptx:oracle:test
```

The generated `.pptx` and `.expected.json` files live under `.cache/` and are intentionally ignored. They are dev-only artifacts for catching ECMA-376 parsing regressions against a known-good OOXML writer.