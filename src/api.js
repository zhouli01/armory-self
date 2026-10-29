'use strict';

const fs = require('node:fs');
const path = require('node:path');

const config = require('./config');
const store = require('./store');
const repo = require('./repo');
const { parseMultipart } = require('./multipart');
const {
  OPERATION_TYPES, PLATFORMS, ARCHS, ROLES, ROLE_ORDER, ACCESS_LEVELS,
} = require('./constants');
const {
  HttpError, sha256, paginate, isValidVersion, humanSize,
} = require('./util');

const routes = [];

function add(method, pattern, handler) {
  const keys = [];
  const source = pattern.replace(/:([A-Za-z0-9_]+)/g, (_, key) => {
    keys.push(key);
    return '([^/]+)';
  });
  routes.push({ method, re: new RegExp(`^${source}$`), keys, handler });
}

/* ------------------------------------------------------------------ *
 * 基础工具
 * ------------------------------------------------------------------ */

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, `请求体超过限制（${humanSize(limit)}）`, 'PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const buf = await readBody(req, 2 * 1024 * 1024);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    throw new HttpError(400, '请求体不是合法 JSON', 'INVALID_JSON');
  }
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return String(req.socket.remoteAddress || '-').replace('::ffff:', '');
}

function nsParam(ctx) {
  return String(ctx.params.ns || '').replace(/^@/, '');
}

function sanitizeFilename(name) {
  const base = path.basename(String(name || 'artifact.bin'));
  const cleaned = base.replace(/[^\w.+\-@()\u4e00-\u9fa5]/g, '_').slice(0, 160);
  return cleaned || 'artifact.bin';
}

/* ------------------------------------------------------------------ *
 * 认证
 * ------------------------------------------------------------------ */

add('POST', '/api/auth/login', async (ctx) => {
  const { username, password } = ctx.body;
  const result = store.login(username, password);
  const ip = clientIp(ctx.req);
  // 登录成功后再补一条带 IP 的记录
  const last = store.db().audits[0];
  if (last && last.operationType === 'LOGIN') last.ip = ip;
  store.persist();
  return result;
});

add('POST', '/api/auth/logout', async (ctx) => {
  store.logout(ctx.token, ctx.user);
  return { loggedOut: true };
});

add('GET', '/api/auth/me', async (ctx) => ({
  user: store.publicUser(ctx.user),
  namespaces: store.listNamespaces(ctx.user, { scope: 'mine' }),
}));

/* ------------------------------------------------------------------ *
 * 元数据
 * ------------------------------------------------------------------ */

add('GET', '/api/meta', async () => ({
  platforms: PLATFORMS,
  archs: ARCHS,
  roles: ROLE_ORDER.map((id) => ROLES[id]),
  accessLevels: ACCESS_LEVELS,
  operationTypes: OPERATION_TYPES,
}));

add('GET', '/api/users', async (ctx) => ({
  list: store.listUsers(ctx.query.keyword),
}));

/* ------------------------------------------------------------------ *
 * 命名空间
 * ------------------------------------------------------------------ */

add('GET', '/api/namespaces', async (ctx) => {
  const list = store.listNamespaces(ctx.user, {
    scope: ctx.query.scope || 'mine',
    keyword: ctx.query.keyword || '',
    namespaceType: ctx.query.namespaceType || 'ALL',
  });
  const { slice, meta } = paginate(list, ctx.query.pageNum, ctx.query.pageSize || 10);
  return { list: slice, ...meta, count: meta.total };
});

add('POST', '/api/namespaces', async (ctx) => {
  const ns = store.createNamespace(ctx.user, ctx.body);
  return { namespace: ns };
});

