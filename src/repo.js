'use strict';

const fs = require('node:fs');
const path = require('node:path');

const config = require('./config');
const store = require('./store');
const { ROLES } = require('./constants');
const {
  HttpError, fmtTime, fmtDay, compareVersionDesc, maxVersion, isValidVersion, humanSize,
} = require('./util');

/* ------------------------------------------------------------------ *
 * 可见性与管理权限
 * ------------------------------------------------------------------ */

/**
 * 删除制品文件后，自下而上清理 storage 下的空目录，
 * 避免「删包/删版本」后残留 namespace / package 空壳目录。
 */
function pruneEmptyDirs(...segments) {
  const root = path.resolve(config.STORAGE_DIR);
  let dir = path.resolve(root, ...segments);
  while (dir !== root && dir.startsWith(root + path.sep)) {
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return; // 目录不存在，无需处理
    }
    if (entries.length) return; // 仍有内容，停止向上
    try {
      fs.rmdirSync(dir);
    } catch {
      return;
    }
    dir = path.dirname(dir);
  }
}

function canManagePackage(user, pkg) {
  if (!user) return false;
  if (store.isSystemAdmin(user)) return true;
  const ns = store.accessOf(user, pkg.namespace);
  if (ns.level >= ROLES.ORG_ADMIN.level) return true;
  if (ns.level >= ROLES.ORG_MEMBER.level) {
    return pkg.admins.includes(user.id) || pkg.createUserId === user.id;
  }
  return false;
}

function canSeePackage(user, pkg) {
  if (!user) return false;
  if (store.isSystemAdmin(user)) return true;
  const ns = store.accessOf(user, pkg.namespace);
  if (ns.level === 0) return false;
  if (pkg.accessLevel === 'Open') return true;
  return ns.level >= ROLES.ORG_ADMIN.level || pkg.admins.includes(user.id);
}

/* ------------------------------------------------------------------ *
 * 查询
 * ------------------------------------------------------------------ */

function allPackages() {
  return store.db().packages;
}

function getPackage(namespace, name) {
  return allPackages().find((p) => p.namespace === namespace && p.name === name) || null;
}

function allVersions() {
  return store.db().versions;
}

function packageVersions(pkg, { includeDeleted = false } = {}) {
  return allVersions()
    .filter((v) => v.packageId === pkg.id && (includeDeleted || v.status !== 'DELETED'))
    .sort((a, b) => compareVersionDesc(a.version, b.version));
}

function latestVersionOf(pkg) {
  const vs = packageVersions(pkg);
  if (!vs.length) return null;
  return vs.find((v) => v.version === pkg.defaultVersion) || vs[0];
}

function versionDownloads(v) {
  return (v.downloads || 0);
}

function packageSummary(pkg) {
  const versions = packageVersions(pkg);
  const latest = latestVersionOf(pkg);
  return {
    id: pkg.id,
    name: pkg.name,
    namespace: pkg.namespace,
    fullName: `@${pkg.namespace}/${pkg.name}`,
    description: pkg.description,
    version: latest ? latest.version : null,
    publishedVersions: versions.filter((v) => v.status === 'PUBLISHED').length,
    pendingVersions: versions.filter((v) => v.status === 'PENDING').length,
    downloads: versions.reduce((s, v) => s + versionDownloads(v), 0),
    accessLevel: pkg.accessLevel,
    status: pkg.status,
    lastPublishedTime: latest ? latest.publishTime : pkg.createTime,
    createTime: pkg.createTime,
    createUsername: (store.findUserById(pkg.createUserId) || {}).username || '-',
    tags: pkg.tags || [],
    watchers: (pkg.watchers || []).length,
    platforms: [...new Set(versions.flatMap((v) => v.artifacts.map((a) => a.platform)))],
    admins: pkg.admins.map((id) => {
      const u = store.findUserById(id);
      return { userId: id, username: u ? u.username : 'unknown', realName: u ? u.realName : '', hue: u ? u.hue : 200 };
    }),
  };
}

