'use strict';

const store = require('../src/store');
const repo = require('../src/repo');

const t0 = Date.now();
store.init();
const db = store.db();
console.log('init ms:', Date.now() - t0);
console.log('users:', db.users.length, 'namespaces:', db.namespaces.length,
  'packages:', db.packages.length, 'versions:', db.versions.length,
  'artifacts:', db.versions.reduce((s, v) => s + v.artifacts.length, 0),
  'audits:', db.audits.length);

const admin = db.users[0];
const list = repo.listPackages(admin, {});
console.log('visible packages:', list.length);
console.log('sample:', list.slice(0, 4).map((p) => `${p.fullName}@${p.version} dl=${p.downloads}`).join(' | '));

const info = repo.packageInfo(admin, 'global', 'armory-cli');
console.log('detail versions:', info.versions.map((v) => v.version).join(','));
console.log('dependents of zlib:', JSON.stringify(repo.findDependents(repo.getPackage('sylixos-middleware', 'zlib'))));

const stats = repo.statsOverview(admin);
console.log('totals:', JSON.stringify(stats.totals));
console.log('trend:', stats.trend.map((t) => `${t.day.slice(5)}:${t.count}`).join(' '));
console.log('platform:', JSON.stringify(stats.platformCount));

// 下载解析
const r = repo.resolveArtifact(admin, 'global', 'armory-cli', null, 'linux', 'x86_64');
console.log('resolve:', r.version.version, r.artifact.filename, r.artifact.size, 'B');
store.flush();