add('GET', '/api/namespaces/:ns', async (ctx) => {
  const namespaceId = nsParam(ctx);
  const ns = store.getNamespace(namespaceId);
  if (!ns) throw new HttpError(404, '空间不存在', 'NOT_FOUND');
  const access = store.accessOf(ctx.user, namespaceId);
  if (access.level === 0) throw new HttpError(403, '你不是该空间的成员', 'FORBIDDEN');

  return {
    namespace: {
      namespaceId: ns.namespaceId,
      type: ns.type,
      description: ns.description,
      createTime: ns.createTime,
      createUsername: (store.findUserById(ns.createUserId) || {}).username || '-',
      settings: ns.settings,
      pkgNum: store.packageCount(namespaceId),
      memberNum: store.memberCount(namespaceId),
    },
    members: store.listMembers(namespaceId),
    packages: repo.listPackages(ctx.user, { namespace: namespaceId }).slice(0, 100),
    permissions: {
      level: access.level,
      roleId: access.roleId,
      roleName: access.roleId && ROLES[access.roleId] ? ROLES[access.roleId].name : (access.viaSystem ? '系统管理员' : '-'),
      canManage: access.level >= ROLES.ORG_ADMIN.level,
      canPublish: access.level >= ROLES.ORG_MEMBER.level,
      canDelete: access.level >= ROLES.ORG_OWNER.level && ns.type === 'ORG' && namespaceId !== 'global',
    },
  };
});

add('PUT', '/api/namespaces/:ns', async (ctx) => {
  const ns = store.updateNamespace(ctx.user, nsParam(ctx), ctx.body);
  return { namespace: ns };
});

add('DELETE', '/api/namespaces/:ns', async (ctx) => {
  store.deleteNamespace(ctx.user, nsParam(ctx));
  return { deleted: true };
});

add('GET', '/api/namespaces/:ns/members', async (ctx) => {
  const namespaceId = nsParam(ctx);
  store.assertNamespaceAccess(ctx.user, namespaceId, 10);
  return { list: store.listMembers(namespaceId) };
});

add('POST', '/api/namespaces/:ns/members', async (ctx) => ({
  list: store.addMember(ctx.user, nsParam(ctx), ctx.body),
}));

add('PUT', '/api/namespaces/:ns/members/:userId', async (ctx) => ({
  list: store.changeMemberRole(ctx.user, nsParam(ctx), ctx.params.userId, ctx.body.roleId),
}));

add('DELETE', '/api/namespaces/:ns/members/:userId', async (ctx) => ({
  list: store.removeMember(ctx.user, nsParam(ctx), ctx.params.userId),
}));

/* ------------------------------------------------------------------ *
 * 软件包
 * ------------------------------------------------------------------ */

add('GET', '/api/packages', async (ctx) => {
  const list = repo.listPackages(ctx.user, {
    keyword: ctx.query.keyword || '',
    namespace: ctx.query.namespace || '',
    accessLevel: ctx.query.accessLevel || '',
    sort: ctx.query.sort || 'recent',
  });
  const { slice, meta } = paginate(list, ctx.query.pageNum, ctx.query.pageSize || 20);
  return { list: slice, ...meta, total: meta.total };
});

add('POST', '/api/packages', async (ctx) => {
  const pkg = repo.createPackage(ctx.user, ctx.body);
  return { package: repo.packageSummary(pkg) };
});

add('GET', '/api/packages/:ns/:name', async (ctx) => {
  const info = repo.packageInfo(ctx.user, nsParam(ctx), ctx.params.name);
  return info;
});

add('PUT', '/api/packages/:ns/:name', async (ctx) => {
  const pkg = repo.updatePackage(ctx.user, nsParam(ctx), ctx.params.name, ctx.body);
  return { package: repo.packageSummary(pkg) };
});

add('DELETE', '/api/packages/:ns/:name', async (ctx) => {
  repo.deletePackage(ctx.user, nsParam(ctx), ctx.params.name);
  return { deleted: true };
});

add('POST', '/api/packages/:ns/:name/members', async (ctx) => {
  repo.addPackageMember(ctx.user, nsParam(ctx), ctx.params.name, ctx.body);
  return { ok: true };
});

