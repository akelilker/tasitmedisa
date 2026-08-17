const fs = require('fs');
const assert = require('assert');

const notifications = fs.readFileSync('notifications.js', 'utf8');
const driver = fs.readFileSync('driver/driver_data.php', 'utf8');
const ayarlar = fs.readFileSync('ayarlar.js', 'utf8');

assert.match(notifications, /getK2BelgeGroups\(\)\.forEach/);
assert.match(notifications, /k2GroupId/);
assert.match(notifications, /branchIds: Array\.isArray\(group\.branchIds\)/);
assert.match(notifications, /task\.branchIds\.map\(String\)\.indexOf/);
assert.match(notifications, /settings-k2/);
assert.match(driver, /medisaNormalizeK2BelgeGruplari/);
assert.match(driver, /array_map\('strval',\s*\$candidate\['branchIds'\]/);
assert.doesNotMatch(driver, /\$data\['ayarlar'\]\['k2Belgesi'\]/);
assert.match(ayarlar, /required-documents-branch-list-view/);
assert.match(ayarlar, /settings-card-content/);
assert.doesNotMatch(ayarlar, /select.*VKN|vergiNo/i);
assert.match(ayarlar, /window\.open\('about:blank', '_blank'\)/);
assert.match(ayarlar, /blankTab\.location\.href = targetUrl/);
assert.match(ayarlar, /window\.location\.href = targetUrl/);
assert.doesNotMatch(ayarlar, /window\.open\('about:blank', '_blank'\).*noopener|window\.open\('about:blank', '_blank'\).*noreferrer/);
assert.equal((ayarlar.match(/window\.open\('about:blank', '_blank'\)/g) || []).length, 1);

const group = { id: 'g1', branchIds: ['a', 'b'], expiryDate: '2027-05-17' };
const tasks = [group].map((item) => ({
  k2GroupId: item.id,
  branchIds: item.branchIds.slice(),
  date: item.expiryDate,
}));
assert.equal(tasks.length, 1);
assert.equal(tasks[0].k2GroupId, 'g1');
assert.equal(tasks.filter((task) => task.branchIds.includes('a')).length, 1);
assert.equal(tasks.filter((task) => task.branchIds.includes('b')).length, 1);
assert.equal(tasks.filter((task) => task.branchIds.includes('c')).length, 0);
assert.notEqual('date|settings-k2|g1|2027-05-17', 'date|settings-k2|g2|2027-05-17');

console.log('PASS: K2 notification, monthly filter and driver/UI scope invariants');