function listPackages(user, { keyword = '', namespace = '', accessLevel = '', sort = 'recent' } = {}) {
  const kw = String(keyword || '').trim().toLowerCase();
  let list = allPackages().filter((p) => canSeePackage(user, p));
  if (namespace) list = list.filter((p) => p.namespace === namespace);
  if (accessLevel) list = list.filter((p) => p.accessLevel === accessLevel);
  if (kw) {
    list = list.filter((p) => (
      p.name.toLowerCase().includes(kw)
      || String(p.description || '').toLowerCase().includes(kw)
      || `${p.namespace}/${p.name}`.includes(kw)
    ));
  }
  const items = list.map(packageSummary);
  if (sort === 'downloads') items.sort((a, b) => b.downloads - a.downloads);
  else if (sort === 'name') items.sort((a, b) => a.name.localeCompare(b.name));
  else items.sort((a, b) => String(b.lastPublishedTime).localeCompare(String(a.lastPublishedTime)));
  return items;
}

/** 反向依赖：谁依赖了当前软件包 */
function findDependents(pkg) {
  const target = `${pkg.namespace}/${pkg.name}`;
  const out = [];
  allVersions().forEach((v) => {
    if (v.status === 'DELETED') return;
    const owner = allPackages().find((p) => p.id === v.packageId);
    if (!owner || owner.id === pkg.id) return;
    (v.dependencies || []).forEach((d) => {
      const ref = String(d.name || '').replace(/^@/, '');
      if (ref === target || (ref === pkg.name && owner.namespace === pkg.namespace)) {
        out.push({
          namespace: owner.namespace,
          name: owner.name,
          version: v.version,
          constraint: d.version || '*',
        });
      }
    });
  });
  return out;
}

function packageInfo(user, namespace, name) {
  const pkg = getPackage(namespace, name);
  if (!pkg) throw new HttpError(404, '软件包不存在', 'NOT_FOUND');
  if (!canSeePackage(user, pkg)) throw new HttpError(403, '无权访问该软件包', 'FORBIDDEN');

  const ns = store.getNamespace(namespace);
  const versions = packageVersions(pkg).map((v) => ({
    version: v.version,
    status: v.status,
    description: v.description,
    dependencies: v.dependencies || [],
    downloads: versionDownloads(v),
    createTime: v.createTime,
    publishTime: v.publishTime,
    artifacts: v.artifacts.map((a) => ({
      id: a.id,
      platform: a.platform,
      arch: a.arch,
      filename: a.filename,
      size: a.size,
      sizeText: humanSize(a.size),
      sha256: a.sha256,
      downloads: a.downloads || 0,
      uploadTime: a.uploadTime,
    })),
  }));
  const latest = latestVersionOf(pkg);

  return {
    package: {
      id: pkg.id,
      name: pkg.name,
      namespace: pkg.namespace,
      fullName: `@${pkg.namespace}/${pkg.name}`,
      namespaceType: ns ? ns.type : 'ORG',
      description: pkg.description,
      downloads: versions.reduce((s, v) => s + v.downloads, 0),
      publishedVersions: versions.filter((v) => v.status === 'PUBLISHED').length,
      waitingConfirmationVersions: versions.filter((v) => v.status === 'PENDING').length,
      accessLevel: pkg.accessLevel,
      lastPublishedTime: latest ? latest.publishTime : pkg.createTime,
      defaultVersion: pkg.defaultVersion,
      createTime: pkg.createTime,
      createUserId: pkg.createUserId,
      createUsername: (store.findUserById(pkg.createUserId) || {}).username || '-',
      status: pkg.status,
      membersNumber: pkg.admins.length,
      watcherNum: (pkg.watchers || []).length,
      watching: user ? (pkg.watchers || []).includes(user.id) : false,
      tags: pkg.tags || [],
      readme: pkg.readme || '',
      admins: pkg.admins.map((id) => store.publicUser(store.findUserById(id))).filter(Boolean),
      issuesNum: 0,
    },
    versions,
    dependents: findDependents(pkg),
    permissions: {
      canManage: canManagePackage(user, pkg),
      canPublish: store.accessOf(user, namespace).level >= ROLES.ORG_MEMBER.level,
    },
  };
}

