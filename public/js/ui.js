/* 翼辉云枢 · UI 组件工厂（对齐 Ant Design Vue 5 外观） */

/* ---------- 转义 ---------- */
export function escapeHtml(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function escAttr(s) {
  return escapeHtml(s);
}

/* ---------- 图标（内联 SVG，与 antd 图标语义对应） ---------- */
const ICONS = {
  package: '<path d="M12 2l9 4.5v11L12 22l-9-4.5v-11L12 2zm0 2.2L5.6 7.4 12 10.6l6.4-3.2L12 4.2zM5 9v7.5l6 3V12L5 9zm14 0l-6 3v7.5l6-3V9z"/>',
  appstore: '<path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z"/>',
  user: '<path d="M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4.4 0-8 2.5-8 5.5V21h16v-1.5c0-3-3.6-5.5-8-5.5z"/>',
  setting: '<path d="M12 8a4 4 0 100 8 4 4 0 000-8zm0 6a2 2 0 110-4 2 2 0 010 4zm8.9-2a7 7 0 00-.1-1.2l2-1.5-2-3.5-2.4 1a7 7 0 00-2-1.2L16 3h-4l-.4 2.6a7 7 0 00-2 1.2l-2.4-1-2 3.5 2 1.5a7 7 0 000 2.4l-2 1.5 2 3.5 2.4-1a7 7 0 002 1.2L12 21h4l.4-2.6a7 7 0 002-1.2l2.4 1 2-3.5-2-1.5c.1-.4.1-.8.1-1.2z"/>',
  plus: '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
  search: '<path d="M15.5 14h-.8l-.3-.3a6.5 6.5 0 10-.7.7l.3.3v.8l5 5 1.5-1.5-5-5zm-6 0a4.5 4.5 0 110-9 4.5 4.5 0 010 9z"/>',
  close: '<path d="M18.3 5.7L12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z" transform="translate(1 0)"/>',
  download: '<path d="M12 3v10.6l3.3-3.3 1.4 1.4-5.7 5.7-5.7-5.7 1.4-1.4 3.3 3.3V3h2zM5 19h14v2H5v-2z"/>',
  eye: '<path d="M12 5C6.5 5 2.2 9.4 1 12c1.2 2.6 5.5 7 11 7s9.8-4.4 11-7c-1.2-2.6-5.5-7-11-7zm0 12a5 5 0 110-10 5 5 0 010 10zm0-2a3 3 0 100-6 3 3 0 000 6z"/>',
  edit: '<path d="M3 17.2V21h3.8L17.9 9.9l-3.8-3.8L3 17.2zM20.7 7.1a1 1 0 000-1.4l-2.4-2.4a1 1 0 00-1.4 0l-1.8 1.8 3.8 3.8 1.8-1.8z"/>',
  trash: '<path d="M6 7h12l-1 14H7L6 7zm3-3h6l1 2h4v2H4V6h4l1-2z"/>',
  star: '<path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8-6.1-3.4-6.1 3.4 1.4-6.8L2.2 9.1l6.9-.8L12 2z"/>',
  starFill: '<path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8-6.1-3.4-6.1 3.4 1.4-6.8L2.2 9.1l6.9-.8L12 2z" fill="currentColor"/>',
  login: '<path d="M10 3h9a1 1 0 011 1v16a1 1 0 01-1 1h-9v-2h8V5h-8V3zm1.6 5.6L13 10l-3 3H3v2h7l3 3-1.4 1.4L6.2 14H3v-2h3.2l5.4-3.4z" transform="scale(.9) translate(1.5 1.5)"/>',
  logout: '<path d="M9 3h9a1 1 0 011 1v16a1 1 0 01-1 1H9v-2h8V5H9V3zm.6 5.6L11 10l-2 2h8v2H9l2 2-1.4 1.4L4.2 13H3v-2h1.2l5.4-3.4z" transform="scale(-1 .9) translate(-22 1.5)"/>',
  copy: '<path d="M8 3h11a1 1 0 011 1v13h-2V5H8V3zM5 7h11a1 1 0 011 1v12a1 1 0 01-1 1H5a1 1 0 01-1-1V8a1 1 0 011-1zm1 2v10h9V9H6z"/>',
  check: '<path d="M9.5 17.6L4 12l1.4-1.4 4.1 4.1L18.6 5.6 20 7 9.5 17.6z"/>',
  chevronRight: '<path d="M9 5l7 7-7 7-1.4-1.4L13.2 12 7.6 6.4 9 5z"/>',
  chevronDown: '<path d="M5 9l7 7 7-7-1.4-1.4L12 13.2 6.4 7.6 5 9z"/>',
  refresh: '<path d="M12 4a8 8 0 017.4 5H22l-3.8 4L14 9h3.2A6 6 0 106 12H4a8 8 0 018-8zm8 8a8 8 0 01-15.4 3H2l3.8-4L10 15H6.8a6 6 0 1010.4-3H20z"/>',
  alert: '<path d="M12 2l10 18H2L12 2zm0 5l-6 11h12L12 7zm-1 4h2v4h-2v-4zm0 5h2v2h-2v-2z"/>',
  clock: '<path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 2a8 8 0 110 16 8 8 0 010-16zm-1 3v6l5 3 .8-1.3-4.3-2.6V7H11z"/>',
  link: '<path d="M10.6 13.4a1 1 0 001.4 0l4-4a3 3 0 10-4.2-4.2l-1.5 1.5 1.4 1.4L13.2 6.6a1 1 0 011.4 1.4l-4 4a1 1 0 000 1.4zm2.8-2.8a1 1 0 00-1.4 0l-4 4a3 3 0 104.2 4.2l1.5-1.5-1.4-1.4-1.5 1.5a1 1 0 01-1.4-1.4l4-4a1 1 0 000-1.4z"/>',
  folder: '<path d="M3 5h6l2 2h10v12H3V5z"/>',
  file: '<path d="M6 2h9l5 5v15H6V2zm8 1.5V8h4.5L14 3.5zM8 11h8v2H8v-2zm0 4h8v2H8v-2z"/>',
  windows: '<path d="M3 5.5l7.5-1v7H3v-6zm9-1.2L21 3v8.5h-9V4.3zM3 12.5h7.5v7L3 18.5v-6zm9 0h9V21l-9-1.3v-7.2z"/>',
  linux: '<path d="M12 2c3 0 4 2.5 4 5 0 2 1.5 4 3 6.5 1.2 2 1 4.5-1 4.5-1.5 0-2-1-3.5-1S13 19 12 20c-1-1-1-3-2.5-3S8 18 6.5 18c-2 0-2.2-2.5-1-4.5C7 11 8.5 9 8.5 7c0-2.5 1-5 3.5-5zm-2 6a1.2 1.2 0 100 2.4A1.2 1.2 0 0010 8zm4 0a1.2 1.2 0 100 2.4A1.2 1.2 0 0014 8z"/>',
  apple: '<path d="M16.5 12.5c0-2.5 2-3.7 2.1-3.8-1.1-1.7-2.9-1.9-3.6-1.9-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.9-1.7 0-3.3 1-4.1 2.5-1.8 3-.5 7.5 1.2 10 .9 1.2 1.9 2.5 3.2 2.5 1.3-.1 1.8-.8 3.4-.8s2 .8 3.3.8c1.4 0 2.3-1.2 3.1-2.4 1-1.4 1.4-2.8 1.4-2.8s-2.8-1.1-2.9-4.1zM14 5.3c.7-.9 1.2-2.1 1.1-3.3-1 0-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.2 1.1.1 2.3-.6 3-1.5z"/>',
  android: '<path d="M6 9h12v8a2 2 0 01-2 2H8a2 2 0 01-2-2V9zm-3 1h2v5H3v-5zm16 0h2v5h-2v-5zM8.5 5l-1-2 1-.5 1.1 2.2a6 6 0 014.8 0L15.5 2.5l1 .5-1 2a6 6 0 012.5 3H6a6 6 0 012.5-3zM9.5 11.5a.8.8 0 100 1.6.8.8 0 000-1.6zm5 0a.8.8 0 100 1.6.8.8 0 000-1.6z"/>',
  robot: '<path d="M12 2a2 2 0 011 3.7V8h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2v-8a2 2 0 012-2h6V5.7A2 2 0 0112 2zM8.5 12a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm7 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3z"/>',
  sync: '<path d="M12 4a8 8 0 017.4 5H22l-3.8 4L14 9h3.2A6 6 0 106 12H4a8 8 0 018-8zm8 8a8 8 0 01-15.4 3H2l3.8-4L10 15H6.8a6 6 0 1010.4-3H20z"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4-2v-4L3 5z"/>',
  up: '<path d="M12 5l7 7-1.4 1.4L13 8.8V19h-2V8.8l-4.6 4.6L5 12l7-7z"/>',
  down: '<path d="M12 19l-7-7 1.4-1.4L11 15.2V5h2v10.2l4.6-4.6L19 12l-7 7z"/>',
};

export function icon(name, size = 14, cls = '') {
  const path = ICONS[name] || ICONS.file;
  return `<span class="anticon ${cls}"><svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true">${path}</svg></span>`;
}

/* ---------- 按钮 ---------- */
export function btn(text, { type = 'default', size = '', icon: ic = '', block = false, disabled = false, attrs = '', loading = false } = {}) {
  const cls = ['ant-btn'];
  if (type !== 'default') cls.push(`ant-btn-${type}`);
  if (size === 'sm') cls.push('ant-btn-sm');
  if (size === 'lg') cls.push('ant-btn-lg');
  if (block) cls.push('ant-btn-block');
  if (loading) cls.push('is-loading');
  return `<button class="${cls.join(' ')}" ${disabled ? 'disabled' : ''} ${attrs}>${loading ? '<span class="ant-spin"><span class="ant-spin-dot"></span></span>' : (ic ? icon(ic, 14) : '')}<span>${escapeHtml(text)}</span></button>`;
}

export function iconBtn(ic, { type = 'text', size = '', attrs = '', tip = '' } = {}) {
  const cls = ['ant-btn', `ant-btn-${type}`, 'ant-btn-icon-only'];
  if (size === 'sm') cls.push('ant-btn-sm');
  return `<button class="${cls.join(' ')}" title="${escAttr(tip)}" ${attrs}>${icon(ic, size === 'sm' ? 12 : 14)}</button>`;
}

/* ---------- 标签 ---------- */
const TAG_TONES = {
  success: 'ant-tag-success', processing: 'ant-tag-processing', error: 'ant-tag-error',
  warning: 'ant-tag-warning', purple: 'ant-tag-purple', cyan: 'ant-tag-cyan', gold: 'ant-tag-gold',
};

export function tag(text, tone = 'default', { closable = false, attrs = '' } = {}) {
  const cls = ['ant-tag', TAG_TONES[tone] || ''].filter(Boolean).join(' ');
  return `<span class="${cls}" ${attrs}>${escapeHtml(text)}${closable ? icon('close', 10, 'tag-close') : ''}</span>`;
}

export function acoTag(text, attrs = '') {
  return `<span class="aco-tag" ${attrs}>${escapeHtml(text)}</span>`;
}

/* ---------- 头像 ---------- */
const AVATAR_TONES = ['#1677ff', '#52c41a', '#fa8c16', '#9254de', '#08979c', '#eb2f96', '#faad14'];

export function avatar(name, size = '') {
  const ch = String(name || '?').trim().charAt(0).toUpperCase();
  let hash = 0;
  for (const c of String(name || '')) hash = (hash * 31 + c.charCodeAt(0)) % 997;
  const color = AVATAR_TONES[hash % AVATAR_TONES.length];
  return `<span class="ant-avatar ${size ? `ant-avatar-${size}` : ''}" style="background:${color}">${escapeHtml(ch)}</span>`;
}

/* ---------- 空状态 ---------- */
export function emptyHtml(text = '暂无数据', extra = '') {
  const svg = `<svg viewBox="0 0 100 64" fill="none"><ellipse cx="50" cy="56" rx="34" ry="5" fill="currentColor" opacity=".15"/><path d="M28 44L38 20h24l10 24" stroke="currentColor" stroke-width="2" fill="#fff"/><rect x="24" y="42" width="52" height="10" rx="2" fill="currentColor" opacity=".3"/><circle cx="50" cy="32" r="4" fill="currentColor"/></svg>`;
  return `<div class="ant-empty"><div class="ant-empty-image">${svg}</div><p>${escapeHtml(text)}</p>${extra}</div>`;
}

/* ---------- 全局提示 message ---------- */
const MSG_ROOT = () => document.getElementById('message-root');

export function message(text, type = 'info', duration = 2200) {
  const root = MSG_ROOT();
  if (!root) return;
  const el = document.createElement('div');
  el.className = `ant-message-notice-content is-${type}`;
  const ic = type === 'success' ? 'check' : type === 'error' ? 'close' : type === 'warning' ? 'alert' : 'alert';
  el.innerHTML = `${icon(ic, 16)}<span>${escapeHtml(text)}</span>`;
  root.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, duration);
}