add('DELETE', '/api/packages/:ns/:name/members/:userId', async (ctx) => {
  repo.removePackageMember(ctx.user, nsParam(ctx), ctx.params.name, ctx.params.userId);
  return { ok: true };
});

add('POST', '/api/packages/:ns/:name/watch', async (ctx) => {
  const watching = repo.toggleWatch(ctx.user, nsParam(ctx), ctx.params.name);
  return { watching };
});

add('POST', '/api/packages/:ns/:name/tags', async (ctx) => ({
  tags: repo.addTag(ctx.user, nsParam(ctx), ctx.params.name, ctx.body.tag),
}));

add('DELETE', '/api/packages/:ns/:name/tags/:tag', async (ctx) => ({
  tags: repo.removeTag(ctx.user, nsParam(ctx), ctx.params.name, ctx.params.tag),
}));

add('POST', '/api/packages/:ns/:name/default-version', async (ctx) => {
  repo.setDefaultVersion(ctx.user, nsParam(ctx), ctx.params.name, ctx.body.version);
  return { ok: true };
});

/* ------------------------------------------------------------------ *
 * 版本与制品
 * ------------------------------------------------------------------ */

add('POST', '/api/packages/:ns/:name/versions', async (ctx) => {
  const namespace = nsParam(ctx);
  const name = ctx.params.name;
  const pkg = repo.getPackage(namespace, name);
  if (!pkg) throw new HttpError(404, '软件包不存在，请先创建', 'NOT_FOUND');

  const raw = await readBody(ctx.req, config.MAX_UPLOAD_BYTES);
  const { fields, files } = parseMultipart(raw, ctx.req.headers['content-type']);
  const file = files.find((f) => f.field === 'file') || files[0];
  if (!file) throw new HttpError(400, '请选择要上传的制品文件', 'FILE_REQUIRED');

  const version = String(fields.version || '').trim();
  if (!isValidVersion(version)) {
    throw new HttpError(400, '版本号需符合 SEMVER 规范，例如 1.2.3 或 2.0.0-rc.1', 'INVALID_VERSION');
  }
  const platform = String(fields.platform || 'any').trim().toLowerCase();
  const arch = String(fields.arch || 'any').trim().toLowerCase();
  if (!PLATFORMS.includes(platform)) throw new HttpError(400, `平台不合法，可选：${PLATFORMS.join(' / ')}`, 'INVALID_PLATFORM');
  if (!ARCHS.includes(arch)) throw new HttpError(400, `架构不合法，可选：${ARCHS.join(' / ')}`, 'INVALID_ARCH');

  let dependencies = [];
  if (fields.dependencies) {
    try {
      const parsed = JSON.parse(fields.dependencies);
      if (Array.isArray(parsed)) {
        dependencies = parsed
          .filter((d) => d && d.name)
          .map((d) => ({
            name: String(d.name).replace(/^@/, ''),
            version: String(d.version || '*'),
            scope: d.scope === 'build' ? 'build' : 'runtime',
          }));
      }
    } catch {
      throw new HttpError(400, '依赖字段不是合法 JSON', 'INVALID_DEPENDENCIES');
    }
  }

  const filename = sanitizeFilename(file.filename);
  const rel = `${namespace}/${name}/${version}/${platform}/${arch}/${filename}`;
  const abs = path.join(config.STORAGE_DIR, rel);
  // 先写临时文件，业务校验通过后再原子改名，避免失败回滚误删同名旧制品
  const tmpAbs = `${abs}.uploading-${process.pid}-${Date.now()}`;

  try {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(tmpAbs, file.data);
    const v = repo.addArtifact(ctx.user, namespace, name, {
      version,
      platform,
      arch,
      filename,
      size: file.data.length,
      sha256: sha256(file.data),
      storagePath: rel,
      description: fields.description || '',
      dependencies,
    });
    fs.renameSync(tmpAbs, abs);
    return {
      version: {
        version: v.version,
        status: v.status,
        artifacts: v.artifacts.map((a) => ({
          platform: a.platform, arch: a.arch, filename: a.filename,
          size: a.size, sizeText: humanSize(a.size), sha256: a.sha256,
        })),
      },
    };
  } catch (e) {
    try { fs.rmSync(tmpAbs, { force: true }); } catch { /* 忽略 */ }
    // 上传失败（无权限/重名/格式错误）时把刚建出来的空目录一并回收
    repo.pruneEmptyDirs(namespace, name, version, platform, arch);
    throw e;
  }
});

