#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

echo "[quality-gate] PHP syntax"
php_count=0
while IFS= read -r -d '' file; do
  php -l "$file"
  php_count=$((php_count + 1))
done < <(git ls-files -z -- '*.php')

if [ "$php_count" -eq 0 ]; then
  echo "::error::No tracked PHP files found"
  exit 1
fi
echo "[quality-gate] Checked ${php_count} PHP file(s)"

echo "[quality-gate] JavaScript syntax"
js_count=0
while IFS= read -r -d '' file; do
  node --check "$file"
  js_count=$((js_count + 1))
done < <(git ls-files -z -- '*.js' '*.mjs')

if [ "$js_count" -eq 0 ]; then
  echo "::error::No tracked JavaScript/MJS files found"
  exit 1
fi
echo "[quality-gate] Checked ${js_count} JavaScript/MJS file(s)"

echo "[quality-gate] Role invariants"
npm run tool:verify-roles

echo "[quality-gate] Vehicle save invariants"
npm run tool:verify-vehicle-save

echo "[quality-gate] Vehicle render invariants"
npm run tool:verify-vehicle-render

echo "[quality-gate] Vehicle render measurement gates"
npm run tool:measure-vehicle-render

echo "[quality-gate] Driver lazy module invariants"
npm run tool:verify-driver-lazy

echo "[quality-gate] Driver boot measurement gates"
npm run tool:measure-driver-boot

echo "[quality-gate] Visible store invariants"
npm run tool:verify-visible-store

echo "[quality-gate] Visible store measurement gates"
npm run tool:measure-visible-store

echo "[quality-gate] Save wire delta invariants"
npm run tool:verify-save-wire

echo "[quality-gate] Save wire payload measurement gates"
npm run tool:measure-save-wire

echo "[quality-gate] Sensitive data invariants"
npm run tool:verify-sensitive-data

echo "[quality-gate] Kasko lookup invariants"
npm run tool:verify-kasko-lookup

echo "[quality-gate] User password invariants"
npm run tool:verify-user-password

echo "[quality-gate] Portal account endpoint invariants"
npm run tool:verify-portal-account-endpoint

echo "[quality-gate] KM state invariants"
npm run tool:verify-km-state

echo "[quality-gate] Portal accounts apply invariants"
npm run tool:verify-portal-accounts-apply

echo "[quality-gate] OK"
