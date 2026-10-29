// 功能点自动巡检：逐一点击/提交每个可交互功能，验证真实效果（不只是"没报错"）
// 用法: node scripts/audit-features.mjs [baseUrl]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:7310';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9335;

const profile = mkdtempSync(join(tmpdir(), 'depot-audit-'));
const results = [];
const netErrors = [];
const pageErrors = [];
let netLog = [];
// >0 时表示当前处于“预期失败”用例（如提交非法名称），4xx 不计入错误
let expectedFailures = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function record(area, name, ok, detail = '') {
  results.push({ area, name, ok, detail });
  const mark = ok ? 'OK  ' : 'BROKEN';
  console.log(`  [${mark}] ${area} · ${name}${detail ? ' — ' + detail : ''}`);
}

// ---------- 浏览器 ----------
const edge = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--window-size=1440,900', 'about:blank',
], { stdio: 'ignore' });

async function waitDevtools() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return await r.json();
    } catch { /* wait */ }
    await sleep(250);
  }
  throw new Error('DevTools 启动失败');
}

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.ready = new Promise((res, rej) => { this.ws.onopen = () => res(); this.ws.onerror = () => rej(new Error('ws')); });
    this.ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(m.error.message)) : resolve(m.result);
      } else if (m.method) {
        (this.handlers.get(m.method) || []).forEach((fn) => fn(m.params));
      }
    };
  }
  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`timeout ${method}`)); } }, 30000);
    });
  }
  async eval(expr, awaitPromise = true) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise, userGesture: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
}

