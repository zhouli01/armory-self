/* 翼辉云枢 · 仓库管理：平台管理 / 架构管理 / 软件包审核 */

import { api } from './api.js';
import {
  escapeHtml, icon, tag, btn, emptyHtml, tableHtml, paginationHtml, attachPagination,
  loadingPanel, message, input, select, formItem, modal, confirmModal,
} from './ui.js';
import { go, setQuery, pageView, timeCell } from './core.js';
import { pkgDetailPath } from './views-armory.js';

const PMS_TABS = [
  { key: '/armory/pms/plats', label: '平台管理' },
  { key: '/armory/pms/arch', label: '架构管理' },
  { key: '/armory/pms/audit', label: '软件包审核' },
];

function pmsShell(active, toolbar, body) {
  return `<div class="aco-tabs">${PMS_TABS.map((t) => `<span class="aco-tab-item${t.key === active ? ' aco-tab-item-active' : ''}" data-tab="${t.key}">${t.label}</span>`).join('')}</div>
    <div class="aco-search-table-toolbar" style="margin:16px 0"><div class="toolbar-left">${toolbar}</div></div>
    ${body}`;
}

function bindTabs(mount) {
  mount.querySelectorAll('.aco-tabs [data-tab]').forEach((el) => el.addEventListener('click', () => go(el.dataset.tab)));
}

/* ------------------------------------------------------------------ *
 * 平台管理
 * ------------------------------------------------------------------ */

function platformDialog(row, onDone) {
  const isEdit = !!row;
  const m = modal({
    title: isEdit ? '编辑平台' : '新建平台',
    width: 'sm',
    content: `
      ${formItem({ label: '平台名称', required: true, control: input({ name: 'name', value: row?.name || '', placeholder: '请输入平台名称', attrs: 'maxlength="20"' }) })}
      ${formItem({ label: '排序', control: input({ name: 'sortNum', value: row?.sortNum ?? 9999, type: 'number' }) })}`,
    footer: `<button class="ant-btn" data-cancel>取 消</button><button class="ant-btn ant-btn-primary" data-ok>确 定</button>`,
  });
  m.mask.querySelector('[data-cancel]').addEventListener('click', m.close);
  m.mask.querySelector('[data-ok]').addEventListener('click', async () => {
    const name = m.mask.querySelector('[name="name"]').value.trim();
    const sortNum = Number(m.mask.querySelector('[name="sortNum"]').value) || 9999;
    if (!name) { message.warning('请输入平台名称'); return; }
    if (name.length > 20) { message.warning('平台名称不能超过 20 个字符'); return; }
    try {
      if (isEdit) await api.put(`/api/pms/plats/${row.id}`, { name, sortNum });
      else await api.post('/api/pms/plats', { name, sortNum });
      message.success(isEdit ? '编辑成功' : '新建成功');
      m.close();
      onDone();
    } catch (e) { message.error(e.message); }
  });
}

export async function renderPlatforms(mount, query) {
  mount.innerHTML = loadingPanel();
  const keyword = query.keyword || '';
  try {
    const res = await api.get('/api/pms/plats', { keyword, pageNum: query.pageNum || 1, pageSize: 20 });
    mount.innerHTML = pageView({
      content: pmsShell('/armory/pms/plats',
        `${btn('新建', { type: 'primary', icon: 'plus', attrs: 'data-act="create"' })}
         <span class="ant-input-affix-wrapper" style="max-width:240px"><input class="ant-input" id="kw" placeholder="平台名称" value="${escapeHtml(keyword)}"><span class="anticon">${icon('search', 14)}</span></span>`,
        `${tableHtml({
          emptyText: '暂无平台',
          columns: [
            { title: '平台名称', key: 'name', render: (p) => `<span style="font-weight:500">${escapeHtml(p.name)}</span>` },
            { title: '排序', key: 'sortNum' },
            { title: '创建时间', key: 'createTime', render: (p) => timeCell(p.createTime) },
            { title: '操作', key: 'ops', render: (p) => `<span class="ant-btn ant-btn-link ant-btn-sm" data-edit="${p.id}">编辑</span>
              <span class="ant-btn ant-btn-link ant-btn-sm" style="color:var(--ant-color-error)" data-del="${p.id}">删除</span>` },
          ],
          rows: res.list,
        })}
        <div style="margin-top:16px;display:flex;justify-content:flex-end">${paginationHtml(res)}</div>`),
    });
    bindTabs(mount);
    const kw = mount.querySelector('#kw');
    kw.addEventListener('keydown', (e) => { if (e.key === 'Enter') setQuery({ keyword: kw.value.trim(), pageNum: '' }); });
    attachPagination(mount, (p) => setQuery({ pageNum: p }));
    const reload = () => renderPlatforms(mount, query);
    mount.querySelector('[data-act="create"]').addEventListener('click', () => platformDialog(null, reload));
    mount.querySelectorAll('[data-edit]').forEach((el) => el.addEventListener('click', () => {
      const row = res.list.find((r) => String(r.id) === el.dataset.edit);
      platformDialog(row, reload);
    }));
    mount.querySelectorAll('[data-del]').forEach((el) => el.addEventListener('click', () => {
      const row = res.list.find((r) => String(r.id) === el.dataset.del);
      confirmModal({
        title: '删除平台',
        content: `确定删除平台「${row.name}」吗？删除后不可恢复。`,
        danger: true,
        onOk: async () => {
          try { await api.del(`/api/pms/plats/${row.id}`); message.success('删除成功'); reload(); }
          catch (e) { message.error(e.message); }
        },
      });
    }));
  } catch (err) {
    mount.innerHTML = pageView({ content: emptyHtml(`加载失败：${err.message}`) });
  }
}

