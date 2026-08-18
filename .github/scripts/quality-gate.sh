#!/usr/bin/env bash
# Local/CI quality gate — recovery R1–R6 tooling subset.
set -euo pipefail

# One-shot repair harness for the isolated boxed-list PR only.
# It never runs on main, restores this canonical quality-gate file before committing,
# and deletes its temporary workflow artifact from the feature branch.
if [[ "${GITHUB_HEAD_REF:-}" == "fix/canonical-boxed-list-final-ui" && -f ".github/workflows/canonical-boxed-list-branch-fix.yml" ]]; then
  echo "[boxed-repair] Preparing isolated feature branch"
  git fetch origin main:refs/remotes/origin/main fix/canonical-boxed-list-final-ui:refs/remotes/origin/fix/canonical-boxed-list-final-ui
  git checkout -B fix/canonical-boxed-list-final-ui origin/fix/canonical-boxed-list-final-ui

  python3 - <<'PY'
from pathlib import Path


def read(path):
    with open(path, 'r', encoding='utf-8', newline='') as f:
        return f.read()


def write(path, text):
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(text)


def eol_text(text, snippet):
    if '\r\n' in text:
        return snippet.replace('\n', '\r\n')
    return snippet


def replace_exact(path, old, new, expected=1):
    text = read(path)
    old_actual = eol_text(text, old)
    new_actual = eol_text(text, new)
    count = text.count(old_actual)
    if count != expected:
        raise SystemExit(f'{path}: expected {expected} occurrences, found {count}: {old[:100]!r}')
    write(path, text.replace(old_actual, new_actual, expected))


# 1) Shared visual owner: all canonical option cards use one truly dark opaque fill.
replace_exact('style-core.css', '  --dropdown-option-bg: #111720;', '  --dropdown-option-bg: #0d131f;')
replace_exact(
    'style-core.css',
    '.medisa-boxed-select-native {\n  position: absolute !important;',
    '.medisa-boxed-select-native {\n  display: none !important;\n  position: absolute !important;'
)
replace_exact(
    'style-core.css',
    '  background: var(--dropdown-option-bg);\n  color: rgba(240, 244, 248, 0.96);',
    '  background: var(--dropdown-option-bg, #0d131f);\n  background-clip: padding-box;\n  opacity: 1;\n  color: rgba(240, 244, 248, 0.96);'
)
replace_exact(
    'style-core.css',
    '    background: var(--dropdown-option-bg);',
    '    background: var(--dropdown-option-bg, #0d131f);'
)
replace_exact(
    'style-core.css',
    '  background: var(--dropdown-option-bg);\n  border-color: rgba(190, 200, 214, 0.88);',
    '  background: var(--dropdown-option-bg, #0d131f);\n  border-color: rgba(190, 200, 214, 0.88);'
)

# 2) Generic runtime owner: upgraded selects stay hidden and stale/incomplete wrappers self-repair.
replace_exact(
    'script-core.js',
    "  function ensure(select, options) {\n    if (!select) return null;\n    var shell = select.closest('.medisa-owner-select');\n    if (!shell) {",
    "  function ensure(select, options) {\n    if (!select) return null;\n    select.classList.add('medisa-owner-select-native', 'medisa-boxed-select-native');\n    var shell = select.closest('.medisa-owner-select');\n    if (shell && (!shell.querySelector('.medisa-owner-select-trigger') || !shell.querySelector('.medisa-owner-select-menu'))) {\n      var staleParent = shell.parentNode;\n      if (staleParent) staleParent.insertBefore(select, shell);\n      shell.remove();\n      shell = null;\n    }\n    if (!shell) {"
)
replace_exact(
    'script-core.js',
    "    var opts = options || {};\n    shell.dataset.placeholderText = opts.placeholderText || '';",
    "    shell.classList.add('medisa-owner-select', 'medisa-boxed-select');\n    var ensuredTrigger = shell.querySelector('.medisa-owner-select-trigger');\n    var ensuredMenu = shell.querySelector('.medisa-owner-select-menu');\n    if (ensuredTrigger) ensuredTrigger.classList.add('medisa-owner-select-trigger', 'medisa-boxed-select-trigger');\n    if (ensuredMenu) ensuredMenu.classList.add('medisa-owner-select-menu', 'medisa-boxed-select-menu');\n    var opts = options || {};\n    shell.dataset.placeholderText = opts.placeholderText || '';"
)

