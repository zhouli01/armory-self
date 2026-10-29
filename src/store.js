'use strict';

const fs = require('node:fs');

const config = require('./config');
const { ROLES } = require('./constants');
const {
  HttpError,
  fmtTime,
  randomToken,
  verifyPassword,
  isValidName,
} = require('./util');
const { buildSeedDb } = require('./seed');

const state = { db: null, saveTimer: null, dirty: false };

/* ------------------------------------------------------------------ *
 * 持久化：内存读写 + 合并落盘 + 原子替换
 * ------------------------------------------------------------------ */

function init() {
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
  fs.mkdirSync(config.STORAGE_DIR, { recursive: true });
  if (fs.existsSync(config.DB_FILE)) {
    state.db = JSON.parse(fs.readFileSync(config.DB_FILE, 'utf8'));
    if (!state.db.schemaVersion) state.db.schemaVersion = 1;
  } else {
    state.db = buildSeedDb();
    writeNow();
  }
  return state.db;
}

function writeNow() {
  const tmp = `${config.DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state.db, null, 2), 'utf8');
  fs.renameSync(tmp, config.DB_FILE);
  state.dirty = false;
}

function persist() {
  state.dirty = true;
  if (state.saveTimer) return;
  state.saveTimer = setTimeout(() => {
    state.saveTimer = null;
    if (state.dirty) {
      try { writeNow(); } catch (e) { console.error('[depot] 数据落盘失败:', e.message); }
    }
  }, 120);
  if (typeof state.saveTimer.unref === 'function') state.saveTimer.unref();
}

function flush() {
  if (state.saveTimer) { clearTimeout(state.saveTimer); state.saveTimer = null; }
  if (state.dirty || !fs.existsSync(config.DB_FILE)) writeNow();
}

function db() {
  if (!state.db) init();
  return state.db;
}

function nextId(key) {
  const d = db();
  d.counters[key] = (d.counters[key] || 0) + 1;
  return d.counters[key];
}

/* ------------------------------------------------------------------ *
 * 用户与会话
 * ------------------------------------------------------------------ */

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, username: u.username, realName: u.realName, email: u.email,
    role: u.role, hue: u.hue, createTime: u.createTime,
  };
}

function findUserById(id) {
  return db().users.find((u) => u.id === Number(id)) || null;
}

function findUserByUsername(username) {
  const key = String(username || '').trim().toLowerCase();
  return db().users.find((u) => u.username.toLowerCase() === key) || null;
}

function listUsers(keyword) {
  const kw = String(keyword || '').trim().toLowerCase();
  return db().users
    .filter((u) => !kw || u.username.toLowerCase().includes(kw) || String(u.realName || '').toLowerCase().includes(kw))
    .map(publicUser);
}

function login(username, password) {
  const user = findUserByUsername(username);
  if (!user || !verifyPassword(String(password || ''), user.salt, user.passwordHash)) {
    throw new HttpError(401, '用户名或密码不正确', 'AUTH_FAILED');
  }
  const token = randomToken();
  const nowMs = Date.now();
  db().sessions = db().sessions.filter((s) => s.expiresAt > nowMs);
  db().sessions.push({
    token, userId: user.id, createTime: fmtTime(), expiresAt: nowMs + config.SESSION_TTL_MS,
  });
  persist();
  audit(user, 'LOGIN', 'SYS', 'session', `登录成功（${user.role === 'ADMIN' ? '系统管理员' : '普通用户'}）`);
  return { token, user: publicUser(user) };
}

function resolveSession(token) {
  if (!token) return null;
  const s = db().sessions.find((x) => x.token === token);
  if (!s || s.expiresAt < Date.now()) return null;
  return findUserById(s.userId);
}

function logout(token, user) {
  const before = db().sessions.length;
  db().sessions = db().sessions.filter((s) => s.token !== token);
  if (db().sessions.length !== before) {
    persist();
    if (user) audit(user, 'LOGIN_OUT', 'SYS', 'session', '退出登录');
  }
}

/* ------------------------------------------------------------------ *
 * 权限模型
 * ------------------------------------------------------------------ */

function isSystemAdmin(user) {
  return !!user && user.role === 'ADMIN';
}

function roleOf(namespaceId, userId) {
  const m = db().namespaceMembers.find((x) => x.namespaceId === namespaceId && x.userId === userId);
  return m ? m.roleId : null;
}

/** 系统管理员 = 50，空间角色 40/30/20/10，非成员 = 0 */
function accessOf(user, namespaceId) {
  if (!user) return { level: 0, roleId: null, viaSystem: false };
  if (isSystemAdmin(user)) return { level: 50, roleId: 'SYSTEM_ADMIN', viaSystem: true };
  const r = roleOf(namespaceId, user.id);
  return { level: r ? ROLES[r].level : 0, roleId: r, viaSystem: false };
}

function assertNamespaceAccess(user, namespaceId, minLevel = 10) {
  const { level, roleId } = accessOf(user, namespaceId);
  if (level < minLevel) {
    throw new HttpError(403, level === 0 ? '你不是该空间的成员' : '当前角色权限不足', 'FORBIDDEN');
  }
  return roleId;
}

/* ------------------------------------------------------------------ *
 * 审计
 * ------------------------------------------------------------------ */

function audit(user, operationType, resourceType, resource, detail, ip) {
  const d = db();
  d.audits.unshift({
    id: nextId('audit'),
    operationType,
    resourceType,
    resource: resource || '-',
    detail: detail || '',
    userId: user ? user.id : null,
    username: user ? user.username : 'anonymous',
    time: fmtTime(),
    ip: ip || '-',
  });
  if (d.audits.length > 5000) d.audits.length = 5000;
  persist();
}

function listAudits({ operationType, operator, resourceType } = {}) {
  const kw = String(operator || '').trim().toLowerCase();
  return db().audits.filter((a) => {
    if (operationType && operationType !== 'ALL' && a.operationType !== operationType) return false;
    if (resourceType && resourceType !== 'ALL' && a.resourceType !== resourceType) return false;
    if (kw && !String(a.username).toLowerCase().includes(kw)) return false;
    return true;
  });
}

/* ------------------------------------------------------------------ *
 * 命名空间
 * ------------------------------------------------------------------ */

function memberCount(namespaceId) {
  return db().namespaceMembers.filter((m) => m.namespaceId === namespaceId).length;
}

function packageCount(namespaceId) {
  return db().packages.filter((p) => p.namespace === namespaceId).length;
}

function getNamespace(namespaceId) {
  return db().namespaces.find((n) => n.namespaceId === namespaceId) || null;
}

function listNamespaces(user, { scope = 'mine', keyword = '', namespaceType = 'ALL' } = {}) {
  const kw = String(keyword || '').trim().toLowerCase();
  let list = db().namespaces.slice();

  if (scope === 'mine') {
    const mine = new Set(
      db().namespaceMembers.filter((m) => m.userId === (user && user.id)).map((m) => m.namespaceId),
    );
    list = list.filter((n) => mine.has(n.namespaceId));
  }
  if (namespaceType && namespaceType !== 'ALL') list = list.filter((n) => n.type === namespaceType);
  if (kw) {
    list = list.filter((n) => (
      n.namespaceId.toLowerCase().includes(kw) || String(n.description || '').toLowerCase().includes(kw)
    ));
  }
  list.sort((a, b) => {
    if (a.namespaceId === 'global') return -1;
    if (b.namespaceId === 'global') return 1;
    return a.namespaceId.localeCompare(b.namespaceId);
  });

  return list.map((n) => {
    const roleId = user ? roleOf(n.namespaceId, user.id) : null;
    return {
      namespaceId: n.namespaceId,
      type: n.type,
      description: n.description,
      roleId,
      roleDisplayName: roleId ? ROLES[roleId].name : null,
      pkgNum: packageCount(n.namespaceId),
      memberNum: memberCount(n.namespaceId),
      createTime: n.createTime,
      settings: n.settings,
    };
  });
}

function createNamespace(user, { namespaceId, type = 'ORG', description = '' }) {
  const id = String(namespaceId || '').trim().toLowerCase();
  if (!isValidName(id) || id.length < 2) {
    throw new HttpError(400, '空间标识需 2-63 位，仅允许小写字母、数字、- 和 _，且以字母或数字开头', 'INVALID_NAME');
  }
  if (getNamespace(id)) throw new HttpError(409, '该空间标识已存在', 'NAMESPACE_EXISTS');
  if (type !== 'ORG') throw new HttpError(400, '这里创建的是组织空间，用户空间由账号自动生成', 'INVALID_TYPE');

  const ns = {
    id: nextId('namespace'),
    namespaceId: id,
    type,
    description: String(description || '').slice(0, 200),
    createUserId: user.id,
    createTime: fmtTime(),
    settings: { publishConfirmation: false },
  };
  db().namespaces.push(ns);
  db().namespaceMembers.push({
    id: nextId('member'), namespaceId: id, userId: user.id, roleId: 'ORG_OWNER', joinTime: fmtTime(),
  });
  persist();
  audit(user, 'ADD_NAMESPACE', 'SYS', id, '创建组织空间');
  return ns;
}

function updateNamespace(user, namespaceId, patch) {
  const ns = getNamespace(namespaceId);
  if (!ns) throw new HttpError(404, '空间不存在', 'NOT_FOUND');
  assertNamespaceAccess(user, namespaceId, ROLES.ORG_ADMIN.level);

  if (patch.namespaceId && patch.namespaceId !== namespaceId) {
    const newId = String(patch.namespaceId).trim().toLowerCase();
    if (!isValidName(newId)) throw new HttpError(400, '空间标识格式不合法', 'INVALID_NAME');
    if (getNamespace(newId)) throw new HttpError(409, '该空间标识已存在', 'NAMESPACE_EXISTS');
    db().namespaceMembers.forEach((m) => { if (m.namespaceId === namespaceId) m.namespaceId = newId; });
    db().packages.forEach((p) => { if (p.namespace === namespaceId) p.namespace = newId; });
    ns.namespaceId = newId;
    persist();
    audit(user, 'RENAME_NAMESPACE', 'NAMESPACE', newId, `空间 ${namespaceId} 更名为 ${newId}`);
    return ns;
  }

  if (patch.description !== undefined) {
    ns.description = String(patch.description).slice(0, 200);
    audit(user, 'EDIT_NAMESPACE_DESC', 'NAMESPACE', namespaceId, `描述更新为：${ns.description || '(空)'}`);
  }
  if (patch.settings && patch.settings.publishConfirmation !== undefined) {
    ns.settings.publishConfirmation = !!patch.settings.publishConfirmation;
    audit(
      user, 'SETTING_PUBLISH_CONFIRMATION', 'NAMESPACE', namespaceId,
      ns.settings.publishConfirmation ? '开启发布确认' : '关闭发布确认',
    );
  }
  persist();
  return ns;
}

function deleteNamespace(user, namespaceId) {
  const ns = getNamespace(namespaceId);
  if (!ns) throw new HttpError(404, '空间不存在', 'NOT_FOUND');
  if (namespaceId === 'global') throw new HttpError(400, '内置空间 global 不允许删除', 'PROTECTED');
  if (ns.type === 'USER') throw new HttpError(400, '用户空间不支持删除', 'PROTECTED');
  assertNamespaceAccess(user, namespaceId, ROLES.ORG_OWNER.level);
  const count = packageCount(namespaceId);
  if (count > 0) {
    throw new HttpError(400, `空间内仍有 ${count} 个软件包，请先清理后再删除`, 'NOT_EMPTY');
  }
  db().namespaces = db().namespaces.filter((n) => n.namespaceId !== namespaceId);
  db().namespaceMembers = db().namespaceMembers.filter((m) => m.namespaceId !== namespaceId);
  persist();
  audit(user, 'REMOVE_NAMESPACE', 'NAMESPACE', namespaceId, '删除空间');
}

/* ------------------------------------------------------------------ *
 * 空间成员
 * ------------------------------------------------------------------ */

function listMembers(namespaceId) {
  return db()
    .namespaceMembers.filter((m) => m.namespaceId === namespaceId)
    .map((m) => {
      const u = findUserById(m.userId);
      return {
        userId: m.userId,
        username: u ? u.username : 'unknown',
        realName: u ? u.realName : '',
        email: u ? u.email : '',
        hue: u ? u.hue : 200,
        roleId: m.roleId,
        roleDisplayName: ROLES[m.roleId] ? ROLES[m.roleId].name : m.roleId,
        joinTime: m.joinTime,
      };
    })
    .sort((a, b) => (ROLES[b.roleId] ? ROLES[b.roleId].level : 0) - (ROLES[a.roleId] ? ROLES[a.roleId].level : 0));
}

function addMember(user, namespaceId, { userId, username, roleId = 'ORG_MEMBER' }) {
  assertNamespaceAccess(user, namespaceId, ROLES.ORG_ADMIN.level);
  if (!ROLES[roleId]) throw new HttpError(400, '角色不合法', 'INVALID_ROLE');
  const target = userId ? findUserById(userId) : findUserByUsername(username);
  if (!target) throw new HttpError(404, '用户不存在', 'USER_NOT_FOUND');
  if (roleOf(namespaceId, target.id)) throw new HttpError(409, '该用户已是空间成员', 'MEMBER_EXISTS');
  db().namespaceMembers.push({
    id: nextId('member'), namespaceId, userId: target.id, roleId, joinTime: fmtTime(),
  });
  persist();
  audit(user, 'ADD_ORG_MEMBER', 'NAMESPACE', namespaceId, `添加成员 ${target.username}（${ROLES[roleId].name}）`);
  return listMembers(namespaceId);
}

function changeMemberRole(user, namespaceId, targetUserId, roleId) {
  assertNamespaceAccess(user, namespaceId, ROLES.ORG_ADMIN.level);
  if (!ROLES[roleId]) throw new HttpError(400, '角色不合法', 'INVALID_ROLE');
  const m = db().namespaceMembers.find(
    (x) => x.namespaceId === namespaceId && x.userId === Number(targetUserId),
  );
  if (!m) throw new HttpError(404, '成员不存在', 'NOT_FOUND');
  if (m.roleId === 'ORG_OWNER' && roleId !== 'ORG_OWNER') {
    const owners = db().namespaceMembers.filter(
      (x) => x.namespaceId === namespaceId && x.roleId === 'ORG_OWNER',
    );
    if (owners.length <= 1) throw new HttpError(400, '空间至少需要保留一名所有者', 'LAST_OWNER');
  }
  const before = m.roleId;
  m.roleId = roleId;
  persist();
  const target = findUserById(m.userId);
  audit(
    user, 'CHANGE_ORG_MEMBER_ROLE', 'NAMESPACE', namespaceId,
    `${target ? target.username : m.userId} 角色 ${ROLES[before].name} → ${ROLES[roleId].name}`,
  );
  return listMembers(namespaceId);
}

function removeMember(user, namespaceId, targetUserId) {
  assertNamespaceAccess(user, namespaceId, ROLES.ORG_ADMIN.level);
  const m = db().namespaceMembers.find(
    (x) => x.namespaceId === namespaceId && x.userId === Number(targetUserId),
  );
  if (!m) throw new HttpError(404, '成员不存在', 'NOT_FOUND');
  if (m.roleId === 'ORG_OWNER') {
    const owners = db().namespaceMembers.filter(
      (x) => x.namespaceId === namespaceId && x.roleId === 'ORG_OWNER',
    );
    if (owners.length <= 1) throw new HttpError(400, '空间至少需要保留一名所有者', 'LAST_OWNER');
  }
  db().namespaceMembers = db().namespaceMembers.filter((x) => x.id !== m.id);
  persist();
  const target = findUserById(m.userId);
  audit(user, 'REMOVE_ORG_MEMBER', 'NAMESPACE', namespaceId, `移除成员 ${target ? target.username : m.userId}`);
  return listMembers(namespaceId);
}

module.exports = {
  init, db, persist, flush, nextId,
  publicUser, findUserById, findUserByUsername, listUsers,
  login, resolveSession, logout,
  isSystemAdmin, roleOf, accessOf, assertNamespaceAccess,
  audit, listAudits,
  getNamespace, listNamespaces, createNamespace, updateNamespace, deleteNamespace,
  memberCount, packageCount,
  listMembers, addMember, changeMemberRole, removeMember,
  ROLES,
};