/* ------------------------------------------------------------------ *
 * 写入：软件包
 * ------------------------------------------------------------------ */

function createPackage(user, { namespace, name, description = '', accessLevel = 'Open', readme = '' }) {
  const nsId = String(namespace || '').trim();
  const pkgName = String(name || '').trim().toLowerCase();
  if (!store.getNamespace(nsId)) throw new HttpError(404, '空间不存在', 'NAMESPACE_NOT_FOUND');
  store.assertNamespaceAccess(user, nsId, ROLES.ORG_MEMBER.level);
  if (!/^[a-z0-9][a-z0-9-_+.]{0,79}$/.test(pkgName)) {
    throw new HttpError(400, '软件包名称仅允许小写字母、数字、- _ + .，且以字母或数字开头', 'INVALID_NAME');
  }
  if (!['Open', 'Restricted'].includes(accessLevel)) {
    throw new HttpError(400, '访问级别不合法', 'INVALID_ACCESS');
  }
  if (getPackage(nsId, pkgName)) {
    throw new HttpError(409, '该空间下已存在同名软件包', 'PACKAGE_EXISTS');
  }

  const pkg = {
    id: store.nextId('package'),
    namespace: nsId,
    name: pkgName,
    description: String(description || '').slice(0, 300),
    accessLevel,
    admins: [user.id],
    watchers: [],
    status: 'OK',
    defaultVersion: null,
    tags: [],
    readme: String(readme || ''),
    createTime: fmtTime(),
    createUserId: user.id,
  };
  store.db().packages.push(pkg);
  store.persist();
  store.audit(user, 'CREATE_PACKAGE', 'NAMESPACE', nsId, `创建软件包 @${nsId}/${pkgName}`);
  return pkg;
}

function updatePackage(user, namespace, name, patch) {
  const pkg = getPackage(namespace, name);
  if (!pkg) throw new HttpError(404, '软件包不存在', 'NOT_FOUND');
  if (!canManagePackage(user, pkg)) throw new HttpError(403, '无权修改该软件包', 'FORBIDDEN');

  if (patch.description !== undefined) {
    pkg.description = String(patch.description).slice(0, 300);
    store.audit(user, 'UPDATE_PACKAGE_METADATA', 'PACKAGE', `@${namespace}/${name}`, '更新软件包描述');
  }
  if (patch.readme !== undefined) {
    pkg.readme = String(patch.readme).slice(0, 100000);
    store.audit(user, 'UPDATE_README', 'PACKAGE', `@${namespace}/${name}`, '更新 README');
  }
  if (patch.accessLevel !== undefined) {
    if (!['Open', 'Restricted'].includes(patch.accessLevel)) {
      throw new HttpError(400, '访问级别不合法', 'INVALID_ACCESS');
    }
    if (patch.accessLevel !== pkg.accessLevel) {
      pkg.accessLevel = patch.accessLevel;
      store.audit(
        user, 'CHANGE_PKG_ACCESS_LEVEL', 'PACKAGE', `@${namespace}/${name}`,
        `访问级别调整为 ${patch.accessLevel === 'Open' ? '公开' : '受限'}`,
      );
    }
  }
  store.persist();
  return pkg;
}

function deletePackage(user, namespace, name) {
  const pkg = getPackage(namespace, name);
  if (!pkg) throw new HttpError(404, '软件包不存在', 'NOT_FOUND');
  if (!canManagePackage(user, pkg)) throw new HttpError(403, '无权删除该软件包', 'FORBIDDEN');
  store.db().packages = allPackages().filter((p) => p.id !== pkg.id);
  store.db().versions = allVersions().filter((v) => v.packageId !== pkg.id);
  store.persist();
  try {
    fs.rmSync(path.join(config.STORAGE_DIR, namespace, name), { recursive: true, force: true });
  } catch { /* 磁盘清理失败不影响业务 */ }
  pruneEmptyDirs(namespace);
  store.audit(user, 'REMOVE_PACKAGE', 'PACKAGE', `@${namespace}/${name}`, '删除软件包');
}

