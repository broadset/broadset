#!/bin/sh
# Claude Code PreToolUse hook: gate `git commit` Bash calls behind quality:strict.
# Reads hook input JSON from stdin. Allows everything that isn't a git commit.
# On commit: runs the canonical quality gate; deny if it fails.
set -e

cd "${WORKSPACE:-$(git -C "$(dirname "$0")" rev-parse --show-toplevel)}"

INPUT=$(cat)

TOOL=$(echo "$INPUT" | grep -o '"tool_name" *: *"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')

allow() {
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'
  exit 0
}

if [ "$TOOL" != "Bash" ]; then
  allow
fi

if ! echo "$INPUT" | grep -qE 'git[[:space:]]+commit'; then
  allow
fi

if "$(dirname "$0")/quality-gate.sh" >/dev/null 2>&1; then
  allow
fi

echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Quality gate failed. Run agents/hooks/quality-gate.sh, fix all errors, then retry the commit."}}'
exit 0
