#!/usr/bin/env bash
set -euo pipefail

PLUGIN_ID="optimized-graph"

TEST_VAULT="/c/Users/baley/Documents/Coding Projects/graph-optimizer/test-vault-2"

SCRIPT_DIR="$(
  cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1
  pwd
)"

REPO_ROOT="$(
  cd -- "${SCRIPT_DIR}/.." >/dev/null 2>&1
  pwd
)"

cd "${REPO_ROOT}"

PACKAGE_DIR="${REPO_ROOT}/dist/${PLUGIN_ID}"
PLUGIN_DIR="${TEST_VAULT}/.obsidian/plugins/${PLUGIN_ID}"

echo "Optimized Graph test deployment"
echo
echo "Repository:"
echo "  ${REPO_ROOT}"
echo
echo "Test vault:"
echo "  ${TEST_VAULT}"
echo
echo "Plugin destination:"
echo "  ${PLUGIN_DIR}"
echo

if [[ ! -d "${TEST_VAULT}" ]]; then
  echo "Deployment failed."
  echo
  echo "The configured test vault does not exist:"
  echo "  ${TEST_VAULT}"
  echo
  echo "Edit TEST_VAULT near the top of:"
  echo "  scripts/deploy-test.sh"
  exit 1
fi

if [[ ! -d "${TEST_VAULT}/.obsidian" ]]; then
  echo "Deployment failed."
  echo
  echo "The directory exists, but it does not look like an Obsidian vault."
  echo "Missing:"
  echo "  ${TEST_VAULT}/.obsidian"
  exit 1
fi

echo "1. Creating a fresh runtime package..."
npm run package

echo
echo "2. Validating runtime package..."

runtime_files=(
  "main.js"
  "manifest.json"
  "styles.css"
)

for file in "${runtime_files[@]}"; do
  if [[ ! -s "${PACKAGE_DIR}/${file}" ]]; then
    echo
    echo "Deployment failed."
    echo "Package file is missing or empty:"
    echo "  ${PACKAGE_DIR}/${file}"
    exit 1
  fi
done

echo
echo "3. Recreating plugin destination..."
rm -rf "${PLUGIN_DIR}"
mkdir -p "${PLUGIN_DIR}"

echo
echo "4. Copying runtime files..."

for file in "${runtime_files[@]}"; do
  echo "  ${file}"

  cp \
    "${PACKAGE_DIR}/${file}" \
    "${PLUGIN_DIR}/${file}"
done

echo
echo "5. Validating deployed plugin..."

for file in "${runtime_files[@]}"; do
  if [[ ! -s "${PLUGIN_DIR}/${file}" ]]; then
    echo
    echo "Deployment failed."
    echo "Deployed file is missing or empty:"
    echo "  ${PLUGIN_DIR}/${file}"
    exit 1
  fi
done

echo
echo "Deployment complete."
echo
echo "Deployed files:"
for file in "${runtime_files[@]}"; do
  echo "  ${PLUGIN_DIR}/${file}"
done

echo
echo "Next:"
echo "  Reload Obsidian"
echo "  or disable/re-enable Optimized Graph."