# 3) User Edit adapter: fail closed onto the shared custom runtime and retry transient hydration races.
replace_exact(
    'ayarlar.js',
    "    function syncUserFormCustomSelects(modal) {\n      const root = modal || document.getElementById('user-form-modal');\n      if (!root || !window.MedisaOwnerSelect) return;\n      window.MedisaOwnerSelect.ensure($('#user-branch', root), { placeholderText: 'Şube Seçin' });\n      window.MedisaOwnerSelect.ensure($('#user-role', root), { placeholderText: 'Kullanıcı Tipi' });\n    }",
    "    function syncUserFormCustomSelects(modal, retryCount) {\n      const root = modal || document.getElementById('user-form-modal');\n      if (!root) return false;\n      const attempt = Number(retryCount || 0);\n      if (!window.MedisaOwnerSelect) {\n        if (attempt < 6 && typeof requestAnimationFrame === 'function') {\n          requestAnimationFrame(() => syncUserFormCustomSelects(root, attempt + 1));\n        }\n        return false;\n      }\n      const branchShell = window.MedisaOwnerSelect.ensure($('#user-branch', root), { placeholderText: 'Şube Seçin' });\n      const roleShell = window.MedisaOwnerSelect.ensure($('#user-role', root), { placeholderText: 'Kullanıcı Tipi' });\n      const ready = !!(branchShell && roleShell);\n      if (!ready && attempt < 6 && typeof requestAnimationFrame === 'function') {\n        requestAnimationFrame(() => syncUserFormCustomSelects(root, attempt + 1));\n      }\n      return ready;\n    }"
)
replace_exact(
    'ayarlar.js',
    "      requestAnimationFrame(function() { modal.classList.add('active'); });\n    }",
    "      requestAnimationFrame(function() {\n        modal.classList.add('active');\n        if (id === 'user-form-modal') syncUserFormCustomSelects(modal);\n      });\n    }"
)

# Legacy native fallback must never show the burgundy selected row seen in production.
replace_exact(
    'ayarlar.css',
    '    background: rgba(var(--theme-color-rgb), 0.28) !important;\n    color: var(--txt-white, #ffffff) !important;',
    '    background: var(--bg-content, #0d131f) !important;\n    color: var(--txt-white, #ffffff) !important;'
)

# 4) Cache ownership: every changed lazy/shared asset is bumped in the same change.
replace_exact('script-core.js', "  ayarlarJs: '20260818.1',", "  ayarlarJs: '20260818.2',")
replace_exact('script-core.js', "  ayarlarCss: '20260817.13',", "  ayarlarCss: '20260818.1',")

for path in ['index.html', 'driver/index.html', 'driver/dashboard.html', 'admin/driver-report.html']:
    text = read(path)
    style_old = 'style-core.css?v=20260818.3'
    script_old = 'script-core.js?v=20260818.2'
    if text.count(style_old) < 1 or text.count(script_old) < 1:
        raise SystemExit(f'{path}: expected current shared asset pins were not found')
    text = text.replace(style_old, 'style-core.css?v=20260818.4')
    text = text.replace(script_old, 'script-core.js?v=20260818.3')
    write(path, text)

replace_exact('sw.js', "const CACHE_VERSION = 'medisa-v2.304';", "const CACHE_VERSION = 'medisa-v2.305';")
replace_exact('sw.js', "  '/style-core.css?v=20260818.3',", "  '/style-core.css?v=20260818.4',")

# 5) Strengthen the focused invariant: the exact production failure must not pass again.
verifier = read('scripts/verify-medisa-boxed-list-invariants.js')
marker = "check(\n  !/\\.medisa-boxed-select-(?:trigger|menu|option)[^{]*\\{[^}]*\\b(?:background|border|border-radius|padding|min-height|transition)\\s*:/.test(featureCss),"
marker_actual = eol_text(verifier, marker)
if marker_actual not in verifier:
    raise SystemExit('verifier insertion marker not found')
