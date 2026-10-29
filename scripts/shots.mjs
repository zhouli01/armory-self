// 截图脚本：登录后逐页截图，用于视觉验收（新版 aco-hub 界面）
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:7310';
const OUT = process.argv[3] || 'shots';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9334;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'depot-shot-'));

const edge = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--force-device-scale-factor=1.5', '--window-size=1500,940', 'about:blank',
], { stdio: 'ignore' });

let ver;
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) { ver = await r.json(); break; } } catch { /* wait */ }
  await sleep(250);
}
if (!ver) throw new Error('DevTools 启动失败');
console.log('Edge', ver.Browser);

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
await new Promise((res) => { ws.onopen = res; });
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve } = pending.get(m.id);
    pending.delete(m.id);
    resolve(m.result);
  }
};
function send(method, params = {}) {
  const i = ++id;
  ws.send(JSON.stringify({ id: i, method, params }));
  return new Promise((resolve) => pending.set(i, { resolve }));
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  return r.result?.value;
}
async function shot(name) {
  await sleep(600);
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const file = join(OUT, `${name}.png`);
  writeFileSync(file, Buffer.from(data, 'base64'));
  console.log('  saved', file);
}
async function goTo(hash, wait = 1500) {
  await evaluate(`location.hash=${JSON.stringify(hash)}; window.dispatchEvent(new Event('hashchange'));`);
  await sleep(wait);
}

await send('Page.enable');
await send('Runtime.enable');

// 登录页
await send('Page.navigate', { url: `${BASE}/` });
await evaluate('localStorage.clear();');
await send('Page.navigate', { url: `${BASE}/` });
await sleep(2000);
await shot('01-login');

// 登录
await evaluate(`document.querySelector('[name="username"]').value='admin';document.querySelector('[name="password"]').value='admin123';document.querySelector('#login-btn').click();`);
await sleep(2400);

const pages = [
  ['02-packages', '#/armory/package', 1800],
  ['03-org-list', '#/armory/org', 1600],
  ['04-personal-center', '#/armory/personal-center', 1600],
  ['05-pms-plats', '#/armory/pms/plats', 1600],
  ['06-pms-arch', '#/armory/pms/arch', 1600],
  ['07-pms-audit', '#/armory/pms/audit', 1600],
];
for (const [name, hash, wait] of pages) {
  await goTo(hash, wait);
  await shot(name);
}

// 包详情各页签
const detail = '#/armory/package/sylixos-middleware/libffi';
await goTo(detail, 1800);
await shot('08-detail-readme');
await goTo(`${detail}?tab=versions`, 1500);
await shot('09-detail-versions');
await goTo(`${detail}?tab=file`, 1400);
await shot('10-detail-files');
await goTo(`${detail}?tab=member`, 1400);
await shot('11-detail-members');

// 空间详情
await goTo('#/armory/org/sylixos-middleware', 1600);
await shot('12-org-detail');

// 新建空间弹窗
await goTo('#/armory/org', 1400);
await evaluate(`(()=>{const b=document.querySelector('[data-act="create"]');if(b)b.click();})()`);
await sleep(900);
await shot('13-create-org-modal');

ws.close();
edge.kill();
await sleep(300);
try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
console.log('完成');