function addPackageMember(user, namespace, name, { userId, username }) {
  const pkg = getPackage(namespace, name);
  if (!pkg) throw new HttpError(404, '软件包不存在', 'NOT_FOUND');
  if (!canManagePackage(user, pkg)) throw new HttpError(403, '无权管理该软件包成员', 'FORBIDDEN');
  const target = userId ? store.findUserById(userId) : store.findUserByUsername(username);
  if (!target) throw new HttpError(404, '用户不存在', 'USER_NOT_FOUND');
  if (pkg.admins.includes(target.id)) {
    throw new HttpError(409, '该用户已是软件包管理员', 'MEMBER_EXISTS');
  }
  pkg.admins.push(target.id);
  store.persist();
  store.audit(user, 'ADD_PKG_MEMBER', 'PACKAGE', `@${namespace}/${name}`, `添加管理员 ${target.username}`);
}

function removePackageMember(user, namespace, name, targetUserId) {
  const pkg = getPackage(namespace, name);
  if (!pkg) throw new HttpError(404, '软件包不存在', 'NOT_FOUND');
  if (!canManagePackage(user, pkg)) throw new HttpError(403, '无权管理该软件包成员', 'FORBIDDEN');
  if (pkg.admins.length <= 1) throw new HttpError(400, '软件包至少保留一名管理员', 'LAST_ADMIN');
  const target = store.findUserById(Number(targetUserId));
  pkg.admins = pkg.admins.filter((id) => id !== Number(targetUserId));
  store.persist();
  store.audit(
    user, 'REMOVE_PKG_MEMBER', 'PACKAGE', `@${namespace}/${name}`,
    `移除管理员 ${target ? target.username : targetUserId}`,
  );
}

function toggleWatch(user, namespace, name) {
  const pkg = getPackage(namespace, name);
  if (!pkg) throw new HttpError(404, '软件包不存在', 'NOT_FOUND');
  const has = (pkg.watchers || []).includes(user.id);
  pkg.watchers = has ? pkg.watchers.filter((id) => id !== user.id) : [...(pkg.watchers || []), user.id];
  store.persist();
  return !has;
}

function addTag(user, namespace, name, tag) {
  const pkg = getPackage(namespace, name);
  if (!pkg) throw new HttpError(404, '软件包不存在', 'NOT_FOUND');
  if (!canManagePackage(user, pkg)) throw new HttpError(403, '无权修改该软件包', 'FORBIDDEN');
  const t = String(tag || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-_.]{0,23}$/.test(t)) {
    throw new HttpError(400, '标签仅允许小写字母、数字、- _ .，最长 24 位', 'INVALID_TAG');
  }
  pkg.tags = pkg.tags || [];
  if (pkg.tags.includes(t)) throw new HttpError(409, '标签已存在', 'TAG_EXISTS');
  if (pkg.tags.length >= 20) throw new HttpError(400, '标签数量已达上限（20）', 'TAG_LIMIT');
  pkg.tags.push(t);
  store.persist();
  store.audit(user, 'ADD_TAG', 'PACKAGE', `@${namespace}/${name}`, `新增标签 ${t}`);
  return pkg.tags;
}

function removeTag(user, namespace, name, tag) {
  const pkg = getPackage(namespace, name);
  if (!pkg) throw new HttpError(404, '软件包不存在', 'NOT_FOUND');
  if (!canManagePackage(user, pkg)) throw new HttpError(403, '无权修改该软件包', 'FORBIDDEN');
  pkg.tags = (pkg.tags || []).filter((t) => t !== String(tag).toLowerCase());
  store.persist();
  store.audit(user, 'REMOVE_TAG', 'PACKAGE', `@${namespace}/${name}`, `移除标签 ${tag}`);
  return pkg.tags;
}

/* ------------------------------------------------------------------ *
 * 写入：版本与制品
 * ------------------------------------------------------------------ */