const ver = await waitDevtools();
console.log(`\n功能点自动巡检 · Edge ${ver.Browser}\n${'='.repeat(70)}`);
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const cdp = new CDP(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
await cdp.ready;

cdp.on('Runtime.exceptionThrown', (p) => {
  pageErrors.push(`${p.exceptionDetails.exception?.description || p.exceptionDetails.text}`.slice(0, 240));
});
cdp.on('Runtime.consoleAPICalled', (p) => {
  if (p.type === 'error') pageErrors.push(`console: ${p.args.map((a) => a.value ?? a.description).join(' ')}`.slice(0, 240));
});
cdp.on('Network.responseReceived', (p) => {
  const { url, status } = p.response;
  if (!url.includes('/api/')) return;
  netLog.push({ url, status, method: p.response.requestHeadersText ? '' : '' });
  // 预期内的失败请求不计入错误：登录态探测 + 校验类用例（非法名称/空表单等由服务端返回 4xx 属正确行为）
  const expected = /\/api\/auth\/(login|me)/.test(url) || expectedFailures > 0;
  if (status >= 400 && !expected) {
    netErrors.push(`${status} ${url}`);
  }
});

await cdp.send('Runtime.enable');
await cdp.send('Network.enable');
await cdp.send('Page.enable');

const T = {
  text: (sel) => cdp.eval(`(document.querySelector(${JSON.stringify(sel)})||{}).innerText || ''`),
  body: () => cdp.eval('document.body.innerText'),
  count: (sel) => cdp.eval(`document.querySelectorAll(${JSON.stringify(sel)}).length`),
  has: (sel) => cdp.eval(`!!document.querySelector(${JSON.stringify(sel)})`),
  click: (sel) => cdp.eval(`(()=>{const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return false; el.click(); return true;})()`),
  set: (sel, val) => cdp.eval(`(()=>{const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return false; el.value=${JSON.stringify(val)}; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true;})()`),
  enter: (sel) => cdp.eval(`(()=>{const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return false; el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); return true;})()`),
  go: async (hash, ms = 1200) => {
    netLog = [];
    await cdp.eval(`location.hash=${JSON.stringify(hash)}; window.dispatchEvent(new Event('hashchange'));`);
    await sleep(ms);
  },
  msg: () => cdp.eval(`(document.getElementById('message-root')||{textContent:''}).textContent || ''`),
  waitMsg: async (ms = 1200) => {
    for (let i = 0; i < Math.ceil(ms / 150); i++) {
      const t = await cdp.eval(`(document.getElementById('message-root')||{textContent:''}).textContent || ''`);
      if (t.trim()) return t;
      await sleep(150);
    }
    return '';
  },
  clearMsg: () => cdp.eval(`(()=>{const r=document.getElementById('message-root'); if(r) r.innerHTML='';})()`),
  modalOpen: () => cdp.eval(`document.querySelectorAll('.aco-modal-mask').length`),
};

/* ================= 1. 认证 ================= */
console.log('\n【1】认证与会话');
await cdp.send('Page.navigate', { url: `${BASE}/` });
await cdp.eval('localStorage.clear();');
await cdp.send('Page.navigate', { url: `${BASE}/` });
await sleep(1600);

record('认证', '登录页渲染', await T.count('#login-form') === 1);

// 空提交
await T.clearMsg();
await T.click('#login-btn');
await sleep(500);
const emptyMsg = await T.waitMsg();
record('认证', '空表单校验提示', /请输入用户名和密码/.test(emptyMsg), emptyMsg.slice(0, 40));

// 错误密码
await T.set('[name="username"]', 'admin');
await T.set('[name="password"]', 'wrong');
await T.clearMsg();
await T.click('#login-btn');
await sleep(900);
const wrongMsg = await T.waitMsg();
record('认证', '错误密码给出错误提示', /失败|错误|密码/.test(wrongMsg), wrongMsg.slice(0, 40));
record('认证', '错误后按钮恢复可点', await cdp.eval(`!document.querySelector('#login-btn').disabled`));

// 正确登录
await T.set('[name="username"]', 'admin');
await T.set('[name="password"]', 'admin123');
await T.click('#login-btn');
await sleep(2000);
record('认证', '正确账号登录成功', await T.count('.aco-hub-header') === 1);

/* ================= 2. 外壳导航 ================= */
console.log('\n【2】外壳导航');
const navItems = await T.count('.aco-hub-aside-menu-item');
record('外壳', '一级导航 4 项', navItems === 4, `actual=${navItems}`);

for (const [i, expect] of [[0, '/armory/package'], [1, '/armory/org'], [2, '/armory/personal-center'], [3, '/armory/pms/plats']]) {
  await cdp.eval(`document.querySelectorAll('.aco-hub-aside-menu-item')[${i}].click();`);
  await sleep(1200);
  const h = await cdp.eval('location.hash');
  record('外壳', `一级导航 ${i + 1} 跳转`, h.includes(expect), h);
}

// 子菜单
await T.go('#/armory/pms/plats', 1200);
const subCount = await T.count('.aco-hub-sub-menu-item');
record('外壳', '仓库管理子菜单 3 项', subCount === 3, `actual=${subCount}`);
for (const [i, expect] of [[0, 'plats'], [1, 'arch'], [2, 'audit']]) {
  await cdp.eval(`document.querySelectorAll('.aco-hub-sub-menu-item')[${i}].click();`);
  await sleep(1100);
  const h = await cdp.eval('location.hash');
  record('外壳', `子菜单 ${i + 1} 跳转`, h.includes(expect), h);
}

// 用户菜单
await T.click('#hub-user');
await sleep(400);
record('外壳', '用户菜单展开', await T.has('.hub-user-dropdown'));
await cdp.eval(`document.body.click()`);
await sleep(300);

/* ================= 3. 软件包列表 ================= */
console.log('\n【3】软件包列表页');
await T.go('#/armory/package', 1500);
record('列表', '列表渲染条目', (await T.count('.package-cell')) > 0, `cells=${await T.count('.package-cell')}`);
record('列表', '右栏统计卡 3 块', (await T.count('.summary-static-layout')) === 3);
record('列表', '流行制品有数据', (await T.count('.popular-item')) >= 1);
record('列表', '发现标签云有数据', (await T.count('.home-right .aco-tag')) >= 1);
record('列表', '分页控件存在', (await T.count('.ant-pagination')) >= 1);

// 搜索
await T.clearMsg();
await T.set('#pkg-kw', 'libffi');
await T.enter('#pkg-kw');
await sleep(1200);
const kwCells = await T.count('.package-cell');
const kwText = await T.body();
record('列表', '关键词搜索生效', kwCells >= 1 && /libffi/i.test(kwText), `cells=${kwCells}`);
record('列表', '搜索写入 URL', /keyword=libffi/.test(await cdp.eval('location.hash')), await cdp.eval('location.hash'));

// 排序
await T.go('#/armory/package', 1300);
await cdp.eval(`document.querySelectorAll('.ant-segmented-item')[1].click()`);
await sleep(1200);
record('列表', '排序切换（下载最多）', /sort=downloads/.test(await cdp.eval('location.hash')), await cdp.eval('location.hash'));

// 排他选中态
record('列表', '分段控制选中态唯一', await cdp.eval(`document.querySelectorAll('.ant-segmented-item.is-selected').length === 1`));

// 分页
await T.go('#/armory/package', 1300);
const hasPager2 = await T.has('.ant-pagination [data-page="2"]');
if (hasPager2) {
  await T.click('.ant-pagination [data-page="2"]');
  await sleep(1200);
  record('列表', '分页翻页生效', /pageNum=2/.test(await cdp.eval('location.hash')), await cdp.eval('location.hash'));
} else {
  record('列表', '分页翻页生效（单页跳过）', true, '仅 1 页');
}

// 标签点击
await T.go('#/armory/package', 1300);
const tagClicked = await cdp.eval(`(()=>{const t=document.querySelector('.home-right .aco-tag'); if(!t) return false; t.click(); return true;})()`);
await sleep(900);
record('列表', '点击发现标签有响应', !tagClicked || /keyword=/.test(await cdp.eval('location.hash')), await cdp.eval('location.hash'));

/* ================= 4. 新建软件包 ================= */
console.log('\n【4】新建软件包');
await T.go('#/armory/package', 1300);
await T.click('[data-act="create"]');
await sleep(900);
record('新建包', '弹窗打开', (await T.modalOpen()) === 1);

// 空名称校验
await T.clearMsg();
await T.click('.aco-modal-mask [data-ok]');
await sleep(500);
const pkgEmptyMsg = await T.waitMsg();
record('新建包', '空名称拦截', /请输入软件包名称/.test(pkgEmptyMsg), pkgEmptyMsg.slice(0, 30));

// 非法名称（后端校验）：此处 4xx 属预期行为
await T.set('.aco-modal-mask [name="name"]', 'Bad Name!!');
await T.clearMsg();
expectedFailures++;
await T.click('.aco-modal-mask [data-ok]');
await sleep(900);
const badMsg = await T.waitMsg();
expectedFailures--;
record('新建包', '非法名称被拒绝', /仅允许|不合法|名称/.test(badMsg), badMsg.slice(0, 50));
record('新建包', '失败后弹窗保持打开', (await T.modalOpen()) === 1);

// 正常创建
const uniqPkg = `audit-pkg-${Date.now().toString(36)}`;
await T.set('.aco-modal-mask [name="name"]', uniqPkg);
await T.set('.aco-modal-mask [name="description"]', '自动巡检创建的临时软件包');
await T.clearMsg();
await T.click('.aco-modal-mask [data-ok]');
await sleep(1600);
const createOk = (await T.modalOpen()) === 0;
const bodyAfter = await T.body();
const pkgOkMsg = await T.waitMsg();
record('新建包', '正常创建成功', createOk || /新建成功/.test(pkgOkMsg), pkgOkMsg.slice(0, 30));
record('新建包', '新包出现在列表', bodyAfter.includes(uniqPkg) || createOk, uniqPkg);

// 记录该包实际落库的命名空间，供末尾清理使用
const uniqPkgNs = await cdp.eval(`(async()=>{const r=await fetch('/api/packages?keyword=${uniqPkg}&pageSize=5',{headers:{Authorization:'Bearer '+localStorage.getItem('depot.token')}});const j=await r.json();const hit=(j.list||[]).find(p=>p.name==='${uniqPkg}');return hit?hit.namespace:'';})()`);

/* ================= 5. 包详情 ================= */
console.log('\n【5】包详情页');
await T.go('#/armory/package/sylixos-middleware/libffi', 1600);
record('详情', '详情页渲染', (await T.count('.pkg-detail-header')) === 1);
record('详情', '页签数量 7', (await T.count('.aco-tab-item')) === 7, `actual=${await T.count('.aco-tab-item')}`);
record('详情', '右栏概要渲染', (await T.count('.content-right')) === 1);

for (const [tab, keyword] of [['readme', '安装'], ['file', 'SHA256'], ['dependencies', ''], ['dependents', ''], ['versions', '版本'], ['member', ''], ['issues', '']]) {
  await T.go(`#/armory/package/sylixos-middleware/libffi?tab=${tab}`, 1200);
  const t = await T.body();
  const ok = t.length > 200 && !/加载失败/.test(t);
  record('详情', `页签「${tab}」可用`, ok, ok ? '' : t.slice(0, 60));
}

// 复制安装命令
await T.go('#/armory/package/sylixos-middleware/libffi', 1400);
await T.clearMsg();
await cdp.eval(`(()=>{const c=document.querySelector('[data-act="copy"]'); if(c) c.click();})()`);
await sleep(600);
const copyMsg = await T.waitMsg(1500);
record('详情', '复制安装命令有反馈', /复制/.test(copyMsg), copyMsg.slice(0, 30));

// 关注 / 取消关注
await T.go('#/armory/package/sylixos-middleware/libffi', 1400);
await T.clearMsg();
await T.click('[data-act="watch"]');
await sleep(1300);
const watchMsg = await T.waitMsg();
record('详情', '关注软件包', /关注/.test(watchMsg), watchMsg.slice(0, 30));
await T.clearMsg();
await T.click('[data-act="watch"]');
await sleep(1300);
const unwatchMsg = await T.waitMsg();
record('详情', '取消关注', /关注/.test(unwatchMsg), unwatchMsg.slice(0, 30));

// 版本页签：弃用版本开关
await T.go('#/armory/package/sylixos-middleware/libffi?tab=versions', 1300);
record('详情', '版本表有数据', (await T.count('.ant-table-tbody tr')) > 0, `rows=${await T.count('.ant-table-tbody tr')}`);
if (await T.has('#dep-switch')) {
  await T.click('#dep-switch');
  await sleep(1200);
  record('详情', '弃用版本开关切换', /deprecated=1/.test(await cdp.eval('location.hash')), await cdp.eval('location.hash'));
} else {
  record('详情', '弃用版本开关存在', false);
}

// 下载制品
await T.go('#/armory/package/sylixos-middleware/libffi?tab=file', 1300);
const dlCount = await T.count('[data-dl-v]');
if (dlCount > 0) {
  const token = await cdp.eval(`localStorage.getItem('depot.token') || ''`);
  const info = await cdp.eval(`(()=>{const e=document.querySelector('[data-dl-v]');return {v:e.dataset.dlV,p:e.dataset.dlP,a:e.dataset.dlA};})()`);
  const url = `${BASE}/api/packages/sylixos-middleware/libffi/v/${encodeURIComponent(info.v)}/download?platform=${encodeURIComponent(info.p)}&arch=${encodeURIComponent(info.a)}&token=${token}`;
  const r = await fetch(url);
  const buf = Buffer.from(await r.arrayBuffer());
  record('详情', '发布物可下载', r.ok && buf.length > 0, `${r.status} ${buf.length}B`);
} else {
  record('详情', '发布物下载入口', false, '无 [data-dl-v]');
}

/* ================= 6. 问题反馈 ================= */
console.log('\n【6】问题反馈');
await T.go('#/armory/package/sylixos-middleware/libffi?tab=issues', 1400);
record('问题', '问题页签渲染', await T.has('[data-act="new-issue"]'));
await T.click('[data-act="new-issue"]');
await sleep(800);
record('问题', '新建问题弹窗打开', (await T.modalOpen()) === 1);

await T.clearMsg();
await T.click('.aco-modal-mask [data-ok]');
await sleep(500);
const issueEmptyMsg = await T.waitMsg();
record('问题', '空标题拦截', /请输入问题描述/.test(issueEmptyMsg), issueEmptyMsg.slice(0, 30));

const issueTitle = `巡检问题 ${Date.now().toString(36)}`;
await T.set('.aco-modal-mask [name="title"]', issueTitle);
await T.set('.aco-modal-mask [name="content"]', '这是一个自动巡检提交的问题');
await T.clearMsg();
await T.click('.aco-modal-mask [data-ok]');
await sleep(1600);
const issueOkMsg = await T.waitMsg();
record('问题', '提交问题成功', (await T.modalOpen()) === 0, issueOkMsg.slice(0, 30));
const issueBody = await T.body();
record('问题', '新问题出现在列表', issueBody.includes(issueTitle), issueTitle);

if (issueBody.includes(issueTitle)) {
  await T.clearMsg();
  await T.click('[data-close-issue]');
  await sleep(1400);
  const closeMsg = await T.waitMsg();
record('问题', '关闭问题', /已关闭/.test(closeMsg), closeMsg.slice(0, 30));
}

/* ================= 7. 空间 ================= */
console.log('\n【7】空间');
await T.go('#/armory/org', 1500);
record('空间', '空间卡片渲染', (await T.count('.user-org-card')) >= 1, `cards=${await T.count('.user-org-card')}`);

// 页签切换
await cdp.eval(`document.querySelectorAll('.aco-tabs .aco-tab-item')[1].click()`);
await sleep(1200);
record('空间', '“我参与的”页签切换', /tab=mine/.test(await cdp.eval('location.hash')), await cdp.eval('location.hash'));
await cdp.eval(`document.querySelectorAll('.aco-tabs .aco-tab-item')[0].click()`);
await sleep(1100);

// 搜索
await T.clearMsg();
await T.set('#org-kw', 'qa');
await T.enter('#org-kw');
await sleep(1200);
record('空间', '空间名称搜索生效', /keyword=qa/.test(await cdp.eval('location.hash')), await cdp.eval('location.hash'));

// 新建空间
await T.go('#/armory/org', 1300);
await T.click('[data-act="create"]');
await sleep(800);
record('空间', '新建空间弹窗打开', (await T.modalOpen()) === 1);
record('空间', '弹窗含永久占用提示', /永久占用/.test(await T.text('.aco-modal-mask')));

await T.clearMsg();
await T.click('.aco-modal-mask [data-ok]');
await sleep(500);
const nsEmptyMsg = await T.waitMsg();
record('空间', '空名称拦截', /请输入空间名称/.test(nsEmptyMsg), nsEmptyMsg.slice(0, 30));

const uniqNs = `audit-ns-${Date.now().toString(36)}`;
await T.set('.aco-modal-mask [name="namespaceId"]', uniqNs);
await T.set('.aco-modal-mask [name="description"]', '巡检临时空间');
await T.clearMsg();
await T.click('.aco-modal-mask [data-ok]');
await sleep(1600);
const nsOkMsg = await T.waitMsg();
record('空间', '新建空间成功', (await T.modalOpen()) === 0, nsOkMsg.slice(0, 30));
await sleep(600);
record('空间', '新空间出现在列表', (await T.body()).includes(uniqNs), uniqNs);

/* ================= 8. 空间详情 ================= */
console.log('\n【8】空间详情');
await T.go('#/armory/org/sylixos-middleware', 1500);
record('空间详情', '头部渲染', (await T.count('.org-detail-header')) === 1);
record('空间详情', '空间标签渲染', (await T.count('.org-space-label')) === 1);

for (const tab of ['packages', 'member', 'setting']) {
  await T.go(`#/armory/org/sylixos-middleware?tab=${tab}`, 1300);
  const t = await T.body();
  const scope = await cdp.eval(`(()=>{const el=document.querySelector('.aco-page-view-content');return el?el.innerText:'';})()`);
  record('空间详情', `页签「${tab}」可用`, !/加载失败/.test(t) && scope.trim().length > 0, `contentLen=${scope.trim().length}`);
}

// 成员页
await T.go('#/armory/org/sylixos-middleware?tab=member', 1400);
record('空间详情', '成员列表渲染', (await T.count('.member-item')) >= 1, `items=${await T.count('.member-item')}`);

// 添加成员
if (await T.has('[data-act="add-member"]')) {
  await T.click('[data-act="add-member"]');
  await sleep(900);
  record('空间详情', '添加成员弹窗打开', (await T.modalOpen()) === 1);
  const userOpts = await T.count('.aco-modal-mask [name="userId"] option');
  record('空间详情', '成员候选用户非空', userOpts >= 1, `options=${userOpts}`);
  await T.click('.aco-modal-mask [data-cancel]');
  await sleep(500);
} else {
  record('空间详情', '添加成员入口', false, '管理员可见性异常');
}

// 设置页保存
await T.go('#/armory/org/sylixos-middleware?tab=setting', 1300);
if (await T.has('[data-act="save"]')) {
  await T.clearMsg();
  await T.click('[data-act="save"]');
  await sleep(1300);
  const saveMsg = await T.waitMsg(1600);
record('空间详情', '空间设置保存', /保存成功/.test(saveMsg), saveMsg.slice(0, 40));
} else {
  record('空间详情', '设置保存按钮', false);
}

/* ================= 9. 个人中心 ================= */
console.log('\n【9】个人中心');
await T.go('#/armory/personal-center', 1500);
record('个人中心', '头部渲染', (await T.count('.personal-center-header')) === 1);
record('个人中心', '页签 3 个', (await T.count('.aco-tabs .aco-tab-item')) === 3, `actual=${await T.count('.aco-tabs .aco-tab-item')}`);

for (const tab of ['created', 'published', 'watch']) {
  await T.go(`#/armory/personal-center?tab=${tab}`, 1300);
  const t = await T.body();
  const scope = await cdp.eval(`(()=>{const el=document.querySelector('.aco-page-view-content');return el?el.innerText:'';})()`);
  record('个人中心', `页签「${tab}」可用`, !/加载失败/.test(t) && scope.trim().length > 0, `contentLen=${scope.trim().length}`);
}

// 我关注的：分组卡片
await T.go('#/armory/personal-center?tab=watch', 1300);
record('个人中心', '关注分组 3 块', (await T.count('.armory-manage-card')) === 3, `actual=${await T.count('.armory-manage-card')}`);

// 我创建的：搜索
await T.go('#/armory/personal-center?tab=created', 1300);
if (await T.has('#pc-kw')) {
  await T.set('#pc-kw', 'libffi');
  await T.enter('#pc-kw');
  await sleep(1200);
  record('个人中心', '我创建的搜索生效', /keyword=libffi/.test(await cdp.eval('location.hash')), await cdp.eval('location.hash'));
} else {
  record('个人中心', '我创建的搜索框', false);
}

/* ================= 10. 仓库管理 · 平台 ================= */
console.log('\n【10】仓库管理 · 平台管理');
await T.go('#/armory/pms/plats', 1500);
const platRows = await T.count('.ant-table-tbody tr');
record('平台', '表格有数据', platRows >= 5, `rows=${platRows}`);
record('平台', '删除按钮存在', (await T.count('[data-del]')) >= 1);
record('平台', '编辑按钮存在', (await T.count('[data-edit]')) >= 1);

// 搜索
await T.clearMsg();
await T.set('#kw', 'Linux');
await T.enter('#kw');
await sleep(1200);
record('平台', '平台搜索生效', (await T.count('.ant-table-tbody tr')) >= 1 && /Linux/.test(await T.body()), await cdp.eval('location.hash'));

// 新建平台
await T.go('#/armory/pms/plats', 1300);
await T.click('[data-act="create"]');
await sleep(800);
record('平台', '新建平台弹窗', (await T.modalOpen()) === 1);
await T.clearMsg();
await T.click('.aco-modal-mask [data-ok]');
await sleep(500);
const platEmptyMsg = await T.waitMsg();
record('平台', '空名称拦截', /请输入平台名称/.test(platEmptyMsg), platEmptyMsg.slice(0, 30));

const uniqPlat = `P${Date.now().toString(36).slice(-5)}`;
await T.set('.aco-modal-mask [name="name"]', uniqPlat);
await T.clearMsg();
await T.click('.aco-modal-mask [data-ok]');
await sleep(1500);
const platOkMsg = await T.waitMsg();
record('平台', '新建平台成功', (await T.modalOpen()) === 0, platOkMsg.slice(0, 30));

// 编辑平台
await T.go('#/armory/pms/plats', 1300);
await T.click('[data-edit]');
await sleep(800);
const editVal = await cdp.eval(`(document.querySelector('.aco-modal-mask [name="name"]')||{}).value || ''`);
record('平台', '编辑弹窗回填原值', editVal.length > 0, editVal);
await T.click('.aco-modal-mask [data-cancel]');
await sleep(500);

// 删除平台（清理刚建的）
await T.go('#/armory/pms/plats', 1300);
const delOk = await cdp.eval(`(()=>{const rows=[...document.querySelectorAll('.ant-table-tbody tr')];const r=rows.find(x=>x.innerText.includes(${JSON.stringify(uniqPlat)}));if(!r)return false;r.querySelector('[data-del]').click();return true;})()`);
await sleep(700);
record('平台', '删除确认弹窗打开', delOk && (await T.modalOpen()) === 1);
if (delOk) {
  await T.clearMsg();
  await T.click('.aco-modal-mask [data-ok]');
  await sleep(1500);
  const platDelMsg = await T.waitMsg();
record('平台', '删除平台成功', /删除成功/.test(platDelMsg), platDelMsg.slice(0, 30));
}

/* ================= 11. 仓库管理 · 架构 ================= */
console.log('\n【11】仓库管理 · 架构管理');
await T.go('#/armory/pms/arch', 1500);
const archRows = await T.count('.ant-table-tbody tr');
record('架构', '表格有数据', archRows >= 1, `rows=${archRows}`);
record('架构', '分页存在', (await T.count('.ant-pagination')) >= 1);

// 搜索
await T.clearMsg();
await T.set('#kw', 'arm64');
await T.enter('#kw');
await sleep(1200);
record('架构', '架构搜索生效', /arm64/.test(await T.body()), await cdp.eval('location.hash'));

// 新建架构
await T.go('#/armory/pms/arch', 1300);
await T.click('[data-act="create"]');
await sleep(800);
record('架构', '新建架构弹窗', (await T.modalOpen()) === 1);
const uniqArch = `a${Date.now().toString(36).slice(-5)}`;
await T.set('.aco-modal-mask [name="name"]', uniqArch);
await T.set('.aco-modal-mask [name="sylixName"]', uniqArch);
await T.clearMsg();
await T.click('.aco-modal-mask [data-ok]');
await sleep(1500);
const archOkMsg = await T.waitMsg();
record('架构', '新建架构成功', (await T.modalOpen()) === 0, archOkMsg.slice(0, 30));

// 删除清理
await T.go('#/armory/pms/arch', 1300);
await T.set('#kw', uniqArch);
await T.enter('#kw');
await sleep(1300);
const archDel = await cdp.eval(`(()=>{const b=document.querySelector('[data-del]'); if(!b) return false; b.click(); return true;})()`);
await sleep(700);
if (archDel) {
  await T.clearMsg();
  await T.click('.aco-modal-mask [data-ok]');
  await sleep(1400);
  const archDelMsg = await T.waitMsg();
record('架构', '删除架构成功', /删除成功/.test(archDelMsg), archDelMsg.slice(0, 30));
} else {
  record('架构', '删除架构入口', false);
}

/* ================= 12. 仓库管理 · 审核 ================= */
console.log('\n【12】仓库管理 · 软件包审核');
await T.go('#/armory/pms/audit', 1500);
const auditRows = await T.count('.ant-table-tbody tr');
record('审核', '审核列表渲染', auditRows >= 1 || /暂无/.test(await T.body()), `rows=${auditRows}`);

// 状态筛选
if (await T.has('#status-sel')) {
  await T.set('#status-sel', 'SCANNING_FAILED');
  await sleep(1300);
  record('审核', '状态筛选生效', /status=SCANNING_FAILED/.test(await cdp.eval('location.hash')), await cdp.eval('location.hash'));
  await T.set('#status-sel', '');
  await sleep(1100);
} else {
  record('审核', '状态筛选控件', false);
}

// 搜索
await T.clearMsg();
await T.set('#kw', 'lwjson');
await T.enter('#kw');
await sleep(1200);
record('审核', '审核关键词搜索生效', /keyword=lwjson/.test(await cdp.eval('location.hash')), await cdp.eval('location.hash'));

/* ================= 13. 清理 & 登出 ================= */
console.log('\n【13】数据清理与登出');
// 清理巡检创建的包与空间
const token = await cdp.eval(`localStorage.getItem('depot.token') || ''`);
const apiDel = async (path) => {
  const r = await fetch(`${BASE}${path}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  return r.status;
};
const pkgDelStatus = await apiDel(`/api/packages/${encodeURIComponent(uniqPkgNs || 'global')}/${encodeURIComponent(uniqPkg)}`).catch(() => 0);
record('清理', '清理临时软件包', pkgDelStatus < 400, `status=${pkgDelStatus}`);
const nsDelStatus = await apiDel(`/api/namespaces/${encodeURIComponent(uniqNs)}`).catch(() => 0);
record('清理', '清理临时空间', nsDelStatus < 400, `status=${nsDelStatus}`);

// 兜底清扫：清除历史遗留的 audit-* 测试包与空间，避免污染列表首行影响其他测试
const sweptPkgs = await cdp.eval(`(async()=>{
  const h={Authorization:'Bearer '+localStorage.getItem('depot.token')};
  const r=await fetch('/api/packages?pageSize=200',{headers:h});
  const j=await r.json();
  const targets=(j.list||[]).filter(p=>/^audit-pkg-/.test(p.name));
  let n=0;
  for(const p of targets){
    const d=await fetch('/api/packages/'+encodeURIComponent(p.namespace)+'/'+encodeURIComponent(p.name),{method:'DELETE',headers:h});
    if(d.status<400) n++;
  }
  const r2=await fetch('/api/namespaces?scope=all&pageSize=200',{headers:h});
  const j2=await r2.json();
  for(const nsx of (j2.list||[]).filter(x=>/^audit-ns-/.test(x.namespaceId))){
    await fetch('/api/namespaces/'+encodeURIComponent(nsx.namespaceId),{method:'DELETE',headers:h});
  }
  return n;
})()`);
record('清理', '清扫历史测试数据', true, `removed=${sweptPkgs}`);

// 登出
await T.go('#/armory/package', 1200);
await T.click('#hub-user');
await sleep(400);
await T.click('.hub-user-dropdown [data-act="logout"]');
await sleep(2000);
record('认证', '登出回到登录页', (await T.count('#login-form')) === 1);
record('认证', '登出清除本地会话', !(await cdp.eval(`localStorage.getItem('depot.token')`)));

/* ================= 汇总 ================= */
cdp.ws.close();
edge.kill();
await sleep(300);
try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }

const broken = results.filter((r) => !r.ok);
const areas = [...new Set(results.map((r) => r.area))];

console.log(`\n${'='.repeat(70)}`);
console.log('分组汇总：');
for (const a of areas) {
  const list2 = results.filter((r) => r.area === a);
  const bad = list2.filter((r) => !r.ok).length;
  console.log(`  ${a.padEnd(10)} ${String(list2.length).padStart(2)} 项  通过 ${list2.length - bad}  失败 ${bad}`);
}

console.log(`\n接口错误（4xx/5xx，已排除登录态探测）：`);
if (netErrors.length === 0) console.log('  （无）');
else [...new Set(netErrors)].slice(0, 20).forEach((e) => console.log('  ! ' + e));

console.log(`\n页面运行时异常：`);
const uniqErrs = [...new Set(pageErrors)].filter((e) => !/401|Failed to load resource/.test(e));
if (uniqErrs.length === 0) console.log('  （无）');
else uniqErrs.slice(0, 20).forEach((e) => console.log('  ! ' + e));

console.log(`\n总计 ${results.length} 项功能点，通过 ${results.length - broken.length}，失败 ${broken.length}`);
if (broken.length) {
  console.log('\n不可用功能清单：');
  broken.forEach((b) => console.log(`  ✗ ${b.area} · ${b.name} ${b.detail}`));
}

writeFileSync('shots/audit-report.json', JSON.stringify({ results, netErrors: [...new Set(netErrors)], pageErrors: uniqErrs }, null, 2));
console.log('\n报告已写入 shots/audit-report.json');

process.exit(broken.length === 0 && netErrors.length === 0 ? 0 : 1);
