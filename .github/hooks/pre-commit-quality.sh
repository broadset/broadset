#!/bin/sh
# Pre-commit quality gate for broadset
# Runs format, typecheck, then full strict quality suite.
set -e

echo "Running format..."
npm run format

echo "Running typecheck..."
npm run typecheck

echo "Running quality:strict..."
npm run quality:strict

echo "All quality checks passed."
