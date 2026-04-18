#!/bin/sh
# Secret-scan staged content before a commit.
# Requires `gitleaks` in PATH (install via `brew install gitleaks` on macOS).
# If gitleaks is not installed, prints an install hint and EXITS 0 so local
# dev is not blocked on tool install — CI enforces it unconditionally.
set -e

if ! command -v gitleaks >/dev/null 2>&1; then
  cat <<'EOF' >&2
[gitleaks-check] gitleaks not found in PATH — skipping local scan.
    Install: brew install gitleaks   (or see https://github.com/gitleaks/gitleaks)
    CI runs gitleaks unconditionally and will block leaked secrets regardless.
EOF
  exit 0
fi

cd "${WORKSPACE:-$(git -C "$(dirname "$0")" rev-parse --show-toplevel)}"

gitleaks protect --staged --redact --no-banner
