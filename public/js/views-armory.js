/* 翼辉云枢 · 软件包列表 + 包详情 */

import { api } from './api.js';
import {
  escapeHtml, icon, tag, acoTag, btn, emptyHtml, tableHtml, paginationHtml, attachPagination,
  loadingPanel, segmented, attachSegmented, switchHtml, attachSwitch, message, avatar, copyText,
} from './ui.js';
import { go, state, humanSize, fromNow, fmtDate, markdownLite, pageView, roleTag, timeCell } from './core.js';

const PLATFORM_ICONS = { Windows: 'windows', SylixOS: 'robot', Linux: 'linux', MacOS: 'apple', Generic: 'folder' };
export const PLATFORM_LABELS = { Generic: '通用', Windows: 'Windows', SylixOS: 'SylixOS', Linux: 'Linux', MacOS: 'MacOS' };
const ARCH_LABELS = { amd64: 'AMD64', arm64: 'ARM64', x86: 'x86', x64: 'x64', arm: 'ARM', riscv64: 'RISC-V 64', loongarch64: 'LoongArch 64', noarch: '平台无关' };
export function platIcon(p) { return PLATFORM_ICONS[p] || 'folder'; }
export function platLabel(p) { return PLATFORM_LABELS[p] || p; }
export function archLabel(a) { return ARCH_LABELS[a] || a; }
export function pkgDetailPath(ns, name) { return `/armory/package/${encodeURIComponent(ns)}/${encodeURIComponent(name)}`; }

/* ------------------------------------------------------------------ *
 * 首页（左列表 + 右栏统计/流行/发现）
 * ------------------------------------------------------------------ */

function packageCellHtml(p) {
  return `<div class="package-cell">
    <div class="package-title">
      <div class="package-title-left">
        <span class="label" data-goto="${pkgDetailPath(p.namespace, p.name)}">${escapeHtml(p.fullName)}</span>
        ${p.accessLevel === 'Private' ? tag('私有', 'gold') : ''}
      </div>
      <span class="aco-text-description" style="font-size:12px">${fromNow(p.lastPublishedTime)}发布 v${escapeHtml(p.version || '-')}</span>
    </div>
    <p class="package-intro">${escapeHtml(p.description || '暂无描述')}</p>
    <div class="package-tags">
      ${(p.tags || []).slice(0, 6).map((t) => acoTag(t, `data-tag="${escapeHtml(t)}"`)).join('')}
      <span class="aco-text-description" style="font-size:12px;margin-left:auto">${icon('download', 12)} ${p.downloads} 次下载</span>
    </div>
  </div>`;
}