message.success = (t, d) => message(t, 'success', d);
message.error = (t, d) => message(t, 'error', d);
message.warning = (t, d) => message(t, 'warning', d);
message.info = (t, d) => message(t, 'info', d);

/* ---------- 弹窗 ---------- */
export function modal({
  title, width = '', content = '', footer = '', maskClosable = true, center = false, className = '', onClose = null,
}) {
  const root = document.getElementById('modal-root');
  const mask = document.createElement('div');
  mask.className = `aco-modal-mask${center ? ' is-center' : ''} ${className}`.trim();
  mask.innerHTML = `<div class="ant-modal ${width === 'lg' ? 'ant-modal-lg' : width === 'sm' ? 'ant-modal-sm' : ''}">
    <div class="ant-modal-content">
      <span class="ant-modal-close" role="button" aria-label="关闭">${icon('close', 14)}</span>
      <div class="ant-modal-header"><div class="ant-modal-title">${escapeHtml(title || '')}</div></div>
      <div class="ant-modal-body">${content}</div>
      ${footer ? `<div class="ant-modal-footer">${footer}</div>` : ''}
    </div>
  </div>`;

  const close = () => { mask.remove(); if (onClose) onClose(); };
  mask.querySelector('.ant-modal-close').addEventListener('click', close);
  if (maskClosable) mask.addEventListener('click', (e) => { if (e.target === mask) close(); });
  root.appendChild(mask);
  return { mask, close };
}

