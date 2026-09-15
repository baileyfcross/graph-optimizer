#!/usr/bin/env bash
set -euo pipefail

PLUGIN_ID="optimized-graph"

SCRIPT_DIR="$(
  cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1
  pwd
)"

REPO_ROOT="$(
  cd -- "${SCRIPT_DIR}/.." >/dev/null 2>&1
  pwd
)"

cd "${REPO_ROOT}"

DIST_ROOT="${REPO_ROOT}/dist"
PACKAGE_DIR="${DIST_ROOT}/${PLUGIN_ID}"
PACKAGE_ZIP="${DIST_ROOT}/${PLUGIN_ID}.zip"

echo "Packaging ${PLUGIN_ID}..."
echo "Repository:"
echo "  ${REPO_ROOT}"
echo

echo "1. Building production bundle..."
npm run build

echo
echo "2. Recreating runtime package directory..."
rm -rf "${PACKAGE_DIR}"
mkdir -p "${PACKAGE_DIR}"

echo
echo "3. Copying runtime files..."

runtime_files=(
  "main.js"
  "manifest.json"
  "styles.css"
)

for file in "${runtime_files[@]}"; do
  if [[ ! -s "${REPO_ROOT}/${file}" ]]; then
    echo
    echo "Packaging failed."
    echo "Missing or empty runtime file:"
    echo "  ${REPO_ROOT}/${file}"
    exit 1
  fi

  cp \
    "${REPO_ROOT}/${file}" \
    "${PACKAGE_DIR}/${file}"
done

echo
echo "4. Validating package directory..."

for file in "${runtime_files[@]}"; do
  if [[ ! -s "${PACKAGE_DIR}/${file}" ]]; then
    echo
    echo "Packaging failed."
    echo "Missing or empty packaged file:"
    echo "  ${PACKAGE_DIR}/${file}"
    exit 1
  fi
done

echo
echo "Runtime package ready:"
echo "  ${PACKAGE_DIR}"

echo
echo "Packaged files:"
for file in "${runtime_files[@]}"; do
  echo "  ${PACKAGE_DIR}/${file}"
done

echo
echo "5. Creating ZIP when a ZIP utility is available..."

rm -f "${PACKAGE_ZIP}"

if command -v zip >/dev/null 2>&1; then
  (
    cd "${DIST_ROOT}"
    zip -qr \
      "${PLUGIN_ID}.zip" \
      "${PLUGIN_ID}"
  )

  echo "ZIP created:"
  echo "  ${PACKAGE_ZIP}"
else
  echo "The 'zip' command is not installed."
  echo "Skipping distributable ZIP creation."
  echo
  echo "This does NOT affect deploy:test."
  echo "The runtime package directory is complete and can be deployed."
fi

echo
echo "Package command complete."