export async function renderArmoryHome(mount, query) {
  mount.innerHTML = loadingPanel();
  const pageNum = Number(query.pageNum) || 1;
  const keyword = query.keyword || '';
  const sort = query.sort || 'recent';

  try {
    const [list, summary, popular, discover] = await Promise.all([
      api.get('/api/packages', { pageNum, pageSize: 10, keyword, sort }),
      api.get('/api/armory/summary'),
      api.get('/api/armory/popular'),
      api.get('/api/armory/discover'),
    ]);

    const listHtml = list.list.length
      ? `<div class="pkg-paged-wrap">${list.list.map(packageCellHtml).join('')}</div>
         <div style="margin-top:16px;display:flex;justify-content:flex-end">${paginationHtml(list)}</div>`
      : `<div class="ant-card"><div class="ant-card-body">${emptyHtml('暂无软件包')}</div></div>`;

    const stat = (label, value) => `<div class="ant-statistic"><div class="ant-statistic-title">${label}</div><div class="ant-statistic-content">${value}</div></div>`;

    mount.innerHTML = pageView({
      title: '软件包',
      content: `<div class="armory-home-layout">
        <div class="home-left">
          <div class="aco-search-table-toolbar" style="margin-bottom:16px">
            <div class="toolbar-left">
              ${btn('新建软件包', { type: 'primary', icon: 'plus', attrs: 'data-act="create"' })}
              <span class="ant-input-affix-wrapper" style="max-width:280px">
                <span class="anticon">${icon('search', 14)}</span>
                <input class="ant-input" id="pkg-kw" placeholder="搜索软件包名称 / 描述" value="${escapeHtml(keyword)}" maxlength="100">
              </span>
            </div>
            <div class="toolbar-right">
              ${segmented([
                { value: 'recent', label: '最近发布' },
                { value: 'downloads', label: '下载最多' },
                { value: 'name', label: '名称' },
              ], sort, 'id="pkg-sort"')}
            </div>
          </div>
          ${listHtml}
        </div>
        <div class="home-right">
          <div class="summary-static-layout">
            <div class="summary-static-header"><span class="summary-static-name">统计</span></div>
            <div class="summary-static-content">
              ${stat('软件包总数', summary.packages)}
              ${stat('近 7 天下载', summary.downloadsLastWeek)}
              ${stat('近 30 天下载', summary.downloadsLastMonth)}
              ${stat('累计下载', summary.downloadsTotal)}
            </div>
          </div>
          <div class="summary-static-layout">
            <div class="summary-static-header"><span class="summary-static-name">流行制品</span></div>
            <div class="summary-static-content" style="padding-top:4px">
              ${popular.list.map((p) => `<span class="popular-item"><span class="nav-link" data-goto="${pkgDetailPath(p.namespace, p.name)}">${escapeHtml(p.fullName)}</span></span>`).join('') || emptyHtml('暂无数据')}
            </div>
          </div>
          <div class="summary-static-layout">
            <div class="summary-static-header"><span class="summary-static-name">发现</span></div>
            <div class="summary-static-content">
              <div class="pkg-aco-tag-list" style="margin-top:0">
                ${discover.labels.map((l) => acoTag(`${l.name} · ${l.count}`, `data-tag="${escapeHtml(l.name)}"`)).join('') || '<span class="empty-text">暂无标签</span>'}
              </div>
            </div>
          </div>
        </div>
      </div>`,
    });

    /* 交互 */
    const kw = mount.querySelector('#pkg-kw');
    kw.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(`/armory/package?keyword=${encodeURIComponent(kw.value.trim())}`); });
    attachSegmented(mount.querySelector('#pkg-sort'), (v) => go(`/armory/package?keyword=${encodeURIComponent(keyword)}&sort=${v}`));
    attachPagination(mount, (p) => go(`/armory/package?pageNum=${p}&keyword=${encodeURIComponent(keyword)}&sort=${sort}`));
    const createBtn = mount.querySelector('[data-act="create"]');
    if (createBtn) createBtn.addEventListener('click', () => import('./dialogs.js').then((m) => m.createPackageDialog(() => renderArmoryHome(mount, query))));
    /* 标签点击 → 按标签检索（发现区与列表行内标签共用） */
    mount.querySelectorAll('[data-tag]').forEach((el) => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const tag = el.dataset.tag || '';
        if (tag) go(`/armory/package?keyword=${encodeURIComponent(tag)}&sort=${sort}`);
      });
    });
  } catch (err) {
    mount.innerHTML = pageView({ title: '软件包', content: emptyHtml(`加载失败：${err.message}`) });
  }
}

/* ------------------------------------------------------------------ *
 * 包详情
 * ------------------------------------------------------------------ */

const DETAIL_TABS = [
  { key: 'readme', label: 'README' },
  { key: 'file', label: '文件' },
  { key: 'dependencies', label: '依赖' },
  { key: 'dependents', label: '被依赖' },
  { key: 'versions', label: '版本' },
  { key: 'member', label: '成员' },
  { key: 'issues', label: '问题反馈' },
];

function summaryRow(title, content) {
  return `<div class="summary-row"><div class="row-title">${title}</div>${content}</div>`;
}

