'use strict';

const crypto = require('node:crypto');

/** 业务异常，带上 HTTP 状态码 */
class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || 'ERROR';
  }
}

const pad = (n) => String(n).padStart(2, '0');

/** 统一的时间格式：YYYY-MM-DD HH:mm:ss（与原平台一致） */
function fmtTime(d = new Date()) {
  const t = d instanceof Date ? d : new Date(d);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ` +
    `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
}

function fmtDay(d = new Date()) {
  const t = d instanceof Date ? d : new Date(d);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function uuid() {
  return crypto.randomUUID();
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function randomToken() {
  return crypto.randomBytes(24).toString('hex');
}

const PBKDF2_ITERATIONS = 10000;

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, 'sha256').toString('hex');
}

function verifyPassword(password, salt, expected) {
  const actual = hashPassword(password, salt);
  const a = Buffer.from(actual, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** SEMVER：主.次.修订，允许 -prerelease 与 +build 后缀 */
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;

function isValidVersion(v) {
  return typeof v === 'string' && v.length <= 64 && SEMVER_RE.test(v.trim());
}

function parseVersion(v) {
  const m = SEMVER_RE.exec(String(v || '').trim());
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] || '',
  };
}

/** 版本倒序比较（新的在前） */
function compareVersionDesc(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa && !pb) return String(b).localeCompare(String(a));
  if (!pa) return 1;
  if (!pb) return -1;
  if (pa.major !== pb.major) return pb.major - pa.major;
  if (pa.minor !== pb.minor) return pb.minor - pa.minor;
  if (pa.patch !== pb.patch) return pb.patch - pa.patch;
  if (pa.prerelease === pb.prerelease) return 0;
  if (!pa.prerelease) return -1;      // 正式版排在有预发布号的前面
  if (!pb.prerelease) return 1;
  return pb.prerelease.localeCompare(pa.prerelease);
}

function maxVersion(list) {
  const sorted = [...list].sort(compareVersionDesc);
  return sorted[0] || null;
}

const NAME_RE = /^[a-z0-9][a-z0-9-_]{0,62}$/;

function isValidName(name) {
  return typeof name === 'string' && NAME_RE.test(name);
}

function humanSize(bytes) {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(2)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function paginate(list, pageNum, pageSize) {
  const total = list.length;
  const size = Math.min(Math.max(Number(pageSize) || 20, 1), 200);
  const pages = Math.max(Math.ceil(total / size), 1);
  const page = Math.min(Math.max(Number(pageNum) || 1, 1), pages);
  const start = (page - 1) * size;
  return {
    slice: list.slice(start, start + size),
    meta: { total, pageNum: page, pageSize: size, pages },
  };
}

/** 固定种子的伪随机，仅用于生成可复现的示例数据 */
function seededRandom(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

module.exports = {
  HttpError,
  fmtTime,
  fmtDay,
  daysAgo,
  uuid,
  sha256,
  randomToken,
  hashPassword,
  verifyPassword,
  isValidVersion,
  parseVersion,
  compareVersionDesc,
  maxVersion,
  isValidName,
  humanSize,
  paginate,
  seededRandom,
};