/* ------------------------------------------------------------------ *
 * 架构管理
 * ------------------------------------------------------------------ */

function archDialog(row, onDone) {
  const isEdit = !!row;
  const m = modal({
    title: isEdit ? '编辑架构' : '新建架构',
    width: 'sm',
    content: `
      ${formItem({ label: '架构名称', required: true, control: input({ name: 'name', value: row?.name || '', placeholder: '请输入架构名称', attrs: 'maxlength="20"' }) })}
      ${formItem({ label: 'SylixOS 名称', control: input({ name: 'sylixName', value: row?.sylixName || '' }) })}
      ${formItem({ label: 'OCI 名称', control: input({ name: 'ociName', value: row?.ociName || '' }) })}
      ${formItem({ label: '描述', control: input({ name: 'description', value: row?.description || '', placeholder: '请输入描述' }) })}
      ${formItem({ label: '排序', control: input({ name: 'sortNum', value: row?.sortNum ?? 9999, type: 'number' }) })}`,
    footer: `<button class="ant-btn" data-cancel>取 消</button><button class="ant-btn ant-btn-primary" data-ok>确 定</button>`,
  });
  m.mask.querySelector('[data-cancel]').addEventListener('click', m.close);
  m.mask.querySelector('[data-ok]').addEventListener('click', async () => {
    const body = {
      name: m.mask.querySelector('[name="name"]').value.trim(),
      sylixName: m.mask.querySelector('[name="sylixName"]').value.trim(),
      ociName: m.mask.querySelector('[name="ociName"]').value.trim(),
      description: m.mask.querySelector('[name="description"]').value.trim(),
      sortNum: Number(m.mask.querySelector('[name="sortNum"]').value) || 9999,
    };
    if (!body.name) { message.warning('请输入架构名称'); return; }
    if (body.name.length > 20) { message.warning('架构名称不能超过 20 个字符'); return; }
    try {
      if (isEdit) await api.put(`/api/pms/arch/${row.id}`, body);
      else await api.post('/api/pms/arch', body);
      message.success(isEdit ? '编辑成功' : '新建成功');
      m.close();
      onDone();
    } catch (e) { message.error(e.message); }
  });
}

export async function renderArchs(mount, query) {
  mount.innerHTML = loadingPanel();
  const keyword = query.keyword || '';
  try {
    const res = await api.get('/api/pms/arch', { keyword, pageNum: query.pageNum || 1, pageSize: 20 });
    mount.innerHTML = pageView({
      content: pmsShell('/armory/pms/arch',
        `${btn('新建', { type: 'primary', icon: 'plus', attrs: 'data-act="create"' })}
         <span class="ant-input-affix-wrapper" style="max-width:240px"><input class="ant-input" id="kw" placeholder="架构名称" value="${escapeHtml(keyword)}"><span class="anticon">${icon('search', 14)}</span></span>`,
        `${tableHtml({
          emptyText: '暂无架构',
          columns: [
            { title: '架构名称', key: 'name', render: (a) => `<span style="font-weight:500">${escapeHtml(a.name)}</span>` },
            { title: 'SylixOS 名称', key: 'sylixName', render: (a) => a.sylixName || '-' },
            { title: 'OCI 名称', key: 'ociName', render: (a) => a.ociName || '-' },
            { title: '描述', key: 'description', ellipsis: true, render: (a) => a.description || '-' },
            { title: '排序', key: 'sortNum' },
            { title: '操作', key: 'ops', render: (a) => `<span class="ant-btn ant-btn-link ant-btn-sm" data-edit="${a.id}">编辑</span>
              <span class="ant-btn ant-btn-link ant-btn-sm" style="color:var(--ant-color-error)" data-del="${a.id}">删除</span>` },
          ],
          rows: res.list,
        })}
        <div style="margin-top:16px;display:flex;justify-content:flex-end">${paginationHtml(res)}</div>`),
    });
    bindTabs(mount);
    const kw = mount.querySelector('#kw');
    kw.addEventListener('keydown', (e) => { if (e.key === 'Enter') setQuery({ keyword: kw.value.trim(), pageNum: '' }); });
    attachPagination(mount, (p) => setQuery({ pageNum: p }));
    const reload = () => renderArchs(mount, query);
    mount.querySelector('[data-act="create"]').addEventListener('click', () => archDialog(null, reload));
    mount.querySelectorAll('[data-edit]').forEach((el) => el.addEventListener('click', () => {
      const row = res.list.find((r) => String(r.id) === el.dataset.edit);
      archDialog(row, reload);
    }));
    mount.querySelectorAll('[data-del]').forEach((el) => el.addEventListener('click', () => {
      const row = res.list.find((r) => String(r.id) === el.dataset.del);
      confirmModal({
        title: '删除架构',
        content: `确定删除架构「${row.name}」吗？删除后不可恢复。`,
        danger: true,
        onOk: async () => {
          try { await api.del(`/api/pms/arch/${row.id}`); message.success('删除成功'); reload(); }
          catch (e) { message.error(e.message); }
        },
      });
    }));
  } catch (err) {
    mount.innerHTML = pageView({ content: emptyHtml(`加载失败：${err.message}`) });
  }
}

