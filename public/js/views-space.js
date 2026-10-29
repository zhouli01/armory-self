/* 翼辉云枢 · 空间列表 + 空间详情 + 个人中心 */

import { api } from './api.js';
import {
  escapeHtml, icon, tag, btn, emptyHtml, tableHtml, paginationHtml, attachPagination,
  loadingPanel, segmented, attachSegmented, switchHtml, attachSwitch, message, avatar, input, textarea, select,
} from './ui.js';
import { go, state, pageView, roleTag, spaceLabel, fromNow, fmtDate, setQuery, timeCell } from './core.js';
import { pkgDetailPath } from './views-armory.js';

/* ------------------------------------------------------------------ *
 * 空间列表
 * ------------------------------------------------------------------ */

function orgCardHtml(n) {
  return `<div class="user-org-card" data-org="${escapeHtml(n.namespaceId)}">
    ${n.type === 'USER' ? '<span class="user-org-card-label">个人空间</span>' : ''}
    <div class="org-name-and-role">
      <span class="name">${escapeHtml(n.namespaceId)}</span>
      ${n.roleId ? roleTag(n.roleId) : ''}
    </div>
    <p class="description">${escapeHtml(n.description || '暂无描述')}</p>
    <div class="user-org-card-footer user-org-card-setting">
      <span class="ant-tag" data-org-pkg="${escapeHtml(n.namespaceId)}">软件包<span class="user-org-card-setting-num">${n.pkgNum}</span></span>
      <span class="ant-tag" data-org-member="${escapeHtml(n.namespaceId)}">成员<span class="user-org-card-setting-num">${n.memberNum}</span></span>
    </div>
  </div>`;
}

export async function renderOrgList(mount, query) {
  mount.innerHTML = loadingPanel();
  const tab = query.tab || 'all';
  const keyword = query.keyword || '';
  try {
    const res = await api.get('/api/namespaces', { scope: tab === 'mine' ? 'mine' : 'all', keyword, pageNum: query.pageNum || 1, pageSize: 12 });
    const canCreate = state.user.role === 'ADMIN';

    mount.innerHTML = pageView({
      title: '空间',
      content: `
        <div class="aco-tabs">
          ${[
            { key: 'all', label: '全部空间' },
            { key: 'mine', label: '我参与的' },
          ].map((t) => `<span class="aco-tab-item${t.key === tab ? ' aco-tab-item-active' : ''}" data-tab="${t.key}">${t.label}</span>`).join('')}
        </div>
        <div class="aco-search-table-toolbar" style="margin-bottom:16px">
          <div class="toolbar-left" style="${canCreate ? '' : 'display:none'}">
            ${btn('新建', { type: 'primary', icon: 'plus', attrs: 'data-act="create"' })}
          </div>
          <div class="toolbar-left" style="flex:1;justify-content:flex-end">
            <span class="ant-input-affix-wrapper" style="max-width:240px">
              <input class="ant-input" id="org-kw" placeholder="空间名称" value="${escapeHtml(keyword)}" maxlength="100">
              <span class="anticon">${icon('search', 14)}</span>
            </span>
          </div>
        </div>
        <div class="org-card-grid">
          ${res.list.map(orgCardHtml).join('') || ''}
        </div>
        ${res.list.length ? '' : `<div style="padding:32px 0">${emptyHtml('暂无空间')}</div>`}
        <div style="margin-top:16px;display:flex;justify-content:center">${paginationHtml(res)}</div>`,
    });

    mount.querySelectorAll('[data-tab]').forEach((el) => el.addEventListener('click', () => setQuery({ tab: el.dataset.tab, pageNum: '' })));
    const kw = mount.querySelector('#org-kw');
    kw.addEventListener('keydown', (e) => { if (e.key === 'Enter') setQuery({ keyword: kw.value.trim(), pageNum: '' }); });
    attachPagination(mount, (p) => setQuery({ pageNum: p }));
    mount.querySelectorAll('[data-org]').forEach((el) => el.addEventListener('click', (e) => {
      if (e.target.closest('[data-org-pkg]')) { go(`/armory/org/${el.dataset.org}?tab=packages`); return; }
      if (e.target.closest('[data-org-member]')) { go(`/armory/org/${el.dataset.org}?tab=member`); return; }
      go(`/armory/org/${el.dataset.org}`);
    }));
    const create = mount.querySelector('[data-act="create"]');
    if (create) create.addEventListener('click', () => import('./dialogs.js').then((m) => m.createNamespaceDialog(() => renderOrgList(mount, query))));
  } catch (err) {
    mount.innerHTML = pageView({ title: '空间', content: emptyHtml(`加载失败：${err.message}`) });
  }
}

