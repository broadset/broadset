#!/bin/sh
# PreToolUse hook: gate git-commit commands behind quality checks.
# Reads hook input JSON from stdin to detect git commit in terminal commands.
# Allows all non-commit tool uses immediately.
set -e

cd "${WORKSPACE:-$(git -C "$(dirname "$0")" rev-parse --show-toplevel)}"

INPUT=$(cat)

# Extract tool name
TOOL=$(echo "$INPUT" | grep -o '"tool_name" *: *"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')

# Only gate run_in_terminal
if [ "$TOOL" != "run_in_terminal" ]; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'
  exit 0
fi

# Check if the command contains git commit
if ! echo "$INPUT" | grep -qE 'git[[:space:]]+(commit|stash)'; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'
  exit 0
fi

# Gate: run quality checks before allowing commit
if npm run format >/dev/null 2>&1 && npm run typecheck >/dev/null 2>&1 && npm run quality:strict >/dev/null 2>&1; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'
  exit 0
fi

echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Quality gates failed. Fix lint/type/test errors before committing."}}'
exit 0
