/* 翼辉云枢 · 应用外壳（aco-hub：头部 48px + 左侧导航 100px + 子侧栏 200px + 内容区） */

import { escapeHtml, icon } from './ui.js';
import { go } from './core.js';

export const NAV = [
  {
    key: 'package', label: '软件包', icon: 'package', match: (path) => path.startsWith('/armory/package'),
    children: [{ title: '软件包列表', path: '/armory/package' }],
  },
  {
    key: 'org', label: '空间', icon: 'appstore', match: (path) => path.startsWith('/armory/org'),
    children: [{ title: '空间列表', path: '/armory/org' }],
  },
  {
    key: 'personal', label: '个人中心', icon: 'user', match: (path) => path.startsWith('/armory/personal-center'),
    children: [
      { title: '我创建的', path: '/armory/personal-center?tab=created' },
      { title: '我发布的', path: '/armory/personal-center?tab=published' },
      { title: '我关注的', path: '/armory/personal-center?tab=watch' },
    ],
  },
  {
    key: 'pms', label: '仓库管理', icon: 'setting', match: (path) => path.startsWith('/armory/pms'),
    children: [
      { title: '平台管理', path: '/armory/pms/plats' },
      { title: '架构管理', path: '/armory/pms/arch' },
      { title: '软件包审核', path: '/armory/pms/audit' },
    ],
  },
];

function activeNav(path) {
  return NAV.find((n) => n.match(path)) || NAV[0];
}

function activeSubPath(path, query) {
  if (path === '/armory/personal-center') return `/armory/personal-center?tab=${query.tab || 'created'}`;
  if (path.startsWith('/armory/pms')) {
    if (path.startsWith('/armory/pms/arch')) return '/armory/pms/arch';
    if (path.startsWith('/armory/pms/audit')) return '/armory/pms/audit';
    return '/armory/pms/plats';
  }
  return path;
}

function userMenuHtml(user) {
  return `<div class="aco-hub-user" id="hub-user">
    <span class="ant-avatar ant-avatar-sm" style="background:#1677ff">${escapeHtml(String(user.realName || user.username || '?').charAt(0).toUpperCase())}</span>
    <span class="aco-hub-user-name">${escapeHtml(user.realName || user.username)}</span>
    ${icon('chevronDown', 12)}
  </div>`;
}

export function renderShell(root, { path, query }, user, contentHtml) {
  const nav = activeNav(path);
  const subPath = activeSubPath(path, query);

  root.innerHTML = `
    <header class="aco-hub-header">
      <div class="aco-hub-brand" data-goto="/armory/package">
        <span class="aco-hub-brand-mark">${icon('package', 16)}</span>
        <span class="aco-hub-brand-name">翼辉云枢</span>
      </div>
      ${userMenuHtml(user)}
    </header>
    <div class="aco-hub-page">
      <aside class="aco-hub-sider">
        ${NAV.map((n) => `<div class="aco-hub-aside-menu-item${n.key === nav.key ? ' is-active' : ''}" data-goto="${n.children[0].path}">
          ${icon(n.icon, 20, 'nav-icon')}
          <span>${escapeHtml(n.label)}</span>
        </div>`).join('')}
      </aside>
      <aside class="aco-hub-sub-sider">
        <div class="aco-hubs-sub-menu-title-wrap">
          <span class="aco-hub-sub-menu-title">${escapeHtml(nav.label)}</span>
        </div>
        <div class="aco-hub-sub-menu">
          ${nav.children.map((c) => `<div class="aco-hub-sub-menu-item${c.path === subPath ? ' is-active' : ''}" data-goto="${c.path}">${escapeHtml(c.title)}</div>`).join('')}
        </div>
      </aside>
      <main class="aco-hub-page-content" id="page-root">${contentHtml}</main>
    </div>`;

  /* 用户菜单 */
  const userBtn = root.querySelector('#hub-user');
  userBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const exist = root.querySelector('.ant-dropdown.hub-user-dropdown');
    if (exist) { exist.remove(); return; }
    const menu = document.createElement('div');
    menu.className = 'ant-dropdown hub-user-dropdown';
    menu.style.cssText = 'position:fixed;top:52px;right:20px;';
    menu.innerHTML = `<div class="ant-dropdown-menu-item" data-act="profile">
        ${icon('user', 14)}<span>${escapeHtml(user.username)}</span>
      </div>
      <div class="ant-dropdown-menu-item is-danger" data-act="logout">${icon('logout', 14)}<span>退出登录</span></div>`;
    menu.querySelector('[data-act="logout"]').addEventListener('click', async () => {
      const { api } = await import('./api.js');
      await api.logout();
      location.hash = '';
      location.reload();
    });
    menu.querySelector('[data-act="profile"]').addEventListener('click', () => {
      menu.remove();
      go('/armory/personal-center');
    });
    root.appendChild(menu);
    setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
  });
}

export const SHELL_BOOT = '';