/* ------------------------------------------------------------------ *
 * 空间详情
 * ------------------------------------------------------------------ */

const ORG_TABS = [
  { key: 'packages', label: '软件包' },
  { key: 'member', label: '成员' },
  { key: 'setting', label: '设置' },
];

export async function renderOrgDetail(mount, { ns, query }) {
  mount.innerHTML = loadingPanel();
  const tab = query.tab || 'packages';
  try {
    const raw = await api.get(`/api/namespaces/${encodeURIComponent(ns)}`);
    // 接口返回 { namespace, members, packages, permissions }，实体字段在 namespace 下
    const detail = raw.namespace || raw;
    const perms = raw.permissions || {};
    const memberList = raw.members || [];
    const myRole = perms.roleId || memberList.find((m) => state.user && m.userId === state.user.id)?.roleId || '';
    const canManage = perms.canManage === true || myRole === 'ORG_OWNER' || myRole === 'ORG_ADMIN' || (state.user && state.user.role === 'ADMIN');

    let body = '';
    if (tab === 'packages') {
      const list = await api.get('/api/packages', { namespace: ns, pageSize: 20, pageNum: query.pageNum || 1 });
      body = list.list.length
        ? `<div class="pkg-paged-wrap" style="border:1px solid var(--ant-color-border);border-radius:4px">
            ${list.list.map((p) => `
              <div class="package-cell">
                <div class="package-title">
                  <div class="package-title-left"><span class="label" data-goto="${pkgDetailPath(p.namespace, p.name)}">${escapeHtml(p.fullName)}</span></div>
                  <span class="aco-text-description" style="font-size:12px">${fromNow(p.lastPublishedTime)}</span>
                </div>
                <p class="package-intro">${escapeHtml(p.description || '暂无描述')}</p>
                <div class="package-tags">${(p.tags || []).slice(0, 6).map((t) => `<span class="aco-tag">${escapeHtml(t)}</span>`).join('')}</div>
              </div>`).join('')}
          </div>
          <div style="margin-top:16px;display:flex;justify-content:flex-end">${paginationHtml(list)}</div>`
        : emptyHtml('暂无软件包');
      setTimeout(() => attachPagination(mount, (p) => setQuery({ pageNum: p })), 0);
    } else if (tab === 'member') {
      const members = memberList.length ? { list: memberList } : await api.get(`/api/namespaces/${encodeURIComponent(ns)}/members`);
      body = `<div class="org-detail-members">
          ${canManage ? `<div class="org-detail-members-toolbar" style="margin-bottom:8px">${btn('添加成员', { icon: 'plus', attrs: 'data-act="add-member"' })}</div>` : ''}
          <div class="team-members-manage"><div class="member-list" style="margin-top:8px">
            ${members.list.map((m) => `
            <div class="member-item aco-flex-middle">
              ${avatar(m.realName || m.username)}
              <div class="member-info" style="margin-left:8px">
                <div class="member-name">${escapeHtml(m.realName || m.username)}</div>
                <div class="member-username">${escapeHtml(m.username)}</div>
              </div>
              ${roleTag(m.roleId)}
              ${canManage ? `<span class="member-actions"><span class="ant-btn ant-btn-text ant-btn-sm" data-remove="${m.userId}" style="color:var(--ant-color-error)">移除</span></span>` : ''}
            </div>`).join('') || emptyHtml('暂无成员')}
          </div></div>
        </div>`;
    } else if (tab === 'setting') {
      body = `<div style="max-width:560px">
          <div class="pkg-detail-setting-title">基本信息</div>
          <p class="pkg-detail-setting-desc">空间标识：${escapeHtml(detail.namespaceId || ns)} · 类型：${detail.type === 'USER' ? '用户空间' : detail.type === 'GLOBAL' ? '全局空间' : '组织空间'} · 创建于 ${fmtDate(detail.createTime)}</p>
          <div class="ant-form-item"><div class="ant-form-item-label">描述</div><textarea class="ant-input" rows="4" id="org-desc">${escapeHtml(detail.description || '')}</textarea></div>
          <div class="ant-form-item"><div class="ant-form-item-label">发布需确认</div>${switchHtml(!!(detail.settings && detail.settings.publishConfirmation), { attrs: 'id="org-confirm"' })}</div>
          ${canManage ? btn('保存', { type: 'primary', attrs: 'data-act="save"' }) : ''}
        </div>`;
    }

    mount.innerHTML = pageView({
      breadcrumb: `<a data-goto="/armory/org">空间</a> / <span>${escapeHtml(ns)}</span>`,
      content: `
        <div class="org-detail-header">
          <span class="ant-avatar ant-avatar-lg" style="background:#1677ff;border-radius:8px">${escapeHtml(ns.charAt(0).toUpperCase())}</span>
          <div class="org-detail-info">
            <div class="org-detail-info-title">${escapeHtml(ns)} ${spaceLabel(detail.type === 'USER' ? 'personal' : detail.type === 'GLOBAL' ? 'global' : 'mine')}</div>
            <p class="ant-typography">${escapeHtml(detail.description || '暂无描述')}</p>
          </div>
          ${roleTag(myRole)}
        </div>
        <div class="aco-tabs" style="margin-top:16px">
          ${ORG_TABS.map((t) => `<span class="aco-tab-item${t.key === tab ? ' aco-tab-item-active' : ''}" data-tab="${t.key}">${t.label}</span>`).join('')}
        </div>
        ${body}`,
    });

    mount.querySelectorAll('.aco-tabs [data-tab]').forEach((el) => el.addEventListener('click', () => go(`/armory/org/${encodeURIComponent(ns)}?tab=${el.dataset.tab}`)));

    /* 成员页交互（必须在 innerHTML 渲染之后绑定） */
    mount.querySelectorAll('[data-remove]').forEach((el) => el.addEventListener('click', async () => {
      try {
        await api.del(`/api/namespaces/${encodeURIComponent(ns)}/members/${el.dataset.remove}`);
        message.success('已移除');
        renderOrgDetail(mount, { ns, query });
      } catch (e) { message.error(e.message); }
    }));
    const addBtn = mount.querySelector('[data-act="add-member"]');
    if (addBtn) addBtn.addEventListener('click', () => import('./dialogs.js').then((m) => m.addMemberDialog(ns, () => renderOrgDetail(mount, { ns, query }))));

    /* 设置页保存（同样在渲染之后绑定） */
    const saveBtn = mount.querySelector('[data-act="save"]');
    if (saveBtn) saveBtn.addEventListener('click', async () => {
      try {
        await api.put(`/api/namespaces/${encodeURIComponent(ns)}`, {
          description: mount.querySelector('#org-desc').value,
          settings: { publishConfirmation: mount.querySelector('#org-confirm').classList.contains('is-checked') },
        });
        message.success('保存成功');
      } catch (e) { message.error(e.message); }
    });
  } catch (err) {
    mount.innerHTML = pageView({ content: emptyHtml(`加载失败：${err.message}`) });
  }
}

