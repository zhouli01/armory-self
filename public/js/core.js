/* 翼辉云枢 · 共享状态 / 路由 / 工具 */

import { escapeHtml, emptyHtml } from './ui.js';

export const state = {
  user: null,
  meta: null,
};

/* ---------- 路由（hash：#/armory/...） ---------- */
export function go(path) {
  const next = `#${path}`;
  if (location.hash === next) {
    window.dispatchEvent(new Event('hashchange'));
  } else {
    location.hash = next;
  }
}

export function parseRoute() {
  const raw = String(location.hash || '').replace(/^#/, '') || '/armory/package';
  const idx = raw.indexOf('?');
  const path = (idx === -1 ? raw : raw.slice(0, idx)) || '/armory/package';
  const query = {};
  new URLSearchParams(idx === -1 ? '' : raw.slice(idx + 1)).forEach((v, k) => { query[k] = v; });
  const parts = path.split('/').filter(Boolean);
  return { path, query, parts };
}

export function setQuery(patch) {
  const cur = parseRoute();
  const q = { ...cur.query, ...patch };
  const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== '' && v !== undefined));
  go(`${cur.path}?${qs.toString()}`);
}

/* ---------- 格式化 ---------- */
export function humanSize(bytes) {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(b / 1024 >= 100 ? 0 : 1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(b / 1024 ** 2 >= 100 ? 0 : 1)} MB`;
  if (b < 1024 ** 4) return `${(b / 1024 ** 3).toFixed(b / 1024 ** 3 >= 100 ? 0 : 1)} GB`;
  return `${(b / 1024 ** 4).toFixed(1)} TB`;
}

export function fmtDate(v) {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function fromNow(v) {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  if (diff < 365 * 86_400_000) return `${Math.floor(diff / (30 * 86_400_000))} 个月前`;
  return `${Math.floor(diff / (365 * 86_400_000))} 年前`;
}

export function timeCell(v) {
  if (!v) return '-';
  return `<span class="time-cell" title="${fmtDate(v)}">${fromNow(v)}</span>`;
}

/* 空间标签：全局空间 / 我的空间 / 用户空间 */
export function spaceLabel(type) {
  const text = type === 'personal' ? '用户空间' : type === 'global' ? '全局空间' : '我的空间';
  return `<span class="org-space-label ${escapeHtml(type)}">${text}</span>`;
}

export const ROLE_LABEL = {
  ORG_OWNER: '所有者',
  ORG_ADMIN: '管理员',
  ORG_MEMBER: '成员',
  ORG_GUEST: '访客',
  SYS_ADMIN: '系统管理员',
};

export const ACCESS_LABEL = {
  Open: '公开访问', Public: '公开', Visible: '可见', Private: '私有', Restricted: '受限',
};

export function roleTag(role) {
  const tone = { ORG_OWNER: 'processing', ORG_ADMIN: 'purple', ORG_MEMBER: 'cyan', ORG_GUEST: 'default', SYS_ADMIN: 'purple' }[role] || 'default';
  return `<span class="user-org-card-tag tag ${role}_container"><span class="name">${escapeHtml(ROLE_LABEL[role] || role)}</span></span>`;
}

/* ---------- 页面容器（对齐 AcoPageView） ---------- */
export function pageView({ title = '', breadcrumb = '', headerExtra = '', content = '', contentClass = '' } = {}) {
  return `<div class="aco-page-view">
    ${breadcrumb ? `<div class="aco-breadcrumb">${breadcrumb}</div>` : ''}
    <div class="aco-page-view-header-info">
      ${title || headerExtra ? `<div class="aco-page-view-header-wrapper">
        ${title ? `<div class="aco-page-view-header-title">${title}</div>` : ''}
        ${headerExtra ? `<div class="aco-page-view-extra">${headerExtra}</div>` : ''}
      </div>` : ''}
    </div>
    <div class="aco-page-view-content ${contentClass}">${content}</div>
  </div>`;
}

export function errorPanel(message, retryHash = '') {
  return `<div class="ant-card"><div class="ant-card-body">${emptyHtml('加载失败', `
    <p class="aco-text-description">${escapeHtml(message)}</p>
    ${retryHash ? `<button class="ant-btn ant-btn-primary" style="margin-top:12px" data-goto="${retryHash}">重试</button>` : ''}`)}</div></div>`;
}

/* ---------- 轻量 Markdown ---------- */
function inlineMd(text) {
  let t = escapeHtml(text);
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return t;
}

export function markdownLite(md) {
  if (!md) return '<div class="ant-empty" style="padding:64px 0"><p>暂无 README</p></div>';
  const blocks = [];
  const text = String(md).replace(/\r\n/g, '\n').replace(/```([a-zA-Z0-9+#._-]*)\n([\s\S]*?)```/g, (m, lang, code) => {
    blocks.push(`<pre><code>${escapeHtml(code.replace(/\n$/, ''))}</code></pre>`);
    return `\u0000B${blocks.length - 1}\u0000`;
  });

  const out = [];
  let list = null;
  let inCode = false;
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };

  text.split('\n').forEach((raw) => {
    const line = raw.replace(/\s+$/, '');
    if (/^\u0000B\d+\u0000$/.test(line.trim())) { closeList(); out.push(blocks[Number(line.trim().slice(3, -1))]); return; }
    if (!line.trim()) { closeList(); return; }

    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      closeList();
      const lv = Math.min(h[1].length, 6);
      out.push(`<h${lv}>${inlineMd(h[2])}</h${lv}>`);
      return;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) { closeList(); out.push('<hr>'); return; }
    if (/^>\s?/.test(line)) { closeList(); out.push(`<blockquote>${inlineMd(line.replace(/^>\s?/, ''))}</blockquote>`); return; }

    const ul = /^[-*+]\s+(.*)$/.exec(line);
    if (ul) { if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inlineMd(ul[1])}</li>`); return; }

    const ol = /^\d+[.)]\s+(.*)$/.exec(line);
    if (ol) { if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inlineMd(ol[1])}</li>`); return; }

    closeList();
    out.push(`<p>${inlineMd(line)}</p>`);
  });
  closeList();
  return out.join('\n');
}
