#!/usr/bin/env bash
# End-to-end demo for LLM Wiki CLI (no LLM API calls required for structure checks)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEMO="$ROOT/demo/project"
CLI=(bun run "$ROOT/cli/index.ts")

echo "==> Initializing demo project at $DEMO"
rm -rf "$DEMO"
mkdir -p "$DEMO"
"$CLI" init "$DEMO" --template general <<< $'\nDemo Wiki\n'

echo "==> Listing pages"
"$CLI" pages -p "$DEMO"

echo "==> Lint check"
"$CLI" lint -p "$DEMO"

echo "==> Search"
"$CLI" search "Welcome" -p "$DEMO"

echo "==> Graph"
"$CLI" graph -p "$DEMO"

echo "==> Demo complete. Project at: $DEMO"
echo "Next steps:"
echo "  1. llm-wiki config          # configure LLM"
echo "  2. llm-wiki ingest -p $DEMO"
echo "  3. llm-wiki chat -p $DEMO"
