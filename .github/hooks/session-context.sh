#!/bin/sh
# SessionStart hook: inject project conventions as system context.
set -e

cat <<'EOF'
{"systemMessage":"Project conventions:\n- Implementation order: Types → Math/Logic → Zustand state → React components.\n- Commit like a senior dev: logical, testable units with conventional prefixes (feat:/fix:/chore:/refactor:/test:). Keep messages very short.\n- Quality gates: `npm run format && npm run quality:strict` before every commit.\n- Every feature needs unit/CT tests AND a demo-app demonstration.\n- Packages: model, playback, renderer, editor, formats, ui (HeroUI v3 host), demo (integration host).\n- TypeScript strict mode. No `any`. Prefer readonly. Validate at system boundaries only.\n- Keep working without asking permission to proceed to the next task."}
EOF
