/* 翼辉云枢 · 应用入口（登录 + 路由） */

import { api, session } from './api.js';
import { state, parseRoute, go } from './core.js';
import { icon, message, input } from './ui.js';
import { renderShell } from './layout.js';
import { renderArmoryHome, renderPackageDetail } from './views-armory.js';
import { renderOrgList, renderOrgDetail, renderPersonalCenter } from './views-space.js';
import { renderPlatforms, renderArchs, renderAudit } from './views-pms.js';

const app = document.getElementById('app');

/* ------------------------------------------------------------------ *
 * 登录页
 * ------------------------------------------------------------------ */

function formItemLocal(label, control) {
  return `<div class="ant-form-item"><div class="ant-form-item-label">${label}</div>${control}</div>`;
}

function renderLogin(prefill = '') {
  app.innerHTML = `<div class="aco-hub" style="align-items:center;justify-content:center;background:linear-gradient(160deg,#e6f4ff 0%,#f5f5f5 45%,#e8efff 100%)">
    <div class="ant-modal-content" style="width:400px;padding:32px">
      <div class="aco-flex-middle aco-gap-8" style="margin-bottom:24px">
        <span class="aco-hub-brand-mark">${icon('package', 18)}</span>
        <span style="font-size:22px;font-weight:600">翼辉云枢</span>
      </div>
      <p class="aco-text-description" style="margin-bottom:24px">制品仓库平台 · 单点登录</p>
      <div id="login-form" style="display:flex;flex-direction:column;gap:16px">
        ${formItemLocal('用户名', input({ name: 'username', value: prefill, placeholder: '请输入用户名', attrs: 'autocomplete="username"' }))}
        ${formItemLocal('密码', input({ name: 'password', type: 'password', placeholder: '请输入密码', attrs: 'autocomplete="current-password"' }))}
        <button class="ant-btn ant-btn-primary ant-btn-lg ant-btn-block" id="login-btn" style="margin-top:8px">登 录</button>
      </div>
      <p class="aco-text-description" style="margin-top:16px;font-size:12px">演示账号：admin / admin123 · zhangsan / user123</p>
    </div>
  </div>`;

  const doLogin = async () => {
    const username = app.querySelector('[name="username"]').value.trim();
    const password = app.querySelector('[name="password"]').value;
    if (!username || !password) { message.warning('请输入用户名和密码'); return; }
    const btnEl = app.querySelector('#login-btn');
    btnEl.classList.add('is-loading');
    btnEl.disabled = true;
    try {
      const user = await api.login(username, password);
      state.user = user;
      message.success(`欢迎，${user.realName || user.username}`);
      location.hash = '#/armory/package';
      boot();
    } catch (e) {
      message.error(e.message || '登录失败');
      btnEl.classList.remove('is-loading');
      btnEl.disabled = false;
    }
  };
  app.querySelector('#login-btn').addEventListener('click', doLogin);
  app.querySelectorAll('#login-form input').forEach((el) => el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLogin();
  }));
}

/* ------------------------------------------------------------------ *
 * 路由表（对齐真实系统 /armory 路由）
 * ------------------------------------------------------------------ */

function matchRoute(path) {
  const seg = path.replace(/\/+$/, '');
  let m;

  if (seg === '/armory' || seg === '/armory/package' || seg === '') {
    return { view: renderArmoryHome, params: {} };
  }
  if ((m = seg.match(/^\/armory\/package\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/))) {
    return { view: renderPackageDetail, params: { ns: decodeURIComponent(m[1]), name: decodeURIComponent(m[2]), version: m[3] ? decodeURIComponent(m[3]) : undefined } };
  }
  if (seg === '/armory/org') {
    return { view: renderOrgList, params: {} };
  }
  if ((m = seg.match(/^\/armory\/org\/([^/]+)$/))) {
    return { view: renderOrgDetail, params: { ns: decodeURIComponent(m[1]) } };
  }
  if ((m = seg.match(/^\/armory\/org\/package\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/))) {
    return { view: renderPackageDetail, params: { ns: decodeURIComponent(m[1]), name: decodeURIComponent(m[2]), version: m[3] ? decodeURIComponent(m[3]) : undefined } };
  }
  if (seg === '/armory/personal-center') {
    return { view: renderPersonalCenter, params: {} };
  }
  if ((m = seg.match(/^\/armory\/personal-center\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/))) {
    return { view: renderPackageDetail, params: { ns: decodeURIComponent(m[1]), name: decodeURIComponent(m[2]), version: m[3] ? decodeURIComponent(m[3]) : undefined } };
  }
  if (seg === '/armory/pms' || seg === '/armory/pms/plats') {
    return { view: renderPlatforms, params: {} };
  }
  if (seg === '/armory/pms/arch') {
    return { view: renderArchs, params: {} };
  }
  if (seg === '/armory/pms/audit') {
    return { view: renderAudit, params: {} };
  }
  return null;
}

async function boot() {
  const { path, query } = parseRoute();

  if (!session.token) {
    renderLogin();
    return;
  }
  if (!state.user) {
    try {
      const me = await api.me();
      state.user = me.user;
      state.namespaces = me.namespaces || [];
    } catch {
      renderLogin(session.user ? session.user.username : '');
      return;
    }
  }
  if (!matchRoute(path)) {
    location.hash = '#/armory/package';
    return;
  }

  const route = matchRoute(path);
  renderShell(app, { path, query }, state.user, '');
  const target = document.getElementById('page-root');
  // 约定：视图第二参数同时支持 params 与 query，query 平铺以兼容 (mount, query) 签名
  await route.view(target, { ...route.params, ...query, query });
}

window.addEventListener('hashchange', boot);
window.addEventListener('depot:unauthorized', () => {
  state.user = null;
  renderLogin();
});

/* 全局导航委托：所有带 data-goto 的元素统一跳转 */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-goto]');
  if (!el || e.target.closest('[data-stop]')) return;
  e.preventDefault();
  go(el.dataset.goto);
});

boot();