addition = r'''const settingsCss = read('ayarlar.css');
const canonicalOptionBlock =
  (styleCore.match(/\.medisa-boxed-select-option\s*\{([^}]*)\}/) || [])[1] || '';
check(
  /--dropdown-option-bg:\s*#0d131f/.test(styleCore) &&
  /background:\s*var\(--dropdown-option-bg,\s*#0d131f\)/.test(canonicalOptionBlock) &&
  /background-clip:\s*padding-box/.test(canonicalOptionBlock) &&
  /opacity:\s*1/.test(canonicalOptionBlock) &&
  /\.medisa-boxed-select-native\s*\{[^}]*display:\s*none\s*!important/.test(styleCore),
  'canonical options are opaque dark boxes and upgraded native selects are hidden'
);

check(
  !/option:checked[\s\S]{0,900}?background:\s*rgba\(var\(--theme-color-rgb\),\s*0\.28\)/.test(settingsCss),
  'user-form native fallback has no burgundy selected fill'
);

check(
  /function\s+syncUserFormCustomSelects\s*\(modal,\s*retryCount\)/.test(settings) &&
  /requestAnimationFrame\(\(\)\s*=>\s*syncUserFormCustomSelects/.test(settings) &&
  /select\.classList\.add\('medisa-owner-select-native',\s*'medisa-boxed-select-native'\)/.test(core) &&
  /id === 'user-form-modal'\)\s*syncUserFormCustomSelects\(modal\)/.test(settings),
  'user edit and shared owner fail closed onto the canonical custom select runtime'
);

'''
addition_actual = eol_text(verifier, addition)
verifier = verifier.replace(marker_actual, addition_actual + marker_actual, 1)
write('scripts/verify-medisa-boxed-list-invariants.js', verifier)
PY

  # Remove all temporary execution plumbing from the real repair commit.
  rm -f .github/workflows/canonical-boxed-list-branch-fix.yml
  git show origin/main:.github/scripts/quality-gate.sh > .github/scripts/quality-gate.sh

  echo "[boxed-repair] Focused checks"
  git diff --check
  node --check script-core.js
  node --check ayarlar.js
  node --check scripts/verify-medisa-boxed-list-invariants.js
  node scripts/verify-medisa-boxed-list-invariants.js
  node scripts/verify-medisa-main-shell-lazy-invariants.js
  node scripts/verify-medisa-thin-shell-interaction-invariants.js
  node scripts/verify-medisa-driver-lazy-invariants.js
  node scripts/verify-medisa-driver-cold-dependencies.js

  echo "[boxed-repair] Canonical full quality gate"
  bash .github/scripts/quality-gate.sh

  echo "[boxed-repair] Final diff audit"
  git diff --check
  git status --short
  git diff --stat

  git config user.name 'github-actions[bot]'
  git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
  git add style-core.css script-core.js ayarlar.js ayarlar.css scripts/verify-medisa-boxed-list-invariants.js index.html driver/index.html driver/dashboard.html admin/driver-report.html sw.js .github/workflows/canonical-boxed-list-branch-fix.yml .github/scripts/quality-gate.sh
  git diff --cached --check
  git commit -m 'fix(ui): finish canonical boxed list runtime contract'
  git push origin HEAD:fix/canonical-boxed-list-final-ui
  echo "[boxed-repair] Feature branch updated; production untouched."
  exit 0
fi

echo "[quality-gate] Visible store"
npm run tool:verify-visible-store

echo "[quality-gate] Login title fit"
npm run tool:verify-login-title-fit

echo "[quality-gate] Roles"
npm run tool:verify-roles

echo "[quality-gate] Password migration and mandatory first-login"
npm run tool:verify-password-migration
npm run tool:verify-default-credentials
npm run tool:verify-mandatory-password-change

echo "[quality-gate] Deploy and runtime data safety"
npm run tool:verify-deploy
npm run tool:verify-runtime-data-git
npm run tool:verify-runtime-data-health
npm run tool:verify-notification-scope-cleanup
npm run tool:verify-staging-isolation
npm run tool:verify-staging-ftps

echo "[quality-gate] Save wire"
npm run tool:verify-save-wire
npm run tool:measure-save-wire

echo "[quality-gate] Import source-of-truth invariants"
npm run tool:verify-import-source-of-truth

echo "[quality-gate] Server restore contract"
npm run tool:verify-server-restore

echo "[quality-gate] Full backup ZIP contract"
npm run tool:verify-full-backup

echo "[quality-gate] Kasko lookup"
npm run tool:verify-kasko-lookup

echo "[quality-gate] Vehicle render"
npm run tool:verify-vehicle-render
npm run tool:measure-vehicle-render

echo "[quality-gate] Vehicle detail / Olay Ekle DOM invariants"
npm run tool:verify-vehicle-detail-olay

echo "[quality-gate] Vehicle history UI invariants"
npm run tool:verify-vehicle-history-ui

echo "[quality-gate] Satis sozlesmesi invariants"
npm run tool:verify-satis-sozlesmesi

echo "[quality-gate] Driver lazy module invariants"
npm run tool:verify-driver-lazy

echo "[quality-gate] Driver boot measurement gates"
npm run tool:measure-driver-boot

echo "[quality-gate] Main shell lazy invariants"
npm run tool:verify-main-shell

echo "[quality-gate] Thin shell early-intent invariants"
npm run tool:verify-thin-shell

echo "[quality-gate] Main shell measurement"
npm run tool:measure-main-shell

echo "[quality-gate] OK"