function assertPublishable(user, pkg) {
  if (!canManagePackage(user, pkg)) throw new HttpError(403, '无权向该软件包发布版本', 'FORBIDDEN');
  if (store.accessOf(user, pkg.namespace).level < ROLES.ORG_MEMBER.level) {
    throw new HttpError(403, '当前角色不具备发布权限（需要成员及以上）', 'FORBIDDEN');
  }
}

/**
 * 发布一个版本的制品。
 * payload: { version, platform, arch, filename, size, sha256, storagePath, description, dependencies }
 */
function addArtifact(user, namespace, name, payload) {
  const pkg = getPackage(namespace, name);
  if (!pkg) throw new HttpError(404, '软件包不存在，请先创建软件包', 'NOT_FOUND');
  assertPublishable(user, pkg);

  const version = String(payload.version || '').trim();
  if (!isValidVersion(version)) {
    throw new HttpError(400, '版本号需符合 SEMVER 规范，例如 1.2.3 或 2.0.0-rc.1', 'INVALID_VERSION');
  }

  const ns = store.getNamespace(namespace);
  let v = allVersions().find((x) => x.packageId === pkg.id && x.version === version);
  if (!v) {
    v = {
      id: store.nextId('version'),
      packageId: pkg.id,
      version,
      status: ns && ns.settings.publishConfirmation ? 'PENDING' : 'PUBLISHED',
      description: String(payload.description || '').slice(0, 500),
      dependencies: Array.isArray(payload.dependencies) ? payload.dependencies : [],
      artifacts: [],
      downloads: 0,
      createUserId: user.id,
      createTime: fmtTime(),
      publishTime: fmtTime(),
    };
    store.db().versions.push(v);
  } else if (v.status === 'DELETED') {
    v.status = ns && ns.settings.publishConfirmation ? 'PENDING' : 'PUBLISHED';
  } else if (!pkg.admins.includes(user.id) && !store.isSystemAdmin(user)) {
    // 允许跨人发布，但需要空间管理员以上，已在 assertPublishable 校验
  }

  if (v.artifacts.some((a) => a.platform === payload.platform && a.arch === payload.arch)) {
    throw new HttpError(
      409,
      `${payload.platform}/${payload.arch} 已存在该版本的制品，替换前请先删除旧制品`,
      'ARTIFACT_EXISTS',
    );
  }

  v.artifacts.push({
    id: store.nextId('artifact'),
    platform: payload.platform,
    arch: payload.arch,
    filename: payload.filename,
    size: payload.size,
    sha256: payload.sha256,
    storagePath: payload.storagePath,
    downloads: 0,
    uploadTime: fmtTime(),
    uploadUserId: user.id,
  });
  if (Array.isArray(payload.dependencies)) v.dependencies = payload.dependencies;
  if (payload.description) v.description = String(payload.description).slice(0, 500);

  pkg.defaultVersion = maxVersion(packageVersions(pkg).map((x) => x.version)) || version;
  pkg.status = 'OK';

  store.persist();
  store.audit(
    user, 'PUBLISH', 'PACKAGE', `@${namespace}/${name}@${version}`,
    `发布 ${payload.platform}/${payload.arch} 制品 ${payload.filename}（${v.status === 'PENDING' ? '待确认' : '已发布'}）`,
  );
  return v;
}

function confirmVersion(user, namespace, name, version, confirm) {
  const pkg = getPackage(namespace, name);
  if (!pkg) throw new HttpError(404, '软件包不存在', 'NOT_FOUND');
  if (!canManagePackage(user, pkg)) throw new HttpError(403, '无权限', 'FORBIDDEN');
  const v = allVersions().find((x) => x.packageId === pkg.id && x.version === version);
  if (!v) throw new HttpError(404, '版本不存在', 'VERSION_NOT_FOUND');
  if (v.status !== 'PENDING') throw new HttpError(400, '该版本不在待确认状态', 'INVALID_STATE');
  v.status = confirm ? 'PUBLISHED' : 'DELETED';
  v.publishTime = fmtTime();
  store.persist();
  store.audit(
    user, confirm ? 'CONFIRM_PUBLISH' : 'CANCEL_PUBLISH', 'PACKAGE',
    `@${namespace}/${name}@${version}`, confirm ? '确认发布' : '取消发布',
  );
  return v;
}