add('GET', '/api/packages/:ns/:name/v/:version/platforms', async (ctx) => {
  const namespace = nsParam(ctx);
  const pkg = repo.getPackage(namespace, ctx.params.name);
  if (!pkg) throw new HttpError(404, '软件包不存在', 'NOT_FOUND');
  if (!repo.canSeePackage(ctx.user, pkg)) throw new HttpError(403, '无权访问', 'FORBIDDEN');
  const version = repo.packageVersions(pkg).find((v) => v.version === ctx.params.version);
  if (!version) throw new HttpError(404, '版本不存在', 'VERSION_NOT_FOUND');
  return {
    list: version.artifacts.map((a) => ({
      platform: a.platform,
      arch: a.arch,
      filename: a.filename,
      size: a.size,
      sizeText: humanSize(a.size),
      sha256: a.sha256,
      downloads: a.downloads || 0,
      uploadTime: a.uploadTime,
    })),
  };
});

add('POST', '/api/packages/:ns/:name/v/:version/confirm', async (ctx) => {
  const v = repo.confirmVersion(
    ctx.user, nsParam(ctx), ctx.params.name, ctx.params.version, ctx.body.confirm !== false,
  );
  return { version: { version: v.version, status: v.status } };
});

add('DELETE', '/api/packages/:ns/:name/v/:version', async (ctx) => {
  repo.deleteVersion(ctx.user, nsParam(ctx), ctx.params.name, ctx.params.version);
  return { deleted: true };
});

add('DELETE', '/api/packages/:ns/:name/v/:version/a/:platform/:arch', async (ctx) => {
  repo.deleteArtifact(
    ctx.user, nsParam(ctx), ctx.params.name, ctx.params.version, ctx.params.platform, ctx.params.arch,
  );
  return { deleted: true };
});

add('GET', '/api/packages/:ns/:name/v/:version/download', async (ctx) => {
  const namespace = nsParam(ctx);
  const { pkg, version, artifact } = repo.resolveArtifact(
    ctx.user, namespace, ctx.params.name, ctx.params.version, ctx.query.platform, ctx.query.arch,
  );
  return streamArtifact(ctx, pkg, version, artifact);
});

add('GET', '/api/packages/:ns/:name/download', async (ctx) => {
  const namespace = nsParam(ctx);
  const { pkg, version, artifact } = repo.resolveArtifact(
    ctx.user, namespace, ctx.params.name, ctx.query.version, ctx.query.platform, ctx.query.arch,
  );
  return streamArtifact(ctx, pkg, version, artifact);
});

function streamArtifact(ctx, pkg, version, artifact) {
  const abs = path.join(config.STORAGE_DIR, artifact.storagePath);
  if (!fs.existsSync(abs)) throw new HttpError(410, '制品文件已丢失，请重新发布', 'FILE_MISSING');
  const stat = fs.statSync(abs);
  repo.recordDownload(ctx.user, pkg, version, artifact, clientIp(ctx.req));

  const asciiName = artifact.filename.replace(/[^\x20-\x7e]/g, '_');
  ctx.res.writeHead(200, {
    'Content-Type': 'application/gzip',
    'Content-Length': stat.size,
    'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(artifact.filename)}`,
    'X-Checksum-SHA256': artifact.sha256,
  });
  fs.createReadStream(abs).pipe(ctx.res);
  return undefined; // 已直接写响应
}

