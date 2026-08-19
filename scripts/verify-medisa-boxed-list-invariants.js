const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
let passed = 0;
let failed = 0;

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function check(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`PASS ${message}`);
  } else {
    failed += 1;
    console.error(`FAIL ${message}`);
  }
}

const core = read('script-core.js');
const settings = read('ayarlar.js');
const vehicles = read('tasitlar.js');
const styleCore = read('style-core.css');
const featureCss = [
  read('ayarlar.css'),
  read('kayit.css'),
  read('tasitlar-base.css'),
  read('driver/driver-shell.css'),
  read('driver/driver-features.css')
].join('\n');
const sourceFiles = {
  settings: read('ayarlar.js'),
  record: read('kayit.js'),
  vehicles: read('tasitlar.js'),
  driverDashboard: read('driver/dashboard.html'),
  driverCore: read('driver/driver-dashboard-core.js'),
  driverFeedback: read('driver/driver-feature-feedback.js'),
  driverHistory: read('driver/driver-feature-history.js')
};
const canonicalTriggerBlock =
  (styleCore.match(/\.medisa-boxed-select-trigger\s*\{([^}]*)\}/) || [])[1] || '';
const mobileUserEditGeometryBlock =
  (styleCore.match(/@media\s*\(max-width:\s*768px\)\s*\{[\s\S]*?#user-form-modal\s+\.medisa-boxed-select-trigger\.form-input:not\(select\)\s*\{([^}]*)\}/) || [])[1] || '';

check(
  /window\.MedisaOwnerSelect\s*=\s*\{/.test(core) &&
  /\bensure:\s*ensure\b/.test(core) &&
  /\brefresh:\s*refresh\b/.test(core) &&
  /\bopen:\s*open\b/.test(core) &&
  /\bclose:\s*close\b/.test(core) &&
  /\bposition:\s*position\b/.test(core),
  'shared owner exposes the complete generic select lifecycle'
);

check(
  !/function\s+(ensure|refresh|open|close|position)\w*CustomSelect/.test(settings) &&
  !/activeUserFormCustomSelect/.test(settings) &&
  !/\.querySelector\(['"]\.medisa-owner-select-/.test(settings),
  'ayarlar.js contains no generic select engine or instance state'
);

const userFormVehicleStateContract =
  /\b(?:let|const|var)\s+userFormSelectedVehicleIds\s*=\s*\[\s*\]/.test(settings) &&
  /function\s+getUserFormSelectedVehicleIds\s*\(\)[\s\S]*?return\s+userFormSelectedVehicleIds\.slice\(\)/.test(settings) &&
  /function\s+setUserFormSelectedVehicleIds\s*\([\s\S]*?Array\.from\(new Set\([\s\S]*?\.trim\(\)/.test(settings) &&
  /function\s+populateUserVehiclesMulti[\s\S]*?getUserFormSelectedVehicleIds\(\)/.test(settings) &&
  /function\s+openUserFormModal[\s\S]*?setUserFormSelectedVehicleIds\(/.test(settings) &&
  /function\s+saveUser[\s\S]*?getUserFormSelectedVehicleIds\(\)/.test(settings);
check(
  userFormVehicleStateContract,
  'ayarlar.js owns user-form vehicle selection state and its business-flow callers'
);

check(
  !/function\s+(refresh|open|position|filter|normalize)\w*DynamicModalCustomSelect/.test(vehicles) &&
  !/activeDynamicModalCustomSelect/.test(vehicles) &&
  !/\.querySelector\(['"]\.medisa-owner-select-/.test(vehicles),
  'tasitlar.js contains no generic select engine or instance state'
);

check(
  /padding:\s*8px 12px/.test(canonicalTriggerBlock) &&
  /box-sizing:\s*border-box/.test(canonicalTriggerBlock) &&
  /border-radius:\s*8px/.test(canonicalTriggerBlock) &&
  !/(?:^|;)\s*(?:height|min-height|max-height)\s*:/.test(canonicalTriggerBlock) &&
  /height:\s*36px\s*!important/.test(mobileUserEditGeometryBlock) &&
  /min-height:\s*36px\s*!important/.test(mobileUserEditGeometryBlock) &&
  /max-height:\s*36px\s*!important/.test(mobileUserEditGeometryBlock) &&
  /box-sizing:\s*border-box/.test(mobileUserEditGeometryBlock) &&
  /\.medisa-boxed-select-menu[\s\S]*?max-height:\s*260px[\s\S]*?padding:\s*2px 10px/.test(styleCore) &&
  /\.medisa-boxed-select-option[\s\S]*?min-height:\s*38px[\s\S]*?border-radius:\s*6px/.test(styleCore),
  'canonical trigger geometry is natural globally and fixed only for mobile user edit'
);

const settingsCss = read('ayarlar.css');
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

check(
  !/\.medisa-boxed-select-(?:trigger|menu|option)[^{]*\{[^}]*\b(?:background|border|border-radius|padding|min-height|transition)\s*:/.test(featureCss),
  'feature CSS does not redefine boxed-select canonical base skin'
);

check(
  !/driver-plate-dropdown-item:nth-child|history-vehicle-option:nth-child|vehicle-branch-option:nth-child/.test(featureCss) &&
  !/driver-plate-dropdown-item\[aria-selected="true"\]\s*\{[^}]*background:\s*rgba\(var\(--theme-color-rgb\)/.test(featureCss),
  'legacy connected-row and selected-fill skins are absent'
);

const targetContracts = [
  ['01 Required Documents branch', /required-k2-members-(?:trigger|menu|option)/.test(sourceFiles.settings)],
  ['02 Record branch', /vehicle-branch-select[\s\S]*?medisa-boxed-select-native/.test(sourceFiles.record)],
  ['03 User edit branch', /user-branch[\s\S]*?MedisaOwnerSelect\.ensure/.test(sourceFiles.settings)],
  ['04 User edit role', /user-role[\s\S]*?MedisaOwnerSelect\.ensure/.test(sourceFiles.settings)],
  ['05 User edit assigned vehicles', /user-vehicles-(?:trigger|dropdown|search)[\s\S]*?medisa-boxed-select/.test(sourceFiles.settings)],
  ['06 Vehicle user assignment', /ensureDynamicModalCustomSelect[\s\S]*?Kullanıcı Seçiniz/.test(sourceFiles.vehicles)],
  ['07 Vehicle branch change', /openEventModal\('sube'[\s\S]*?ensureDynamicModalCustomSelect[\s\S]*?Şube Seçiniz/.test(sourceFiles.vehicles)],
  ['08 Driver vehicle selector', /driver-plate-dropdown[\s\S]*?medisa-boxed-select-(?:menu|option)/.test(sourceFiles.driverDashboard + sourceFiles.driverCore)],
  ['09 Driver feedback type', /driver-feedback-type[\s\S]*?medisa-boxed-select-(?:native|trigger|menu)/.test(sourceFiles.driverDashboard + sourceFiles.driverFeedback)],
  ['10 Driver history vehicle', /history-vehicle-(?:trigger|dropdown)[\s\S]*?medisa-boxed-select/.test(sourceFiles.driverDashboard + sourceFiles.driverHistory)]
];
targetContracts.forEach(([label, passedContract]) => {
  check(passedContract, `${label} consumes the canonical boxed-list contract`);
});

const shellFiles = ['index.html', 'driver/index.html', 'driver/dashboard.html', 'admin/driver-report.html'];
const stylePins = shellFiles.map(file => {
  const match = read(file).match(/style-core\.css\?v=([^"' ]+)/);
  return match && match[1];
});
const scriptPins = shellFiles.map(file => {
  const match = read(file).match(/script-core\.js\?v=([^"' ]+)/);
  return match && match[1];
});
const expectedStylePin = stylePins[0];
const expectedScriptPin = scriptPins[0];
const serviceWorkerStylePin = (read('sw.js').match(/\/style-core\.css\?v=([^']+)/) || [])[1];
check(new Set(stylePins).size === 1 && Boolean(expectedStylePin), 'shared style-core asset pins are in parity');
check(new Set(scriptPins).size === 1 && Boolean(expectedScriptPin), 'shared script-core asset pins are in parity');
check(serviceWorkerStylePin === expectedStylePin, 'service worker style-core pin matches shell assets');

console.log(`\nverify-medisa-boxed-list-invariants: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
