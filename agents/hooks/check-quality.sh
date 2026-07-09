#!/bin/sh
# Claude Code UserPromptSubmit hook: fast-path lint + typecheck only.
# Runs between work units when source files changed. Tests are NOT run here —
# the full quality:strict + ct + build gate fires at commit/push time instead.
cd "${WORKSPACE:-$(git -C "$(dirname "$0")" rev-parse --show-toplevel)}"

if ! git status --porcelain 2>/dev/null | grep -qE '\.(ts|tsx|js|jsx|css|scss)$'; then
  exit 0
fi

if npm run lint:strict >/dev/null 2>&1 && npm run typecheck >/dev/null 2>&1; then
  exit 0
fi

cat <<'EOF'
{"systemMessage":"Lint or typecheck failed. Run `npm run lint:strict && npm run typecheck`, fix all errors before continuing new work."}
EOF