/* ------------------------------------------------------------------ *
 * 审计与统计
 * ------------------------------------------------------------------ */

add('GET', '/api/audits/operation-types', async () => ({ list: OPERATION_TYPES }));

add('GET', '/api/audits', async (ctx) => {
  const list = store.listAudits({
    operationType: ctx.query.operationType,
    operator: ctx.query.operator,
    resourceType: ctx.query.resourceType,
  });
  const { slice, meta } = paginate(list, ctx.query.pageNum, ctx.query.pageSize || 20);
  const typeMap = new Map(OPERATION_TYPES.map((t) => [t.id, t.desc]));
  return {
    list: slice.map((a) => ({ ...a, operationName: typeMap.get(a.operationType) || a.operationType })),
    ...meta,
    total: meta.total,
  };
});

add('GET', '/api/stats/overview', async (ctx) => repo.statsOverview(ctx.user));

add('GET', '/api/health', async () => ({ ok: true, time: new Date().toISOString() }));

/* ------------------------------------------------------------------ *
 * Armory 界面层：平台 / 架构 / 审核 / 统计 / 个人中心 / 详情聚合
 * ------------------------------------------------------------------ */

const armory = require('./armory');

/* 平台管理 */

add('GET', '/api/pms/plats', async (ctx) => {
  const kw = String(ctx.query.keyword || '').trim().toLowerCase();
  let list = armory.listPlatforms();
  if (kw) list = list.filter((p) => p.name.toLowerCase().includes(kw));
  const { slice, meta } = paginate(list, ctx.query.pageNum, ctx.query.pageSize || 20);
  return { list: slice, ...meta, total: meta.total };
});

add('POST', '/api/pms/plats', async (ctx) => {
  const row = armory.createPlatform(ctx.body || {});
  store.audit(ctx.user, 'UPDATE_PACKAGE_METADATA', 'SYS', row.name, '新建平台');
  return { platform: row };
});

add('PUT', '/api/pms/plats/:id', async (ctx) => {
  const row = armory.updatePlatform(ctx.params.id, ctx.body || {});
  store.audit(ctx.user, 'UPDATE_PACKAGE_METADATA', 'SYS', row.name, '编辑平台');
  return { platform: row };
});

add('DELETE', '/api/pms/plats/:id', async (ctx) => {
  const row = armory.deletePlatform(ctx.params.id);
  store.audit(ctx.user, 'UPDATE_PACKAGE_METADATA', 'SYS', row.name, '删除平台');
  return { deleted: true, platform: row };
});

/* 架构管理 */

add('GET', '/api/pms/arch', async (ctx) => {
  const kw = String(ctx.query.keyword || '').trim().toLowerCase();
  let list = armory.listArchs();
  if (kw) list = list.filter((a) => a.name.toLowerCase().includes(kw));
  const { slice, meta } = paginate(list, ctx.query.pageNum, ctx.query.pageSize || 20);
  return { list: slice, ...meta, total: meta.total };
});

add('POST', '/api/pms/arch', async (ctx) => {
  const row = armory.createArch(ctx.body || {});
  store.audit(ctx.user, 'UPDATE_PACKAGE_METADATA', 'SYS', row.name, '新建架构');
  return { arch: row };
});

add('PUT', '/api/pms/arch/:id', async (ctx) => {
  const row = armory.updateArch(ctx.params.id, ctx.body || {});
  store.audit(ctx.user, 'UPDATE_PACKAGE_METADATA', 'SYS', row.name, '编辑架构');
  return { arch: row };
});

add('DELETE', '/api/pms/arch/:id', async (ctx) => {
  const row = armory.deleteArch(ctx.params.id);
  store.audit(ctx.user, 'UPDATE_PACKAGE_METADATA', 'SYS', row.name, '删除架构');
  return { deleted: true, arch: row };
});

/* 软件包审核 */