function deleteVersion(user, namespace, name, version) {
  const pkg = getPackage(namespace, name);
  if (!pkg) throw new HttpError(404, '软件包不存在', 'NOT_FOUND');
  if (!canManagePackage(user, pkg)) throw new HttpError(403, '无权删除该版本', 'FORBIDDEN');
  const v = allVersions().find((x) => x.packageId === pkg.id && x.version === version);
  if (!v || v.status === 'DELETED') throw new HttpError(404, '版本不存在', 'VERSION_NOT_FOUND');
  v.status = 'DELETED';
  try {
    fs.rmSync(path.join(config.STORAGE_DIR, namespace, name, version), { recursive: true, force: true });
  } catch { /* 忽略 */ }
  pruneEmptyDirs(namespace, name);
  if (pkg.defaultVersion === version) {
    const rest = packageVersions(pkg).map((x) => x.version);
    pkg.defaultVersion = maxVersion(rest);
  }
  store.persist();
  store.audit(user, 'UN_PUBLISH', 'PACKAGE', `@${namespace}/${name}@${version}`, '撤销发布（版本删除）');
}

function deleteArtifact(user, namespace, name, version, platform, arch) {
  const pkg = getPackage(namespace, name);
  if (!pkg) throw new HttpError(404, '软件包不存在', 'NOT_FOUND');
  if (!canManagePackage(user, pkg)) throw new HttpError(403, '无权删除制品', 'FORBIDDEN');
  const v = allVersions().find((x) => x.packageId === pkg.id && x.version === version);
  if (!v) throw new HttpError(404, '版本不存在', 'VERSION_NOT_FOUND');
  const art = v.artifacts.find((a) => a.platform === platform && a.arch === arch);
  if (!art) throw new HttpError(404, '制品不存在', 'ARTIFACT_NOT_FOUND');
  v.artifacts = v.artifacts.filter((a) => a.id !== art.id);
  try { fs.rmSync(path.join(config.STORAGE_DIR, art.storagePath), { force: true }); } catch { /* 忽略 */ }
  pruneEmptyDirs(namespace, name, version, platform, arch);
  if (!v.artifacts.length) {
    v.status = 'DELETED';
    try {
      fs.rmSync(path.join(config.STORAGE_DIR, namespace, name, version), { recursive: true, force: true });
    } catch { /* 忽略 */ }
    pruneEmptyDirs(namespace, name);
  }
  store.persist();
  store.audit(user, 'UN_PUBLISH', 'PACKAGE', `@${namespace}/${name}@${version}`, `删除制品 ${platform}/${arch}`);
}

function setDefaultVersion(user, namespace, name, version) {
  const pkg = getPackage(namespace, name);
  if (!pkg) throw new HttpError(404, '软件包不存在', 'NOT_FOUND');
  if (!canManagePackage(user, pkg)) throw new HttpError(403, '无权限', 'FORBIDDEN');
  const v = packageVersions(pkg).find((x) => x.version === version);
  if (!v) throw new HttpError(404, '版本不存在', 'VERSION_NOT_FOUND');
  pkg.defaultVersion = version;
  store.persist();
  store.audit(user, 'UPDATE_PACKAGE_METADATA', 'PACKAGE', `@${namespace}/${name}`, `默认版本设为 ${version}`);
}

