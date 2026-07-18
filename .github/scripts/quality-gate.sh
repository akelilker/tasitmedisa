#!/usr/bin/env bash
# Local/CI quality gate — recovery R1–R6 tooling subset.
set -euo pipefail

echo "[quality-gate] Visible store"
npm run tool:verify-visible-store

echo "[quality-gate] Login title fit"
npm run tool:verify-login-title-fit

echo "[quality-gate] Roles"
npm run tool:verify-roles

echo "[quality-gate] Save wire"
npm run tool:verify-save-wire
npm run tool:measure-save-wire

echo "[quality-gate] Kasko lookup"
npm run tool:verify-kasko-lookup || true

echo "[quality-gate] Vehicle render"
npm run tool:verify-vehicle-render
npm run tool:measure-vehicle-render

echo "[quality-gate] Driver lazy module invariants"
npm run tool:verify-driver-lazy

echo "[quality-gate] Driver boot measurement gates"
npm run tool:measure-driver-boot

echo "[quality-gate] Main shell lazy invariants"
npm run tool:verify-main-shell

echo "[quality-gate] Main shell measurement"
npm run tool:measure-main-shell

echo "[quality-gate] OK"
