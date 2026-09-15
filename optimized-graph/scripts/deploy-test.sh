#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${OBSIDIAN_TEST_PLUGIN_DIR:-}" ]]; then
  echo "Set OBSIDIAN_TEST_PLUGIN_DIR to your test vault plugin directory."
  echo
  echo "Example in Git Bash:"
  echo 'export OBSIDIAN_TEST_PLUGIN_DIR="/g/Obsidian/TestVault/.obsidian/plugins/optimized-graph"'
  exit 1
fi

npm run build

mkdir -p "${OBSIDIAN_TEST_PLUGIN_DIR}"

cp main.js \
   manifest.json \
   styles.css \
   "${OBSIDIAN_TEST_PLUGIN_DIR}/"

echo
echo "Deployed Optimized Graph to:"
echo "${OBSIDIAN_TEST_PLUGIN_DIR}"
