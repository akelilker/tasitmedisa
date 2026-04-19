#!/usr/bin/env bash
# CI only: php built-in server must already be running (see pr-check.yml).
# Uygulama koduna dokunulmaz; yalnızca 200 + hafif içerik işareti doğrulanır.
set -euo pipefail

BASE="${BASE_URL:-http://127.0.0.1:8888}"

code=$(curl -sS -o /tmp/smoke_root.html -w "%{http_code}" "${BASE}/")
if [ "$code" != "200" ]; then
  echo "::error::GET / returned HTTP $code"
  exit 1
fi
if ! grep -qE 'TAŞIT|Taşıt|content-wrap' /tmp/smoke_root.html; then
  echo "::error::GET / body missing expected marker (title/layout)"
  exit 1
fi
echo "OK GET / HTTP 200 (content marker)"

for path in "/index.html" "/admin/driver-report.html" "/driver/index.html"; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" "${BASE}${path}")
  if [ "$code" != "200" ]; then
    echo "::error::GET ${path} returned HTTP $code"
    exit 1
  fi
  echo "OK GET ${path} HTTP 200"
done
