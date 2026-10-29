'use strict';

/**
 * armory.js —— 对齐「翼辉云枢 / Armory」界面所需的数据聚合层
 *
 * 提供四类能力：
 *   1. 平台管理（pms/plats）与架构管理（pms/arch）的增删改查
 *   2. 软件包审核（pms/audit）：扫描中 / 扫描失败队列与审核通过
 *   3. 首页右栏：统计概要、流行库、发现（标签云）
 *   4. 个人中心：我创建的 / 我发布的 / 我关注的
 *   5. 软件包详情聚合：概要、版本、发布物、依赖、被依赖、成员、问题反馈、文件
 *
 * 说明：本模块只做「读聚合 + 少量写」，所有权限校验复用 store / repo 的既有实现。
 */

const store = require('./store');
const repo = require('./repo');
const { HttpError } = require('./util');

/* ------------------------------------------------------------------ *
 * 常量：默认平台与架构（取自 Armory 平台枚举）
 * ------------------------------------------------------------------ */

const DEFAULT_PLATFORMS = [
  { id: 1, name: 'Generic', alias: ['通用'], sylixName: '', sortNum: 10 },
  { id: 2, name: 'Windows', alias: ['win'], sylixName: '', sortNum: 20 },
  { id: 3, name: 'SylixOS', alias: ['sylix'], sylixName: 'sylixos', sortNum: 30 },
  { id: 4, name: 'Linux', alias: ['gnu-linux', 'unix'], sylixName: '', sortNum: 40 },
  { id: 5, name: 'MacOS', alias: ['darwin', 'osx'], sylixName: '', sortNum: 50 },
];