export function confirmModal({ title = '提示', content = '', okText = '确 定', cancelText = '取 消', onOk = null, danger = false }) {
  const m = modal({
    title,
    width: 'sm',
    maskClosable: false,
    content: `<p>${escapeHtml(content)}</p>`,
    footer: `<button class="ant-btn" data-cancel>${escapeHtml(cancelText)}</button>
      <button class="ant-btn ${danger ? 'ant-btn-dangerous ant-btn-primary' : 'ant-btn-primary'}" data-ok>${escapeHtml(okText)}</button>`,
  });
  m.mask.querySelector('[data-cancel]').addEventListener('click', m.close);
  m.mask.querySelector('[data-ok]').addEventListener('click', async () => {
    if (onOk) await onOk();
    m.close();
  });
  return m;
}

/* ---------- 分页 ---------- */
function pageNumbers(current, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, current, current - 1, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((n) => set.add(n));
  if (current >= pages - 2) [pages - 3, pages - 2, pages - 1].forEach((n) => set.add(n));
  const nums = [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out = [];
  nums.forEach((n, i) => { if (i > 0 && n - nums[i - 1] > 1) out.push('...'); out.push(n); });
  return out;
}

export function paginationHtml({ total = 0, pageNum = 1, pageSize = 20, pages = 1 } = {}) {
  if (total <= 0) return '';
  const cur = Math.min(pageNum, pages || 1);
  const items = pageNumbers(cur, pages || 1).map((n) => (n === '...'
    ? '<span class="ant-pagination-jump">…</span>'
    : `<span class="ant-pagination-item${n === cur ? ' is-active' : ''}" data-page="${n}">${n}</span>`));
  return `<nav class="ant-pagination">
    <span class="ant-pagination-total">共 ${total} 条</span>
    <span class="ant-pagination-prev${cur <= 1 ? ' is-disabled' : ''}" data-page="${cur - 1}">${icon('chevronRight', 12, 'flip')}</span>
    ${items.join('')}
    <span class="ant-pagination-next${cur >= (pages || 1) ? ' is-disabled' : ''}" data-page="${cur + 1}">${icon('chevronRight', 12)}</span>
  </nav>`;
}

export function attachPagination(root, onPage) {
  root.querySelectorAll('.ant-pagination [data-page]').forEach((el) => {
    const page = Number(el.dataset.page);
    if (!page || el.classList.contains('is-disabled')) return;
    el.addEventListener('click', () => onPage(page));
  });
}

/* ---------- 分段控制器 ---------- */
export function segmented(options, value, attrs = '') {
  return `<div class="ant-segmented" ${attrs}>${options.map((o) => `<span class="ant-segmented-item${o.value === value ? ' is-selected' : ''}" data-value="${escAttr(o.value)}">${escapeHtml(o.label)}</span>`).join('')}</div>`;
}

export function attachSegmented(root, onChange) {
  root.querySelectorAll('.ant-segmented-item').forEach((el) => {
    el.addEventListener('click', () => {
      if (el.classList.contains('is-selected')) return;
      el.parentElement.querySelectorAll('.ant-segmented-item').forEach((s) => s.classList.remove('is-selected'));
      el.classList.add('is-selected');
      onChange(el.dataset.value);
    });
  });
}

/* ---------- 开关 ---------- */
export function switchHtml(checked, { attrs = '', label = '' } = {}) {
  return `<span class="ant-switch${checked ? ' is-checked' : ''}" ${attrs}><span class="ant-switch-handle"></span>${label ? `<span class="ant-switch-inner">${escapeHtml(label)}</span>` : ''}</span>`;
}

export function attachSwitch(root, onChange, selector = '.ant-switch:not(.is-disabled)') {
  root.querySelectorAll(selector).forEach((el) => {
    if (el.dataset.bound === '1') return;
    el.dataset.bound = '1';
    el.addEventListener('click', () => {
      const next = !el.classList.contains('is-checked');
      el.classList.toggle('is-checked', next);
      onChange(next, el);
    });
  });
}

/* ---------- 复选 ---------- */
export function checkbox(text, checked = false, { attrs = '', value = '' } = {}) {
  return `<label class="ant-checkbox-wrapper${attrs.includes('disabled') ? ' is-disabled' : ''}" ${attrs}>
    <span class="ant-checkbox${checked ? ' is-checked' : ''}"></span>${text ? `<span>${escapeHtml(text)}</span>` : ''}<input type="checkbox" hidden value="${escAttr(value)}">
  </label>`;
}

/* ---------- 表单 ---------- */
export function formItem({ label, required = false, control, extra = '' }) {
  return `<div class="ant-form-item">
    ${label ? `<div class="ant-form-item-label${required ? ' is-required' : ''}">${escapeHtml(label)}</div>` : ''}
    <div class="form-control">${control}</div>
    ${extra ? `<div class="ant-form-item-extra">${extra}</div>` : ''}
  </div>`;
}

export function input({ value = '', placeholder = '请输入', type = 'text', name = '', attrs = '', icon: ic = '' } = {}) {
  if (ic) {
    return `<span class="ant-input-affix-wrapper"><span class="anticon">${icon(ic, 14)}</span><input class="ant-input" name="${escAttr(name)}" type="${type}" placeholder="${escAttr(placeholder)}" value="${escAttr(value)}" ${attrs}></span>`;
  }
  return `<input class="ant-input" name="${escAttr(name)}" type="${type}" placeholder="${escAttr(placeholder)}" value="${escAttr(value)}" ${attrs}>`;
}

export function textarea({ value = '', placeholder = '请输入', name = '', rows = 4, attrs = '', maxlength = '' } = {}) {
  return `<textarea class="ant-input" name="${escAttr(name)}" rows="${rows}" maxlength="${maxlength}" placeholder="${escAttr(placeholder)}" ${attrs}>${escAttr(value)}</textarea>`;
}

export function select({ value = '', options = [], name = '', attrs = '' } = {}) {
  return `<span class="ant-select"><select name="${escAttr(name)}" ${attrs}>${options.map((o) => `<option value="${escAttr(o.value)}"${String(o.value) === String(value) ? ' selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}</select></span>`;
}

/* ---------- 表格 ---------- */
export function tableHtml({ columns, rows, emptyText = '暂无数据' }) {
  if (!rows.length) return `<div class="ant-table-empty-wrap">${emptyHtml(emptyText)}</div>`;
  const head = `<tr>${columns.map((c) => `<th${c.width ? ` style="width:${c.width}"` : ''} class="${c.ellipsis ? 'ant-table-cell-ellipsis' : ''}">${escapeHtml(c.title)}</th>`).join('')}</tr>`;
  const body = rows.map((r, i) => `<tr>${columns.map((c) => `<td class="${c.ellipsis ? 'ant-table-cell-ellipsis' : ''}">${c.render ? c.render(r, i) : escapeHtml(r[c.key] ?? '-')}</td>`).join('')}</tr>`).join('');
  return `<table class="ant-table"><thead class="ant-table-thead">${head}</thead><tbody class="ant-table-tbody">${body}</tbody></table>`;
}

/* ---------- 加载 ---------- */
export function loadingPanel() {
  return `<div class="ant-table-loading-wrap aco-flex-center"><span class="ant-spin"><span class="ant-spin-dot"></span></span></div>`;
}

/* ---------- 复制（含非安全上下文降级） ---------- */
export async function copyText(text) {
  if (!text) {
    message('没有可复制的内容', 'warning');
    return false;
  }
  // 1) 现代 API
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      message('已复制到剪贴板', 'success');
      return true;
    } catch { /* 继续降级 */ }
  }
  // 2) execCommand 兜底（http 环境 / 无权限时可用）
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (ok) {
      message('已复制到剪贴板', 'success');
      return true;
    }
  } catch { /* 继续降级 */ }
  // 3) 最终降级：提示手动复制
  message('复制受限，请手动选择复制', 'warning');
  return false;
}
