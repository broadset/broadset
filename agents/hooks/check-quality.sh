#!/bin/sh
# Claude Code UserPromptSubmit hook: run the quality gate between work units
# when source files have been modified. Fast-paths out when nothing relevant changed.
cd "${WORKSPACE:-$(git -C "$(dirname "$0")" rev-parse --show-toplevel)}"

if ! git status --porcelain 2>/dev/null | grep -qE '\.(ts|tsx|js|jsx|css|scss)$'; then
  exit 0
fi

if "$(dirname "$0")/quality-gate.sh" >/dev/null 2>&1; then
  exit 0
fi

cat <<'EOF'
{"systemMessage":"Quality gate failed. Run `agents/hooks/quality-gate.sh`, fix all errors, and ensure checks pass before continuing new work."}
EOF