/* ------------------------------------------------------------------ *
 * 个人中心
 * ------------------------------------------------------------------ */

export async function renderPersonalCenter(mount, query) {
  mount.innerHTML = loadingPanel();
  const tab = query.tab || 'created';
  const keyword = query.keyword || '';
  try {
    const overview = await api.get('/api/me/overview');
    // 兼容两种返回：命名空间为字符串字段 namespace，或对象 personal
    const nsName = (overview.personal && overview.personal.namespaceId) || overview.namespace || '';

    let body = '';
    if (tab === 'created') {
      const res = await api.get('/api/me/packages', { scope: 'created' });
      body = `<div class="aco-search-table-toolbar" style="margin-bottom:16px">
          <div class="toolbar-left">${btn('新建', { type: 'primary', icon: 'plus', attrs: 'data-act="create"' })}
            <span class="ant-input-affix-wrapper" style="max-width:240px"><input class="ant-input" id="pc-kw" placeholder="软件包" value="${escapeHtml(keyword)}" maxlength="100"><span class="anticon">${icon('search', 14)}</span></span>
          </div>
        </div>
        <div class="pkg-paged-wrap" style="border:1px solid var(--ant-color-border);border-radius:4px">
          ${res.list.filter((p) => !keyword || p.fullName.toLowerCase().includes(keyword.toLowerCase())).map((p) => `
          <div class="package-cell">
            <div class="package-title"><div class="package-title-left"><span class="label" data-goto="${pkgDetailPath(p.namespace, p.name)}">${escapeHtml(p.fullName)}</span></div>
              <span class="aco-text-description" style="font-size:12px">${fromNow(p.lastPublishedTime)}</span></div>
            <p class="package-intro">${escapeHtml(p.description || '暂无描述')}</p>
            <div class="package-tags">${(p.tags || []).slice(0, 6).map((t) => `<span class="aco-tag">${escapeHtml(t)}</span>`).join('')}</div>
          </div>`).join('') || ''}
        </div>
        ${res.list.length ? '' : emptyHtml('暂无软件包')}`;
    } else if (tab === 'published') {
      const res = await api.get('/api/me/packages', { scope: 'published' });
      body = `<div class="personal-center-published-list">
          ${res.list.map((p) => `
          <div class="package-cell">
            <div class="package-title"><div class="package-title-left"><span class="label" data-goto="${pkgDetailPath(p.namespace, p.name)}">${escapeHtml(p.fullName)}</span></div>
              <span class="version aco-text-description" style="font-size:12px">v${escapeHtml(p.version || '-')}</span></div>
            <p class="package-intro">${escapeHtml(p.description || '暂无描述')}</p>
          </div>`).join('')}
        </div>
        ${res.list.length ? '' : emptyHtml('暂无发布记录')}`;
    } else {
      const res = await api.get('/api/me/watches');
      const groups = [
        { title: '正在关注的', mode: 'ALL_EVENTS', list: res.list.filter((w) => w.watchMode === 'ALL_EVENTS') },
        { title: '自定义的', mode: 'CUSTOM', list: res.list.filter((w) => w.watchMode === 'CUSTOM') },
        { title: '已忽略的', mode: 'DISABLED', list: res.list.filter((w) => w.watchMode === 'DISABLED') },
      ];
      body = `<div style="display:flex;flex-direction:column;gap:16px">
        ${groups.map((g) => `
        <div class="armory-manage-card">
          <div class="armory-manage-card-header">${escapeHtml(g.title)}（${g.list.length}）</div>
          ${g.list.map((w) => {
            const wNs = w.packageNamespace || w.namespace || '';
            const wName = w.packageName || w.name || '';
            return `
          <div class="armory-manage-pkg-item">
            <span class="armory-manage-pkg-item-name" data-goto="${wNs && wName ? pkgDetailPath(wNs, wName) : '/armory/package'}">@${escapeHtml(wNs)}/${escapeHtml(wName)}</span>
            <span class="armory-manage-pkg-item-extra aco-text-description" style="font-size:12px">${fromNow(w.lastEventTime)}</span>
          </div>`;
          }).join('') || `<div class="empty-text">暂无关注软件包</div>`}
        </div>`).join('')}
      </div>`;
    }

    mount.innerHTML = pageView({
      content: `<div class="personal-center-container">
        <div class="personal-center-header">
          <div class="personal-center-header-title">
            ${nsName ? `@${escapeHtml(nsName)}` : `<span>暂无个人命名空间，</span><span class="personal-center-header-to-create" data-act="to-create">去创建</span>`}
          </div>
          ${nsName ? btn('进入个人空间', { icon: 'login', attrs: `data-goto="/armory/org/${encodeURIComponent(nsName)}"` }) : ''}
        </div>
        <div class="aco-tabs">
          ${[
            { key: 'created', label: '我创建的' },
            { key: 'published', label: '我发布的' },
            { key: 'watch', label: '我关注的' },
          ].map((t) => `<span class="aco-tab-item${t.key === tab ? ' aco-tab-item-active' : ''}" data-tab="${t.key}">${t.label}</span>`).join('')}
        </div>
        ${body}
      </div>`,
    });

    mount.querySelectorAll('.aco-tabs [data-tab]').forEach((el) => el.addEventListener('click', () => setQuery({ tab: el.dataset.tab })));
    const kw = mount.querySelector('#pc-kw');
    if (kw) kw.addEventListener('keydown', (e) => { if (e.key === 'Enter') setQuery({ tab, keyword: kw.value.trim() }); });
    const create = mount.querySelector('[data-act="create"]');
    if (create) create.addEventListener('click', () => import('./dialogs.js').then((m) => m.createPackageDialog(() => renderPersonalCenter(mount, query))));
    const toCreate = mount.querySelector('[data-act="to-create"]');
    if (toCreate) toCreate.addEventListener('click', () => go('/armory/org'));
  } catch (err) {
    mount.innerHTML = pageView({ content: emptyHtml(`加载失败：${err.message}`) });
  }
}
