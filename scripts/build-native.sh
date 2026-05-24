#!/usr/bin/env bash
# Build llm-wiki-native for the current platform or a cross-compilation target.
#
# Usage:
#   ./scripts/build-native.sh                    # native release build
#   ./scripts/build-native.sh x86_64-unknown-linux-gnu   # cross-compile

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NATIVE_DIR="$ROOT/native"
TARGET="${1:-}"

cd "$NATIVE_DIR"

if [[ -n "$TARGET" ]]; then
  echo "Building llm-wiki-native for target: $TARGET"
  rustup target add "$TARGET" 2>/dev/null || true
  cargo build --release --target "$TARGET"
  OUT="$NATIVE_DIR/target/$TARGET/release/llm-wiki-native"
else
  echo "Building llm-wiki-native for host platform"
  cargo build --release
  OUT="$NATIVE_DIR/target/release/llm-wiki-native"
fi

echo "Built: $OUT"
