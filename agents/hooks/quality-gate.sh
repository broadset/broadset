#!/bin/sh
# Canonical broadset quality gate.
# Runs format + typecheck + quality:strict; exits non-zero on any failure.
# Single source of truth, called from:
#   - .husky/pre-commit  (catches every commit, by any agent or by hand)
#   - agents/hooks/gate-commit.sh   (Claude Code PreToolUse, early deny)
#   - agents/hooks/check-quality.sh (Claude Code UserPromptSubmit, between work units)
#   - .claude/settings.json Stop hook (end of Claude session)
set -e

cd "${WORKSPACE:-$(git -C "$(dirname "$0")" rev-parse --show-toplevel)}"

echo "Running format..."
npm run format

echo "Running typecheck..."
npm run typecheck

echo "Running quality:strict..."
npm run quality:strict

echo "All quality checks passed."