function versionRowsHtml(versions, showDeprecated) {
  const rows = versions.filter((v) => showDeprecated || !v.deprecated);
  return tableHtml({
    emptyText: '暂无版本',
    columns: [
      { title: '版本', key: 'version', render: (v) => `<span style="font-weight:500">${escapeHtml(v.version)}</span>${v.deprecated ? tag('已弃用', 'error') : ''}` },
      { title: '状态', key: 'status', render: (v) => tag(v.status === 'PUBLISHED' ? '已发布' : v.status === 'PENDING' ? '待发布' : '已删除', v.status === 'PUBLISHED' ? 'success' : v.status === 'PENDING' ? 'warning' : 'default') },
      { title: '平台', key: 'platformInfoList', render: (v) => (v.platformInfoList || []).map((p) => `<span class="pkg-detail-version-platform-tag">${icon(platIcon(p.platform), 12)} ${escapeHtml(platLabel(p.platform))} / ${escapeHtml(archLabel(p.arch))}</span>`).join(' ') || '-' },
      { title: '大小', key: 'sizeText' },
      { title: '下载', key: 'downloads' },
      { title: '发布人', key: 'publisher', render: (v) => (v.publisher ? `${escapeHtml(v.publisher.realName || v.publisher.username)}` : '-') },
      { title: '发布时间', key: 'publishTime', render: (v) => timeCell(v.publishTime) },
      {
        title: '操作', key: 'ops', render: (v) => `<span class="pkg-detail-version-download-btn" data-dl="${escapeHtml(v.version)}">${icon('download', 14)}</span>
        ${v.status === 'PENDING' ? `<span class="ant-btn ant-btn-link ant-btn-sm" data-confirm="${escapeHtml(v.version)}">审核</span>` : ''}`,
      },
    ],
    rows,
  });
}

function renderTab(detail, tab, showDeprecated) {
  switch (tab) {
    case 'readme':
      return `<div class="markdown-body">${markdownLite(detail.readme)}</div>`;
    case 'file':
      return tableHtml({
        emptyText: '暂无发布物',
        columns: [
          { title: '文件名', key: 'filename', render: (f) => `<span style="font-weight:500">${escapeHtml(f.filename)}</span>` },
          { title: '版本', key: 'version' },
          { title: '平台', key: 'platform', render: (f) => `<span class="pkg-detail-version-platform-tag">${icon(platIcon(f.platform), 12)} ${escapeHtml(platLabel(f.platform))} / ${escapeHtml(archLabel(f.arch))}</span>` },
          { title: '大小', key: 'sizeText' },
          { title: 'SHA256', key: 'sha256', render: (f) => `<code style="font-size:12px">${escapeHtml(String(f.sha256 || '').slice(0, 16))}…</code>` },
          { title: '上传时间', key: 'uploadTime', render: (f) => timeCell(f.uploadTime) },
          { title: '操作', key: 'ops', render: (f) => `<span class="pkg-detail-version-download-btn" data-dl-v="${escapeHtml(f.version)}" data-dl-p="${escapeHtml(f.platform)}" data-dl-a="${escapeHtml(f.arch)}">${icon('download', 14)}</span>` },
        ],
        rows: detail.artifacts || [],
      });
    case 'dependencies':
      return tableHtml({
        emptyText: '暂无依赖',
        columns: [
          { title: '软件包', key: 'name', render: (d) => `<a data-goto="${pkgDetailPath(d.namespace, d.name)}">@${escapeHtml(d.namespace)}/${escapeHtml(d.name)}</a>` },
          { title: '版本范围', key: 'range' },
          { title: '来源版本', key: 'fromVersion' },
        ],
        rows: detail.dependencies || [],
      });
    case 'dependents':
      return tableHtml({
        emptyText: '暂无被依赖',
        columns: [
          { title: '软件包', key: 'name', render: (d) => `<a data-goto="${pkgDetailPath(d.namespace, d.name)}">@${escapeHtml(d.namespace)}/${escapeHtml(d.name)}</a>` },
          { title: '版本范围', key: 'range' },
        ],
        rows: detail.dependents || [],
      });
    case 'versions':
      return `<div class="aco-flex-between" style="margin-bottom:12px">
          <b>全部版本（${(detail.versions || []).length}）</b>
          <span class="aco-flex-middle aco-gap-8">展示弃用版本 ${switchHtml(showDeprecated, { attrs: 'id="dep-switch"' })}</span>
        </div>${versionRowsHtml(detail.versions || [], showDeprecated)}`;
    case 'member':
      return `<div class="team-members-manage"><div class="member-list">${(detail.members || []).map((m) => `
        <div class="member-item aco-flex-middle">
          ${avatar(m.realName || m.username)}
          <div class="member-info" style="margin-left:8px">
            <div class="member-name">${escapeHtml(m.realName || m.username)}</div>
            <div class="member-username">${escapeHtml(m.username)}</div>
          </div>
          ${roleTag(m.roleId)}
        </div>`).join('') || emptyHtml('暂无成员')}</div></div>`;
    case 'issues':
      return `<div style="margin-bottom:16px">${btn('新建问题反馈', { type: 'primary', icon: 'plus', attrs: 'data-act="new-issue"' })}</div>
        ${(detail.issues || []).map((i) => `
        <div class="issue-detail-cell">
          <div class="center">
            <div class="detail-issus-title"><span class="text">${escapeHtml(i.title)}</span>${tag(i.status === 'OPEN' ? '待处理' : '已关闭', i.status === 'OPEN' ? 'warning' : 'default')}</div>
            <p class="detail-issue-content">${escapeHtml(i.content || '')}</p>
            <div class="issue-detail-info-bar">
              <span class="item">${escapeHtml(i.creator?.realName || i.creator?.username || '-')}</span>
              <span class="item">${fromNow(i.createTime)}</span>
              ${i.status === 'OPEN' ? `<span class="item"><a data-close-issue="${i.id}">关闭</a></span>` : ''}
            </div>
            ${(i.comments || []).map((c) => `<div class="detail-issue-content" style="border-left:2px solid var(--ant-color-border-secondary);padding-left:12px;margin:8px 0 0">
              <b style="font-size:12px">${escapeHtml(c.creator?.realName || c.creator?.username || '-')}</b>：${escapeHtml(c.content)}
            </div>`).join('')}
          </div>
        </div>`).join('') || emptyHtml('暂无问题反馈')}`;
    default:
      return '';
  }
}

