#!/bin/sh
# Quality gate for UserPromptSubmit hook.
# Runs format + typecheck + quality:strict between logical work units.
# Skips when no source files were modified.

cd "${WORKSPACE:-$(git -C "$(dirname "$0")" rev-parse --show-toplevel)}"

# Fast path: skip if no source files changed
if ! git status --porcelain 2>/dev/null | grep -qE '\.(ts|tsx|js|jsx|css|scss)$'; then
  exit 0
fi

# Auto-fix formatting
npm run format >/dev/null 2>&1 || true

# Validate quality
if npm run typecheck >/dev/null 2>&1 && npm run quality:strict >/dev/null 2>&1; then
  exit 0
fi

cat <<'EOF'
{"systemMessage":"Quality gates failed. Run `npm run quality:strict`, fix all errors, and ensure checks pass before starting new work."}
EOF
