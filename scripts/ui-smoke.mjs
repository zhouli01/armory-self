// 前端界面端到端冒烟：无头 Edge + CDP 真实驱动页面（对齐翼辉云枢 aco-hub 新版 UI）
// 用法: node scripts/ui-smoke.mjs [baseUrl]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:7310';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333;

const profile = mkdtempSync(join(tmpdir(), 'depot-ui-'));
const errors = [];
let pass = 0;
const fails = [];

function check(name, ok, extra = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fails.push(name); console.log(`  FAIL  ${name} ${extra}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 启动浏览器 ----------
const edge = spawn(EDGE, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--window-size=1440,900',
  'about:blank',
], { stdio: 'ignore' });

async function waitDevtools() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return await r.json();
    } catch { /* not ready */ }
    await sleep(250);
  }
  throw new Error('DevTools 未能启动');
}

// ---------- 极简 CDP 客户端 ----------
class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.ready = new Promise((res, rej) => {
      this.ws.onopen = () => res();
      this.ws.onerror = () => rej(new Error('ws error'));
    });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) {
        (this.handlers.get(msg.method) || []).forEach((fn) => fn(msg.params));
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
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`timeout ${method}`)); }
      }, 20000);
    });
  }
  async eval(expr, awaitPromise = false) {
    const r = await this.send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise, userGesture: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    }
    return r.result.value;
  }
  close() { try { this.ws.close(); } catch { /* ignore */ } }
}

const ver = await waitDevtools();
console.log(`\n== 无头浏览器: Edge ${ver.Browser} ==\n`);

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page');
const cdp = new CDP(target.webSocketDebuggerUrl);
await cdp.ready;

cdp.on('Runtime.exceptionThrown', (p) => {
  errors.push(`未捕获异常: ${p.exceptionDetails.exception?.description || p.exceptionDetails.text}`);
});
cdp.on('Runtime.consoleAPICalled', (p) => {
  if (p.type === 'error') {
    errors.push(`console.error: ${p.args.map((a) => a.value ?? a.description).join(' ')}`);
  }
});
cdp.on('Log.entryAdded', (p) => {
  if (p.entry.level === 'error') errors.push(`log: ${p.entry.text} ${p.entry.url || ''}`);
});

await cdp.send('Runtime.enable');
await cdp.send('Log.enable');
await cdp.send('Page.enable');
await cdp.send('DOM.enable');

async function goto(hash, waitMs = 1000) {
  await cdp.eval(`location.hash = ${JSON.stringify(hash)}; window.dispatchEvent(new Event('hashchange'));`);
  await sleep(waitMs);
}
async function text(sel) {
  return cdp.eval(`(document.querySelector(${JSON.stringify(sel)})||{}).innerText || ''`);
}
async function bodyText() {
  return cdp.eval(`document.body.innerText`);
}
async function count(sel) {
  return cdp.eval(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
}
async function click(sel) {
  return cdp.eval(`(()=>{const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return false; el.click(); return true;})()`);
}

// ---------- 1. 登录页 ----------
console.log('== 1. 登录页 ==');
await cdp.send('Page.navigate', { url: `${BASE}/` });
await cdp.eval('localStorage.clear();');
await cdp.send('Page.navigate', { url: `${BASE}/` });
await sleep(1500);
check('登录表单渲染', (await count('#login-form')) === 1);
check('品牌标题为翼辉云枢', (await bodyText()).includes('翼辉云枢'));
check('演示账号提示', (await bodyText()).includes('admin / admin123'));

// 错误密码
await cdp.eval(`document.querySelector('[name="username"]').value='admin';document.querySelector('[name="password"]').value='wrong';`);
await click('#login-btn');
await sleep(1000);
check('错误密码提示', /失败|错误|密码/.test(await bodyText()));

// 正确登录
await cdp.eval(`document.querySelector('[name="username"]').value='admin';document.querySelector('[name="password"]').value='admin123';`);
await click('#login-btn');
await sleep(2000);
check('登录后进入应用外壳', (await count('.aco-hub-header')) === 1);
check('左侧导航 4 项', (await count('.aco-hub-aside-menu-item')) === 4);
check('子侧栏菜单渲染', (await count('.aco-hub-sub-menu-item')) >= 1);
check('本地会话已保存', !!(await cdp.eval(`localStorage.getItem('depot.token')`)));

// ---------- 2. 软件包列表（首页） ----------
console.log('== 2. 软件包列表 ==');
await goto('#/armory/package', 1400);
const cells = await count('.package-cell');
check('软件包列表有数据', cells > 0, `cells=${cells}`);
check('右栏统计卡 3 张', (await count('.summary-static-layout')) === 3, String(await count('.summary-static-layout')));
check('流行制品条目', (await count('.popular-item')) >= 1);
check('发现标签云', (await count('.home-right .aco-tag')) >= 1);
check('搜索输入框存在', (await count('#pkg-kw')) === 1);
check('排序分段控制器', (await count('.ant-segmented-item')) === 3);
check('分页组件存在', (await count('.ant-pagination')) >= 1);

// 关键词筛选
await cdp.eval(`(()=>{const i=document.querySelector('#pkg-kw');i.value='';i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));})()`);
await sleep(900);
const allCells = await count('.package-cell');
await cdp.eval(`(()=>{const i=document.querySelector('#pkg-kw');i.value='lib';i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));})()`);
await sleep(1200);
const filtered = await count('.package-cell');
check('关键词筛选生效', filtered >= 1 && filtered <= allCells, `filtered=${filtered}/${allCells}`);

// 点进详情（选一个确实有发布版本的包，避免测试残留包无版本导致误判）
await goto('#/armory/package', 1200);
const clicked = await cdp.eval(`(()=>{
  const cells=[...document.querySelectorAll('.package-cell')];
  const pick=cells.find(c=>!/audit-/.test(c.innerText))||cells[0];
  if(!pick) return null;
  const r=pick.querySelector('.label'); if(!r) return null; r.click(); return location.hash;
})()`);
await sleep(1600);
check('点击包名进详情页', /^#\/armory\/package\/[^/]+\/[^/]+/.test(await cdp.eval('location.hash')), String(clicked));

// ---------- 3. 包详情 7 个页签 ----------
console.log('== 3. 包详情 ==');
check('详情头部含包名', (await count('.pkg-detail-header')) === 1);
check('页签数量 7', (await count('.aco-tab-item')) === 7, `tabs=${await count('.aco-tab-item')}`);
check('右栏概要存在', (await count('.content-right')) === 1);
check('安装命令块', (await bodyText()).includes('aco get'));
const detailHash = await cdp.eval('location.hash');

for (const t of ['readme', 'file', 'dependencies', 'dependents', 'versions', 'member', 'issues']) {
  await goto(detailHash.split('?')[0] + `?tab=${t}`, 1100);
  const t2 = await bodyText();
  check(`页签「${t}」有内容`, t2.length > 60 && !/加载失败/.test(t2), `len=${t2.length}`);
}

// 版本页签：弃用版本开关
await goto(detailHash.split('?')[0] + '?tab=versions', 1100);
check('版本表有行', (await count('.ant-table-tbody tr')) > 0, `rows=${await count('.ant-table-tbody tr')}`);
check('弃用版本开关存在', (await count('#dep-switch')) === 1);
await click('#dep-switch');
await sleep(1100);
check('开关切换更新 URL', /deprecated=1/.test(await cdp.eval('location.hash')), await cdp.eval('location.hash'));

// ---------- 4. 空间 ----------
console.log('== 4. 空间 ==');
await goto('#/armory/org', 1300);
const orgCards = await count('.user-org-card');
check('空间卡片有数据', orgCards >= 1, `cards=${orgCards}`);
check('页签全部空间/我参与的', (await count('.aco-tabs .aco-tab-item')) === 2);

await click('.user-org-card');
await sleep(1400);
check('点击卡片进空间详情', /^#\/armory\/org\/[^/]+$/.test(await cdp.eval('location.hash')), await cdp.eval('location.hash'));
check('空间详情头部渲染', (await count('.org-detail-header')) === 1);
for (const t of ['packages', 'member', 'setting']) {
  await cdp.eval(`location.hash = location.hash.split('?')[0] + '?tab=${t}'; window.dispatchEvent(new Event('hashchange'));`);
  await sleep(1100);
  const tt = await bodyText();
  check(`空间页签「${t}」有内容`, tt.length > 60 && !/加载失败/.test(tt), `len=${tt.length}`);
}

// ---------- 5. 个人中心 ----------
console.log('== 5. 个人中心 ==');
await goto('#/armory/personal-center', 1300);
check('个人中心头部渲染', (await count('.personal-center-header')) === 1);
check('三个页签', (await count('.aco-tabs .aco-tab-item')) === 3, String(await count('.aco-tabs .aco-tab-item')));
check('我创建的有数据', (await count('.package-cell')) >= 1 || (await bodyText()).includes('暂无软件包'));

// ---------- 6. 仓库管理 ----------
console.log('== 6. 仓库管理 ==');
await goto('#/armory/pms/plats', 1300);
check('平台管理表格', (await count('.ant-table-tbody tr')) >= 5, `rows=${await count('.ant-table-tbody tr')}`);
check('仓库管理 3 页签', (await count('.aco-tabs .aco-tab-item')) === 3);

// 打开新建平台弹窗
await click('[data-act="create"]');
await sleep(700);
check('新建平台弹窗打开', (await count('.aco-modal-mask')) === 1);
await click('.ant-modal-close');
await sleep(500);
check('弹窗关闭', (await count('.aco-modal-mask')) === 0);

await goto('#/armory/pms/arch', 1300);
check('架构管理表格', (await count('.ant-table-tbody tr')) >= 1);

await goto('#/armory/pms/audit', 1300);
const auditRows = await count('.ant-table-tbody tr');
check('软件包审核列表', auditRows >= 1 || (await bodyText()).includes('暂无待审核'), `rows=${auditRows}`);

// ---------- 收尾 ----------
cdp.close();
edge.kill();
await sleep(300);
try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }

console.log('\n== 运行时错误 ==');
if (errors.length === 0) console.log('  （无）');
else errors.slice(0, 20).forEach((e) => console.log('  ! ' + e));

const unexpected = errors.filter((e) => !/401|Login Required|Failed to load resource/.test(e));
console.log(`\n结果: PASS=${pass} FAIL=${fails.length} 运行时报错=${unexpected.length}`);
if (fails.length) console.log('失败项: ' + fails.join(' / '));

process.exit(fails.length === 0 && unexpected.length === 0 ? 0 : 1);