add('GET', '/api/pms/audit', async (ctx) => {
  const list = armory.auditList({ keyword: ctx.query.keyword || '', status: ctx.query.status || '' });
  const { slice, meta } = paginate(list, ctx.query.pageNum, ctx.query.pageSize || 10);
  return { list: slice, ...meta, total: meta.total };
});

add('POST', '/api/pms/audit/:ns/:name/v/:version/approve', async (ctx) => {
  const r = armory.approveVersion(ctx.user, ctx.params.ns, ctx.params.name, ctx.params.version);
  return r;
});

/* 首页右栏 */

add('GET', '/api/armory/summary', async (ctx) => armory.downloadStats(ctx.user));

add('GET', '/api/armory/discover', async (ctx) => ({ labels: armory.discover(ctx.user) }));

add('GET', '/api/armory/popular', async (ctx) => ({ list: armory.popular(ctx.user) }));

/* 个人中心 */

add('GET', '/api/me/overview', async (ctx) => armory.myOverview(ctx.user));

add('GET', '/api/me/packages', async (ctx) => ({
  list: armory.myPackages(ctx.user, ctx.query.scope || 'created'),
}));

add('GET', '/api/me/watches', async (ctx) => ({ list: armory.myWatches(ctx.user) }));

/* 软件包详情聚合 */

add('GET', '/api/packages/:ns/:name/detail', async (ctx) =>
  armory.packageDetail(ctx.user, nsParam(ctx), ctx.params.name));

/* 问题反馈 */

add('POST', '/api/packages/:ns/:name/issues', async (ctx) => ({
  issue: armory.createIssue(ctx.user, nsParam(ctx), ctx.params.name, ctx.body || {}),
}));

add('POST', '/api/packages/:ns/:name/issues/:issueId/comments', async (ctx) => ({
  issue: armory.commentIssue(ctx.user, nsParam(ctx), ctx.params.name, ctx.params.issueId, ctx.body || {}),
}));

add('POST', '/api/packages/:ns/:name/issues/:issueId/close', async (ctx) => ({
  issue: armory.closeIssue(ctx.user, nsParam(ctx), ctx.params.name, ctx.params.issueId),
}));


/* ------------------------------------------------------------------ *
 * 请求分发
 * ------------------------------------------------------------------ */

const PUBLIC_PATHS = new Set(['/api/health', '/api/auth/login']);

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURI(url.pathname).replace(/\/+$/, '') || '/';
  const query = Object.fromEntries(url.searchParams.entries());
  const method = req.method === 'HEAD' ? 'GET' : req.method;

  const route = routes.find((r) => r.method === method && r.re.test(pathname));
  if (!route) {
    sendJson(res, 404, { status: 'error', code: 'NOT_FOUND', message: `接口不存在：${method} ${pathname}` });
    return;
  }

  const m = route.re.exec(pathname);
  const params = {};
  route.keys.forEach((key, i) => {
    params[key] = decodeURIComponent(m[i + 1]);
  });

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || query.token || '';
  const user = store.resolveSession(token);

  if (!user && !PUBLIC_PATHS.has(pathname)) {
    sendJson(res, 401, { status: 'error', code: 'UNAUTHORIZED', message: '登录状态已失效，请重新登录' });
    return;
  }

  const ctx = { req, res, params, query, token, user, body: {} };

  try {
    const contentType = String(req.headers['content-type'] || '');
    if (/(POST|PUT|PATCH)/.test(method) && contentType.includes('application/json')) {
      ctx.body = await readJson(req);
    }
    const result = await route.handler(ctx);
    if (result !== undefined) {
      sendJson(res, 200, { status: 'success', ...result });
    }
  } catch (e) {
    if (e instanceof HttpError) {
      sendJson(res, e.status, { status: 'error', code: e.code, message: e.message });
      return;
    }
    console.error('[depot] 接口异常:', method, pathname, e);
    sendJson(res, 500, { status: 'error', code: 'INTERNAL_ERROR', message: e.message || '服务内部错误' });
  }
}

module.exports = { handle, routes };