const DEFAULT_ARCHS = [
  { id: 1, name: 'noarch', alias: ['通用'], sylixName: '', ociName: '', sortNum: 10, description: '与架构无关的通用制品' },
  { id: 2, name: 'x86-64', alias: ['x86_64', 'amd64'], sylixName: 'x86-64', ociName: 'amd64', sortNum: 20, description: 'Intel / AMD 64 位' },
  { id: 3, name: 'x86-pentium', alias: ['i686'], sylixName: 'x86-pentium', ociName: '386', sortNum: 30, description: '32 位 x86' },
  { id: 4, name: 'arm64', alias: ['aarch64'], sylixName: 'arm64', ociName: 'arm64', sortNum: 40, description: 'ARM 64 位' },
  { id: 5, name: 'arm64-generic', alias: [], sylixName: 'arm64-generic', ociName: 'arm64', sortNum: 50, description: 'ARM 64 位通用指令集' },
  { id: 6, name: 'arm-v7a', alias: ['armv7'], sylixName: 'arm-v7a', ociName: 'arm/v7', sortNum: 60, description: 'ARMv7 A 系列' },
  { id: 7, name: 'loongarch64', alias: ['loong64'], sylixName: 'loongarch64', ociName: 'loong64', sortNum: 70, description: '龙芯 64 位' },
  { id: 8, name: 'loongarch32', alias: [], sylixName: 'loongarch32', ociName: 'loong32', sortNum: 80, description: '龙芯 32 位' },
  { id: 9, name: 'loongarch64-lasx', alias: [], sylixName: 'loongarch64-lasx', ociName: 'loong64', sortNum: 90, description: '龙芯 64 位 LASX 扩展' },
  { id: 10, name: 'loongarch64-lsx', alias: [], sylixName: 'loongarch64-lsx', ociName: 'loong64', sortNum: 100, description: '龙芯 64 位 LSX 扩展' },
  { id: 11, name: 'mips32', alias: [], sylixName: 'mips32', ociName: 'mips', sortNum: 110, description: 'MIPS 32 位' },
  { id: 12, name: 'mips32-r2', alias: [], sylixName: 'mips32-r2', ociName: 'mips', sortNum: 120, description: 'MIPS32 Release 2' },
  { id: 13, name: 'mips64', alias: [], sylixName: 'mips64', ociName: 'mips64', sortNum: 130, description: 'MIPS 64 位' },
  { id: 14, name: 'mips64-r2', alias: [], sylixName: 'mips64-r2', ociName: 'mips64', sortNum: 140, description: 'MIPS64 Release 2' },
  { id: 15, name: 'mips64-ls3a', alias: [], sylixName: 'mips64-ls3a', ociName: 'mips64', sortNum: 150, description: '龙芯 3A MIPS64' },
  { id: 16, name: 'riscv-gc32', alias: [], sylixName: 'riscv-gc32', ociName: 'riscv32', sortNum: 160, description: 'RISC-V 32 位' },
  { id: 17, name: 'riscv-gc64', alias: [], sylixName: 'riscv-gc64', ociName: 'riscv64', sortNum: 170, description: 'RISC-V 64 位' },
  { id: 18, name: 'ppc-750', alias: [], sylixName: 'ppc-750', ociName: 'ppc64le', sortNum: 180, description: 'PowerPC 750' },
  { id: 19, name: 'ppc-464fp', alias: [], sylixName: 'ppc-464fp', ociName: 'ppc64le', sortNum: 190, description: 'PowerPC 464FP' },
  { id: 20, name: 'ppc-e500v1', alias: [], sylixName: 'ppc-e500v1', ociName: 'ppc64le', sortNum: 200, description: 'PowerPC e500v1' },
  { id: 21, name: 'ppc-e500v2', alias: [], sylixName: 'ppc-e500v2', ociName: 'ppc64le', sortNum: 210, description: 'PowerPC e500v2' },
  { id: 22, name: 'ppc-e6500', alias: [], sylixName: 'ppc-e6500', ociName: 'ppc64le', sortNum: 220, description: 'PowerPC e6500' },
  { id: 23, name: 'sparc-v8', alias: [], sylixName: 'sparc-v8', ociName: 'sparc', sortNum: 230, description: 'SPARC V8' },
  { id: 24, name: 'sparc-v9', alias: [], sylixName: 'sparc-v9', ociName: 'sparc', sortNum: 240, description: 'SPARC V9' },
  { id: 25, name: 'sparc-leon3', alias: [], sylixName: 'sparc-leon3', ociName: 'sparc', sortNum: 250, description: 'LEON3' },
  { id: 26, name: 'arm-920t', alias: [], sylixName: 'arm-920t', ociName: 'arm', sortNum: 260, description: 'ARM920T' },
  { id: 27, name: 'arm-r5', alias: [], sylixName: 'arm-r5', ociName: 'arm', sortNum: 270, description: 'Cortex-R5' },
  { id: 28, name: 'csky-ck803', alias: [], sylixName: 'csky-ck803', ociName: 'csky', sortNum: 280, description: 'CK803' },
  { id: 29, name: 'csky-ck807', alias: [], sylixName: 'csky-ck807', ociName: 'csky', sortNum: 290, description: 'CK807' },
  { id: 30, name: 'csky-ck810', alias: [], sylixName: 'csky-ck810', ociName: 'csky', sortNum: 300, description: 'CK810' },
  { id: 31, name: 'csky-ck860', alias: [], sylixName: 'csky-ck860', ociName: 'csky', sortNum: 310, description: 'CK860' },
  { id: 32, name: 'sw6b', alias: [], sylixName: 'sw6b', ociName: 'sw6b', sortNum: 320, description: '申威 SW6B' },
  { id: 33, name: 'ti-c6000', alias: [], sylixName: 'ti-c6000', ociName: 'c6000', sortNum: 330, description: 'TI C6000 DSP' },
];

/* ------------------------------------------------------------------ *
 * 集合懒初始化
 * ------------------------------------------------------------------ */

function ensure() {
  const d = store.db();
  if (!Array.isArray(d.platforms)) {
    d.platforms = DEFAULT_PLATFORMS.map((p) => ({ ...p, createTime: now() }));
    d.counters.platforms = d.platforms.length;
    store.persist();
  }
  if (!Array.isArray(d.archs)) {
    d.archs = DEFAULT_ARCHS.map((a) => ({ ...a, createTime: now() }));
    d.counters.archs = d.archs.length;
    store.persist();
  }
  if (!Array.isArray(d.issues)) {
    d.issues = buildIssues();
    d.counters.issues = d.issues.length;
    store.persist();
  }
  return d;
}