export async function renderPackageDetail(mount, { ns, name, query }) {
  mount.innerHTML = loadingPanel();
  const tab = query.tab || 'readme';
  const showDeprecated = query.deprecated === '1';
  try {
    const detail = await api.get(`/api/packages/${encodeURIComponent(ns)}/${encodeURIComponent(name)}/detail`);
    const watching = detail.watching;

    const content = `<div class="package-detail"><div class="pkg-detail-content">
      <div class="content-left">
        <div class="pkg-detail-header">
          <div class="header-title">
            <span class="pkg-name">@${escapeHtml(detail.namespace)}/${escapeHtml(detail.name)}</span>
            <span class="name-space"><span class="pkg-namespace-link" data-goto="/armory/org/${encodeURIComponent(detail.namespace)}">${escapeHtml(detail.namespace)}</span></span>
            ${tag(detail.package.accessLevel === 'Private' ? '私有' : '公开', detail.package.accessLevel === 'Private' ? 'gold' : 'success')}
            <span class="header-icon" data-act="watch" title="${watching ? '取消关注' : '关注'}">${icon(watching ? 'starFill' : 'star', 18)}</span>
          </div>
          <p class="aco-text-description" style="margin-bottom:16px">${escapeHtml(detail.package.description || '暂无描述')}</p>
          <div class="aco-tabs">
            ${DETAIL_TABS.map((t) => `<span class="aco-tab-item${t.key === tab ? ' aco-tab-item-active' : ''}" data-tab="${t.key}">${t.label}${t.key === 'issues' && detail.issuesNum ? ` <span class="tab-dot"></span>` : ''}</span>`).join('')}
          </div>
        </div>
        <div class="pkg-tab-content">${renderTab(detail, tab, showDeprecated)}</div>
      </div>
      <div class="content-right">
        <div class="summary-row-wrap">
          ${summaryRow('安装命令', `<div class="summary-tab-content"><span class="summary-tab-content-text">aco get @${escapeHtml(detail.namespace)}/${escapeHtml(detail.name)}</span><span class="copy" data-act="copy" data-copy="aco get @${escapeHtml(detail.namespace)}/${escapeHtml(detail.name)}">${icon('copy', 14)}</span></div>`)}
          ${summaryRow('下载总量', `<div class="summary-item"><div class="summary-item-content">${detail.downloadTotal}</div></div>`)}
          ${summaryRow('总体积', `<div class="summary-item"><div class="summary-item-content">${detail.sizeText || humanSize(detail.size)}</div></div>`)}
          ${summaryRow('License', `<div class="summary-item"><div class="summary-item-content"><span class="summary-item-content-value" style="text-decoration:underline">${escapeHtml(detail.license || '-')}</span></div></div>`)}
          ${summaryRow('最近发布', `<div class="summary-item"><div class="summary-item-content"><span class="summary-item-content-value">${fromNow(detail.latestPublishTime)}</span></div></div>`)}
          ${summaryRow('标签', `<div class="pkg-aco-tag-list" style="margin-top:0">${(detail.tags || []).map((t) => acoTag(t)).join('') || '<span class="aco-text-description">暂无标签</span>'}</div>`)}
          ${summaryRow('管理员', `<div class="pkg-user-list">${(detail.admins || []).map((a) => `
            <span class="aco-flex-middle aco-gap-4">${avatar(a.realName || a.username, 'sm')}<span>${escapeHtml(a.realName || a.username)}</span></span>`).join('') || '-'}</div>`)}
          ${summaryRow('Armory JSON', `<div class="summary-item summary-armory-json"><div class="summary-item-content" data-act="copy" data-copy="${escapeHtml(JSON.stringify(detail.armoryJson || {}))}" style="font-size:13px;font-weight:400;cursor:pointer">${icon('copy', 13)} armory.json</div></div>`)}
        </div>
      </div>
    </div></div>`;

    mount.innerHTML = pageView({ content });

    /* 页签 */
    mount.querySelectorAll('[data-tab]').forEach((el) => {
      el.addEventListener('click', () => {
        go(`/armory/package/${encodeURIComponent(ns)}/${encodeURIComponent(name)}?tab=${el.dataset.tab}${showDeprecated ? '&deprecated=1' : ''}`);
      });
    });
    /* 复制：优先 clipboard API，非安全上下文/无权限时降级 execCommand */
    mount.querySelectorAll('[data-act="copy"]').forEach((el) => {
      el.addEventListener('click', () => {
        copyText(el.dataset.copy || '');
      });
    });
    /* 关注 */
    const watchBtn = mount.querySelector('[data-act="watch"]');
    watchBtn.addEventListener('click', async () => {
      try {
        await api.post(`/api/packages/${encodeURIComponent(ns)}/${encodeURIComponent(name)}/watch`);
        message.success(watching ? '已取消关注' : '关注成功');
        renderPackageDetail(mount, { ns, name, query: { ...query, tab } });
      } catch (e) { message.error(e.message); }
    });
    /* 下载 */
    mount.querySelectorAll('[data-dl]').forEach((el) => el.addEventListener('click', () =>
      api.download(ns, name, el.dataset.dl)));
    mount.querySelectorAll('[data-dl-v]').forEach((el) => el.addEventListener('click', () =>
      api.download(ns, name, el.dataset.dlV, el.dataset.dlP, el.dataset.dlA)));
    /* 弃用版本开关 */
    const sw = mount.querySelector('#dep-switch');
    if (sw) attachSwitch(sw.parentElement, (next) => {
      go(`/armory/package/${encodeURIComponent(ns)}/${encodeURIComponent(name)}?tab=versions${next ? '&deprecated=1' : ''}`);
    }, '#dep-switch');
    /* 新建问题 */
    const newIssue = mount.querySelector('[data-act="new-issue"]');
    if (newIssue) newIssue.addEventListener('click', () =>
      import('./dialogs.js').then((m) => m.createIssueDialog(ns, name, () => renderPackageDetail(mount, { ns, name, query }))));
    mount.querySelectorAll('[data-close-issue]').forEach((el) => {
      el.addEventListener('click', async () => {
        try {
          await api.post(`/api/packages/${encodeURIComponent(ns)}/${encodeURIComponent(name)}/issues/${el.dataset.closeIssue}/close`);
          message.success('已关闭');
          renderPackageDetail(mount, { ns, name, query });
        } catch (e) { message.error(e.message); }
      });
    });
  } catch (err) {
    mount.innerHTML = pageView({ content: emptyHtml(`加载失败：${err.message}`) });
  }
}
