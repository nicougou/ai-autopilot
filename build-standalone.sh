#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${1:-$SCRIPT_DIR/dist}"

mkdir -p "$OUT_DIR/prompt-templates" "$OUT_DIR/sources"

bun build "$SCRIPT_DIR/index.ts" --compile --outfile "$OUT_DIR/ai-autopilot"
cp "$SCRIPT_DIR"/prompt-templates/*.md "$OUT_DIR/prompt-templates/"
cp "$SCRIPT_DIR"/sources/*.ts "$OUT_DIR/sources/"
cp "$SCRIPT_DIR/config.example.json" "$OUT_DIR/config.example.json"
cp "$SCRIPT_DIR/README.md" "$OUT_DIR/README.md"

printf "\nStandalone package created:\n"
printf "%s\n" "- Binary: $OUT_DIR/ai-autopilot"
printf "%s\n" "- Templates: $OUT_DIR/prompt-templates"
printf "%s\n" "- Sources: $OUT_DIR/sources"
printf "%s\n" "- Config example: $OUT_DIR/config.example.json"
printf "%s\n\n" "- Docs: $OUT_DIR/README.md"

printf "Run examples:\n"
printf "cp \"%s/config.example.json\" \"%s/config.json\"\n" "$OUT_DIR" "$OUT_DIR"
printf "AUTO_PR_HOME=\"%s\" \"%s/ai-autopilot\" --help\n" "$OUT_DIR" "$OUT_DIR"
printf "\"%s/ai-autopilot\" --home \"%s\" --help\n" "$OUT_DIR" "$OUT_DIR"