function now() {
  const t = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}:${p(t.getSeconds())}`;
}

function toTagList(input, max = 32) {
  if (Array.isArray(input)) return input.map((v) => String(v).trim()).filter(Boolean).slice(0, 20);
  return String(input || '')
    .split(/[,，\s]+/)
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((v) => v.slice(0, max));
}

/* ------------------------------------------------------------------ *
 * 平台管理
 * ------------------------------------------------------------------ */

function listPlatforms() {
  const d = ensure();
  return [...d.platforms].sort((a, b) => (a.sortNum || 9999) - (b.sortNum || 9999) || a.id - b.id);
}

function createPlatform({ name, alias, sortNum }) {
  const d = ensure();
  const n = String(name || '').trim();
  if (!n) throw new HttpError(400, '请输入平台名称', 'INVALID_NAME');
  if (n.length > 20) throw new HttpError(400, '平台名称不能超过 20 个字符', 'INVALID_NAME');
  if (d.platforms.some((p) => p.name.toLowerCase() === n.toLowerCase())) {
    throw new HttpError(400, `平台「${n}」已存在`, 'DUPLICATE_NAME');
  }
  const row = {
    id: store.nextId('platforms'),
    name: n,
    alias: toTagList(alias),
    sortNum: Number(sortNum) > 0 ? Number(sortNum) : 9999,
    createTime: now(),
  };
  d.platforms.push(row);
  store.persist();
  return row;
}

function updatePlatform(id, patch) {
  const d = ensure();
  const row = d.platforms.find((p) => p.id === Number(id));
  if (!row) throw new HttpError(404, '平台不存在', 'NOT_FOUND');
  if (patch.name !== undefined) {
    const n = String(patch.name).trim();
    if (!n) throw new HttpError(400, '请输入平台名称', 'INVALID_NAME');
    if (n.length > 20) throw new HttpError(400, '平台名称不能超过 20 个字符', 'INVALID_NAME');
    if (d.platforms.some((p) => p.id !== row.id && p.name.toLowerCase() === n.toLowerCase())) {
      throw new HttpError(400, `平台「${n}」已存在`, 'DUPLICATE_NAME');
    }
    row.name = n;
  }
  if (patch.alias !== undefined) row.alias = toTagList(patch.alias);
  if (patch.sortNum !== undefined) row.sortNum = Number(patch.sortNum) > 0 ? Number(patch.sortNum) : 9999;
  store.persist();
  return row;
}

function deletePlatform(id) {
  const d = ensure();
  const idx = d.platforms.findIndex((p) => p.id === Number(id));
  if (idx < 0) throw new HttpError(404, '平台不存在', 'NOT_FOUND');
  const [row] = d.platforms.splice(idx, 1);
  store.persist();
  return row;
}

/* ------------------------------------------------------------------ *
 * 架构管理
 * ------------------------------------------------------------------ */

function listArchs() {
  const d = ensure();
  return [...d.archs].sort((a, b) => (a.sortNum || 9999) - (b.sortNum || 9999) || a.id - b.id);
}

function createArch({ name, alias, sylixName, ociName, sortNum, description }) {
  const d = ensure();
  const n = String(name || '').trim();
  if (!n) throw new HttpError(400, '请输入架构名称', 'INVALID_NAME');
  if (n.length > 32) throw new HttpError(400, '架构名称不能超过 32 个字符', 'INVALID_NAME');
  if (d.archs.some((a) => a.name.toLowerCase() === n.toLowerCase())) {
    throw new HttpError(400, `架构「${n}」已存在`, 'DUPLICATE_NAME');
  }
  const row = {
    id: store.nextId('archs'),
    name: n,
    alias: toTagList(alias),
    sylixName: String(sylixName || '').trim(),
    ociName: String(ociName || '').trim(),
    sortNum: Number(sortNum) > 0 ? Number(sortNum) : 9999,
    description: String(description || '').slice(0, 256),
    createTime: now(),
  };
  d.archs.push(row);
  store.persist();
  return row;
}

function updateArch(id, patch) {
  const d = ensure();
  const row = d.archs.find((a) => a.id === Number(id));
  if (!row) throw new HttpError(404, '架构不存在', 'NOT_FOUND');
  if (patch.name !== undefined) {
    const n = String(patch.name).trim();
    if (!n) throw new HttpError(400, '请输入架构名称', 'INVALID_NAME');
    if (d.archs.some((a) => a.id !== row.id && a.name.toLowerCase() === n.toLowerCase())) {
      throw new HttpError(400, `架构「${n}」已存在`, 'DUPLICATE_NAME');
    }
    row.name = n;
  }
  if (patch.alias !== undefined) row.alias = toTagList(patch.alias);
  if (patch.sylixName !== undefined) row.sylixName = String(patch.sylixName || '').trim();
  if (patch.ociName !== undefined) row.ociName = String(patch.ociName || '').trim();
  if (patch.sortNum !== undefined) row.sortNum = Number(patch.sortNum) > 0 ? Number(patch.sortNum) : 9999;
  if (patch.description !== undefined) row.description = String(patch.description || '').slice(0, 256);
  store.persist();
  return row;
}

function deleteArch(id) {
  const d = ensure();
  const idx = d.archs.findIndex((a) => a.id === Number(id));
  if (idx < 0) throw new HttpError(404, '架构不存在', 'NOT_FOUND');
  const [row] = d.archs.splice(idx, 1);
  store.persist();
  return row;
}

/* ------------------------------------------------------------------ *
 * 软件包审核
 * ------------------------------------------------------------------ */

const SCAN_FAIL_REASONS = [
  'armory.json 解析失败：dependencies 字段不是合法的数组',
  '制品校验和不匹配：上传分片在传输过程中损坏',
  '版本号不符合语义化版本规范',
  '同版本同平台架构的制品已存在，禁止重复发布',
];

function auditList({ keyword = '', status = '' } = {}) {
  const d = ensure();
  const kw = String(keyword || '').trim().toLowerCase();
  const rows = [];
  for (const pkg of repo.allPackages()) {
    for (const v of repo.packageVersions(pkg)) {
      const scanState = v.scanStatus || (v.status === 'PENDING' ? 'SCANNING' : null);
      if (!scanState) continue;
      const user = store.findUserById(v.createUserId) || {};
      rows.push({
        id: `${pkg.namespace}/${pkg.name}/${v.version}`,
        namespace: pkg.namespace,
        name: pkg.name,
        version: v.version,
        fullName: `@${pkg.namespace}/${pkg.name}/${v.version}`,
        status: scanState,
        scanResult: scanState === 'SCANNING_FAILED' ? v.scanResult || SCAN_FAIL_REASONS[pkg.id % SCAN_FAIL_REASONS.length] : '',
        userName: user.username || '-',
        realName: user.realName || '',
        hue: user.hue || 220,
        publishTime: v.publishTime || v.createTime,
      });
    }
  }
  // 补充演示用扫描记录：把 PENDING 版本之外的若干版本标记为扫描失败样本，保证页面有内容
  if (!rows.some((r) => r.status === 'SCANNING_FAILED')) {
    for (const pkg of repo.allPackages().slice(0, 3)) {
      const vs = repo.packageVersions(pkg);
      if (!vs.length) continue;
      const v = vs[vs.length - 1];
      const user = store.findUserById(v.createUserId) || {};
      rows.push({
        id: `${pkg.namespace}/${pkg.name}/${v.version}`,
        namespace: pkg.namespace,
        name: pkg.name,
        version: v.version,
        fullName: `@${pkg.namespace}/${pkg.name}/${v.version}`,
        status: 'SCANNING_FAILED',
        scanResult: SCAN_FAIL_REASONS[pkg.id % SCAN_FAIL_REASONS.length],
        userName: user.username || '-',
        realName: user.realName || '',
        hue: user.hue || 220,
        publishTime: v.publishTime || v.createTime,
      });
    }
  }
  let list = rows;
  if (kw) list = list.filter((r) => r.fullName.toLowerCase().includes(kw));
  if (status) list = list.filter((r) => r.status === status);
  list.sort((a, b) => String(b.publishTime).localeCompare(String(a.publishTime)));
  return list;
}

function approveVersion(user, namespace, name, version) {
  const pkg = repo.getPackage(namespace, name);
  if (!pkg) throw new HttpError(404, '软件包不存在', 'NOT_FOUND');
  const v = repo.packageVersions(pkg).find((x) => x.version === version);
  if (v) {
    v.scanStatus = null;
    v.scanResult = '';
    const ns = store.getNamespace(namespace);
    const needConfirm = !!(ns && ns.settings && ns.settings.publishConfirmation);
    if (needConfirm && v.status === 'PENDING') {
      store.persist();
      return { status: 'PENDING', message: '审核已通过，等待发布人确认发布' };
    }
    v.status = 'PUBLISHED';
    v.publishTime = v.publishTime || now();
    store.persist();
  }
  store.audit(user, 'CONFIRM_PUBLISH', 'PACKAGE', `@${namespace}/${name}/${version}`, '软件包审核通过');
  return { status: 'PUBLISHED', message: '审核通过' };
}

/* ------------------------------------------------------------------ *
 * 首页右栏：统计 / 流行库 / 发现
 * ------------------------------------------------------------------ */

function downloadStats(user) {
  const pkgs = repo.allPackages().filter((p) => repo.canSeePackage(user, p));
  const ids = new Set(pkgs.map((p) => p.id));
  const versions = repo.allVersions().filter((v) => ids.has(v.packageId));
  let total = 0;
  let week = 0;
  let month = 0;
  const nowMs = Date.now();
  for (const v of versions) {
    for (const a of v.artifacts || []) {
      const n = a.downloads || 0;
      total += n;
      const t = Date.parse(String(a.uploadTime || v.createTime || '').replace(/-/g, '/'));
      if (!Number.isNaN(t)) {
        const days = (nowMs - t) / 86400000;
        if (days <= 7) week += n;
        if (days <= 30) month += n;
      }
    }
  }
  if (!week) week = Math.round(total * 0.28);
  if (!month) month = Math.round(total * 0.52);
  return {
    packages: pkgs.length,
    downloadsLastWeek: week,
    downloadsLastMonth: month,
    downloadsTotal: total,
  };
}

function discover(user, limit = 8) {
  const counter = new Map();
  for (const p of repo.allPackages()) {
    if (!repo.canSeePackage(user, p)) continue;
    for (const t of p.tags || []) counter.set(t, (counter.get(t) || 0) + 1);
  }
  return [...counter.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.length - b.name.length || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function popular(user, limit = 6) {
  return repo
    .listPackages(user, {})
    .map((p) => repo.packageSummary(p))
    .sort((a, b) => b.downloads - a.downloads)
    .slice(0, limit);
}

/* ------------------------------------------------------------------ *
 * 个人中心
 * ------------------------------------------------------------------ */

function myOverview(user) {
  const pkgs = repo.allPackages().filter((p) => repo.canSeePackage(user, p));
  const created = pkgs.filter((p) => p.createUserId === user.id);
  const published = pkgs.filter((p) => repo.packageVersions(p).some((v) => v.createUserId === user.id));
  const watched = pkgs.filter((p) => (p.watchers || []).includes(user.id));
  const ns = store.listNamespaces(user, { scope: 'mine', namespaceType: 'USER' });
  const personal = ns.find((n) => n.type === 'USER') || ns[0] || null;
  return {
    user: store.publicUser(user),
    namespace: personal ? personal.namespaceId : '',
    createdCount: created.length,
    publishedCount: published.length,
    watchCount: watched.length,
  };
}

function myPackages(user, scope = 'created') {
  const pkgs = repo.allPackages().filter((p) => repo.canSeePackage(user, p));
  let list;
  if (scope === 'published') {
    list = pkgs.filter((p) => repo.packageVersions(p).some((v) => v.createUserId === user.id));
  } else {
    list = pkgs.filter((p) => p.createUserId === user.id);
  }
  return list.map((p) => repo.packageSummary(p));
}

function myWatches(user) {
  return repo
    .allPackages()
    .filter((p) => repo.canSeePackage(user, p) && (p.watchers || []).includes(user.id))
    .map((p) => ({
      pkId: p.id,
      packageName: p.name,
      packageNamespace: p.namespace,
      watchMode: p.watchMode || 'ALL_EVENTS',
      customEvents: p.customEvents || [],
    }));
}

/* ------------------------------------------------------------------ *
 * 软件包详情聚合
 * ------------------------------------------------------------------ */

function userBrief(id) {
  const u = store.findUserById(id);
  if (!u) return null;
  return { id: u.id, username: u.username, realName: u.realName, hue: u.hue };
}

function humanSize(bytes) {
  const n = Number(bytes) || 0;
  if (n <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

function buildIssues() {
  const pkgs = store.db().packages || [];
  const seeds = [
    {
      title: '在 SylixOS 5.0 上安装后找不到 libfii.so 依赖',
      body: '按照 Readme 的安装步骤执行后，运行时提示无法加载动态库，检查后发现 libfii.so 未被打包进制品。',
      platform: 'SylixOS',
      arch: 'arm-v7a',
      contact: 'zhangwei@example.com',
      status: 'OPEN',
      comments: [
        { username: 'fanwenting', realName: '范文婷', body: '已经定位到打包脚本遗漏了 lib 目录，下一个补丁版本修复。' },
      ],
    },
    {
      title: 'armory.json 中 dependencies 的 scope 建议支持 optional',
      body: '目前只支持 runtime 与 build，部分插件型依赖需要 optional 语义。',
      platform: 'Generic',
      arch: 'noarch',
      contact: '',
      status: 'CLOSED',
      comments: [
        { username: 'admin', realName: '管理员', body: '已记录需求，纳入下个迭代评估。' },
        { username: 'fanwenting', realName: '范文婷', body: '收到，感谢反馈。' },
      ],
    },
  ];
  const out = [];
  let id = 0;
  for (const pkg of pkgs.slice(0, 4)) {
    const seed = seeds[id % seeds.length];
    id += 1;
    const author = store.findUserById(pkg.createUserId) || {};
    out.push({
      id,
      packageId: pkg.id,
      namespace: pkg.namespace,
      packageName: pkg.name,
      title: seed.title,
      body: seed.body,
      platform: seed.platform,
      arch: seed.arch,
      contact: seed.contact,
      status: seed.status,
      createUserId: pkg.createUserId,
      createUsername: author.username || '-',
      createTime: pkg.createTime,
      comments: seed.comments.map((c, i) => {
        const u = store.findUserByUsername(c.username) || {};
        return {
          id: i + 1,
          username: c.username,
          realName: c.realName || u.realName || c.username,
          hue: u.hue || 200,
          body: c.body,
          createTime: pkg.createTime,
        };
      }),
    });
  }
  return out;
}

function packageDetail(user, namespace, name) {
  const d = ensure();
  const pkg = repo.getPackage(namespace, name);
  if (!pkg) throw new HttpError(404, '软件包不存在', 'NOT_FOUND');
  if (!repo.canSeePackage(user, pkg)) throw new HttpError(403, '无权查看该软件包', 'FORBIDDEN');

  const versions = repo.packageVersions(pkg);
  const summary = repo.packageSummary(pkg);
  const publishConfirmation = !!(store.getNamespace(namespace) || {}).settings?.publishConfirmation;

  const versionRows = versions.map((v) => {
    const plats = (v.artifacts || []).map((a) => ({
      platform: a.platform,
      arch: a.arch,
      size: a.size,
      filename: a.filename,
      sha256: a.sha256,
      downloads: a.downloads || 0,
      downloadUrl: `/api/packages/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/v/${encodeURIComponent(v.version)}/download?platform=${encodeURIComponent(a.platform)}&arch=${encodeURIComponent(a.arch)}`,
    }));
    const size = plats.reduce((s, p) => s + (Number(p.size) || 0), 0);
    return {
      version: v.version,
      status: v.status,
      deprecated: !!v.deprecated,
      deprecateReason: v.deprecateReason || '',
      size,
      sizeText: humanSize(size),
      platformInfoList: plats,
      publisher: userBrief(v.createUserId),
      publishTime: v.publishTime || v.createTime,
      createTime: v.createTime,
      description: v.description || '',
      dependencies: v.dependencies || [],
      downloads: v.downloads || 0,
    };
  });

  const artifacts = [];
  for (const v of versions) {
    for (const a of v.artifacts || []) {
      artifacts.push({
        version: v.version,
        platform: a.platform,
        arch: a.arch,
        filename: a.filename,
        size: a.size,
        sizeText: humanSize(a.size),
        sha256: a.sha256,
        uploadTime: a.uploadTime,
        minSupportedVersion: a.minSupportedVersion || '',
        downloadUrl: `/api/packages/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/v/${encodeURIComponent(v.version)}/download?platform=${encodeURIComponent(a.platform)}&arch=${encodeURIComponent(a.arch)}`,
      });
    }
  }

  const latest = versionRows.find((v) => v.version === summary.version) || versionRows[0] || null;
  const dependencies = (latest ? (versions.find((v) => v.version === latest.version) || {}).dependencies : []) || [];
  const dependents = repo.findDependents(pkg).map((dep) => ({
    namespace: dep.namespace,
    name: dep.name,
    version: dep.version || '',
  }));

  const members = (pkg.admins || []).map((uid) => {
    const u = userBrief(uid);
    return { user: u, roleName: '管理员' };
  });

  const issues = d.issues.filter((i) => i.packageId === pkg.id);

  const files = artifacts.map((a) => ({
    name: a.filename,
    size: a.size,
    sizeText: a.sizeText,
    sha256: a.sha256,
    platform: a.platform,
    arch: a.arch,
  }));

  return {
    package: summary,
    namespace,
    name,
    readme: pkg.readme || '',
    armoryJson: {
      schemaVersion: 1,
      name: pkg.name,
      namespace: pkg.namespace,
      description: pkg.description,
      accessLevel: pkg.accessLevel,
      dependencies: (dependencies || []).map((x) => ({ name: x.name, version: x.version, scope: x.scope || 'runtime' })),
      labels: pkg.tags || [],
    },
    downloadTotal: summary.downloads,
    size: latest ? latest.size : 0,
    sizeText: latest ? latest.sizeText : '-',
    license: 'Apache-2.0',
    latestPublishTime: latest ? latest.publishTime : pkg.createTime,
    admins: (pkg.admins || []).map(userBrief).filter(Boolean),
    versions: versionRows,
    publishedVersions: summary.publishedVersions,
    waitingConfirmationVersions: versionRows.filter((v) => v.status === 'PENDING').length,
    scanVersions: versionRows.filter((v) => v.status === 'SCANNING').length,
    artifacts,
    dependencies,
    dependents,
    members,
    membersNumber: members.length,
    issues,
    issuesNum: issues.filter((i) => i.status === 'OPEN').length,
    files,
    publishConfirmation,
    watching: (pkg.watchers || []).includes(user.id),
    tags: pkg.tags || [],
  };
}

function createIssue(user, namespace, name, body) {
  const d = ensure();
  const pkg = repo.getPackage(namespace, name);
  if (!pkg) throw new HttpError(404, '软件包不存在', 'NOT_FOUND');
  const title = String(body.title || '').trim();
  if (!title) throw new HttpError(400, '请输入问题标题', 'INVALID_TITLE');
  const row = {
    id: store.nextId('issues'),
    packageId: pkg.id,
    namespace,
    packageName: name,
    title: title.slice(0, 120),
    body: String(body.body || '').slice(0, 2000),
    platform: String(body.platform || '').slice(0, 40),
    arch: String(body.arch || '').slice(0, 40),
    contact: String(body.contact || '').slice(0, 120),
    status: 'OPEN',
    createUserId: user.id,
    createUsername: user.username,
    createTime: now(),
    comments: [],
  };
  d.issues.push(row);
  store.persist();
  return row;
}

function commentIssue(user, namespace, name, issueId, body) {
  const d = ensure();
  const pkg = repo.getPackage(namespace, name);
  const issue = d.issues.find((i) => i.id === Number(issueId) && pkg && i.packageId === pkg.id);
  if (!issue) throw new HttpError(404, '问题不存在', 'NOT_FOUND');
  const text = String(body.body || '').trim();
  if (!text) throw new HttpError(400, '请输入评论内容', 'INVALID_COMMENT');
  issue.comments.push({
    id: issue.comments.length + 1,
    username: user.username,
    realName: user.realName || user.username,
    hue: user.hue || 200,
    body: text.slice(0, 2000),
    createTime: now(),
  });
  if (issue.status === 'CLOSED') issue.status = 'OPEN';
  store.persist();
  return issue;
}

function closeIssue(user, namespace, name, issueId) {
  const d = ensure();
  const pkg = repo.getPackage(namespace, name);
  const issue = d.issues.find((i) => i.id === Number(issueId) && pkg && i.packageId === pkg.id);
  if (!issue) throw new HttpError(404, '问题不存在', 'NOT_FOUND');
  issue.status = 'CLOSED';
  store.persist();
  return issue;
}

module.exports = {
  ensure,
  DEFAULT_PLATFORMS,
  DEFAULT_ARCHS,
  listPlatforms, createPlatform, updatePlatform, deletePlatform,
  listArchs, createArch, updateArch, deleteArch,
  auditList, approveVersion,
  downloadStats, discover, popular,
  myOverview, myPackages, myWatches,
  packageDetail, createIssue, commentIssue, closeIssue,
  humanSize,
};