/* ------------------------------------------------------------------ *
 * 软件包审核
 * ------------------------------------------------------------------ */

const SCAN_STATUS = {
  SCANNING: { label: '扫描中', tone: 'processing' },
  SCANNING_FAILED: { label: '扫描失败', tone: 'error' },
  PASSED: { label: '扫描通过', tone: 'success' },
};

export async function renderAudit(mount, query) {
  mount.innerHTML = loadingPanel();
  const keyword = query.keyword || '';
  const status = query.status || '';
  try {
    const res = await api.get('/api/pms/audit', { keyword, status, pageNum: query.pageNum || 1, pageSize: 10 });
    mount.innerHTML = pageView({
      content: pmsShell('/armory/pms/audit',
        `<span class="ant-input-affix-wrapper" style="max-width:220px"><input class="ant-input" id="kw" placeholder="软件包名称" value="${escapeHtml(keyword)}"><span class="anticon">${icon('search', 14)}</span></span>
         <span class="ant-select" style="max-width:160px"><select id="status-sel">
           <option value="">全部状态</option>
           ${Object.entries(SCAN_STATUS).map(([k, v]) => `<option value="${k}"${k === status ? ' selected' : ''}>${v.label}</option>`).join('')}
         </select></span>`,
        `${tableHtml({
          emptyText: '暂无待审核版本',
          columns: [
            { title: '软件包', key: 'fullName', render: (r) => `<a data-goto="${pkgDetailPath(r.namespace, r.name)}?tab=versions">@${escapeHtml(r.namespace)}/${escapeHtml(r.name)}</a>` },
            { title: '版本', key: 'version', render: (r) => `<span style="font-weight:500">${escapeHtml(r.version)}</span>` },
            { title: '扫描状态', key: 'scanStatus', render: (r) => { const s = SCAN_STATUS[r.scanStatus]; return s ? tag(s.label, s.tone) : tag('待扫描', 'default'); } },
            { title: '失败原因', key: 'failReason', ellipsis: true, render: (r) => r.failReason || '-' },
            { title: '提交人', key: 'creator', render: (r) => escapeHtml(r.creator || '-') },
            { title: '提交时间', key: 'time', render: (r) => timeCell(r.time) },
            { title: '操作', key: 'ops', render: (r) => (r.scanStatus === 'SCANNING_FAILED'
              ? '<span class="aco-text-description">扫描失败，无法审核</span>'
              : `<span class="ant-btn ant-btn-primary ant-btn-sm" data-approve="${r.namespace}|${r.name}|${r.version}">通过</span>`) },
          ],
          rows: res.list,
        })}
        <div style="margin-top:16px;display:flex;justify-content:flex-end">${paginationHtml(res)}</div>`),
    });
    bindTabs(mount);
    const kw = mount.querySelector('#kw');
    kw.addEventListener('keydown', (e) => { if (e.key === 'Enter') setQuery({ keyword: kw.value.trim(), pageNum: '' }); });
    mount.querySelector('#status-sel').addEventListener('change', (e) => setQuery({ status: e.target.value, pageNum: '' }));
    attachPagination(mount, (p) => setQuery({ pageNum: p }));
    mount.querySelectorAll('[data-approve]').forEach((el) => el.addEventListener('click', async () => {
      const [ns, name, version] = el.dataset.approve.split('|');
      try {
        const r = await api.post(`/api/pms/audit/${encodeURIComponent(ns)}/${encodeURIComponent(name)}/v/${encodeURIComponent(version)}/approve`);
        if (r.status === 'PENDING') message.info(r.message || '审核已通过，等待发布人确认发布');
        else message.success('审核已通过');
        renderAudit(mount, query);
      } catch (e) { message.error(e.message); }
    }));
  } catch (err) {
    mount.innerHTML = pageView({ content: emptyHtml(`加载失败：${err.message}`) });
  }
}
