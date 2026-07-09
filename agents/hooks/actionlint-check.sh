#!/bin/sh
# Lint GitHub Actions workflow files.
# Requires `actionlint` in PATH (install via `brew install actionlint` on macOS).
# If actionlint is not installed, prints an install hint and EXITS 0 so local
# dev is not blocked on tool install — CI enforces it unconditionally.
set -e

if ! command -v actionlint >/dev/null 2>&1; then
  cat <<'EOF' >&2
[actionlint-check] actionlint not found in PATH — skipping local scan.
    Install: brew install actionlint   (or see https://github.com/rhysd/actionlint)
    CI runs actionlint unconditionally.
EOF
  exit 0
fi

cd "${WORKSPACE:-$(git -C "$(dirname "$0")" rev-parse --show-toplevel)}"

actionlint
