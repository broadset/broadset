#!/bin/sh
# Claude Code SessionStart hook: nudge the agent to read canonical workspace docs.
# Conventions live in CLAUDE.md (which @-imports AGENTS.md, CONTRIBUTING.md, and
# every agents/instructions/*.md). This hook avoids duplicating that content.
set -e

cat <<'EOF'
{"systemMessage":"Read CLAUDE.md before answering — it @-imports AGENTS.md, CONTRIBUTING.md, and agents/instructions/*. Quality gates (format + typecheck + quality:strict) run automatically before every commit via .husky/pre-commit -> agents/hooks/quality-gate.sh."}
EOF