/** 解析下载目标，返回 { version, artifact } */
function resolveArtifact(user, namespace, name, version, platform, arch) {
  const pkg = getPackage(namespace, name);
  if (!pkg) throw new HttpError(404, '软件包不存在', 'NOT_FOUND');
  if (!canSeePackage(user, pkg)) throw new HttpError(403, '无权下载该软件包', 'FORBIDDEN');
  const versions = packageVersions(pkg);
  if (!versions.length) throw new HttpError(404, '该软件包暂无可用版本', 'NO_VERSION');
  const v = version
    ? versions.find((x) => x.version === version)
    : (versions.find((x) => x.version === pkg.defaultVersion) || versions[0]);
  if (!v) throw new HttpError(404, '版本不存在', 'VERSION_NOT_FOUND');
  if (!v.artifacts.length) throw new HttpError(404, '该版本暂无制品', 'NO_ARTIFACT');

  let art = null;
  if (platform || arch) {
    art = v.artifacts.find(
      (a) => (!platform || a.platform === platform) && (!arch || a.arch === arch),
    );
  }
  if (!art) art = v.artifacts[0];
  return { pkg, version: v, artifact: art };
}

function recordDownload(user, pkg, version, artifact, ip) {
  version.downloads = (version.downloads || 0) + 1;
  artifact.downloads = (artifact.downloads || 0) + 1;
  store.persist();
  store.audit(
    user, 'DOWNLOAD', 'PACKAGE', `@${pkg.namespace}/${pkg.name}@${version.version}`,
    `下载 ${artifact.platform}/${artifact.arch} 制品 ${artifact.filename}`, ip,
  );
}

/* ------------------------------------------------------------------ *
 * 概览统计
 * ------------------------------------------------------------------ */

function statsOverview(user) {
  const visible = allPackages().filter((p) => canSeePackage(user, p));
  const visibleIds = new Set(visible.map((p) => p.id));
  const versions = allVersions().filter((v) => visibleIds.has(v.packageId) && v.status !== 'DELETED');
  const artifacts = versions.flatMap((v) => v.artifacts);

  const trend = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    trend.push({ day: fmtDay(d), count: 0 });
  }
  const trendIndex = new Map(trend.map((t, i) => [t.day, i]));
  store.db().audits.forEach((a) => {
    if (a.operationType !== 'DOWNLOAD') return;
    const day = String(a.time).slice(0, 10);
    if (trendIndex.has(day)) trend[trendIndex.get(day)].count += 1;
  });

  const platformCount = {};
  artifacts.forEach((a) => { platformCount[a.platform] = (platformCount[a.platform] || 0) + 1; });

  const namespaceCount = {};
  visible.forEach((p) => { namespaceCount[p.namespace] = (namespaceCount[p.namespace] || 0) + 1; });

  const recentPublishes = store.db().audits
    .filter((a) => a.operationType === 'PUBLISH' || a.operationType === 'CONFIRM_PUBLISH')
    .slice(0, 6);

  const topPackages = visible
    .map((p) => packageSummary(p))
    .sort((a, b) => b.downloads - a.downloads)
    .slice(0, 5);

  const totalDownloads = versions.reduce((s, v) => s + (v.downloads || 0), 0);
  const todayDownloads = store.db().audits.filter(
    (a) => a.operationType === 'DOWNLOAD' && String(a.time).slice(0, 10) === fmtDay(),
  ).length;

  return {
    totals: {
      packages: visible.length,
      // 当前账号可见软件包所覆盖的命名空间数量（与「命名空间分布」口径一致）
      namespaces: Object.keys(namespaceCount).length,
      versions: versions.length,
      artifacts: artifacts.length,
      downloads: totalDownloads,
      todayDownloads,
      storageBytes: artifacts.reduce((s, a) => s + (a.size || 0), 0),
      users: store.db().users.length,
    },
    trend,
    platformCount,
    namespaceCount: Object.entries(namespaceCount)
      .map(([namespace, count]) => ({ namespace, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
    recentPublishes,
    topPackages,
  };
}

module.exports = {
  canSeePackage, canManagePackage, pruneEmptyDirs,
  getPackage, allPackages, allVersions, packageVersions, latestVersionOf,
  packageSummary, listPackages, packageInfo, findDependents,
  createPackage, updatePackage, deletePackage,
  addPackageMember, removePackageMember, toggleWatch,
  addTag, removeTag,
  addArtifact, confirmVersion, deleteVersion, deleteArtifact, setDefaultVersion,
  resolveArtifact, recordDownload, statsOverview,
};
