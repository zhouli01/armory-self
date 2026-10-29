import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));

const PORT = 9333;
const args = ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run', '--disable-gpu', '--window-size=1600,1000', '--user-data-dir=' + fs.mkdtempSync('C:/Windows/Temp/edge-probe-'), 'about:blank'];
const proc = spawn(EDGE, args, { stdio: 'ignore' });
let wsUrl = '';
for (let i = 0; i < 40; i++) {
  await sleep(250);
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const j = await r.json();
    const page = j.find((t) => t.type === 'page');
    if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
  } catch {}
}
const ws = new WebSocket(wsUrl);
await new Promise((res) => ws.addEventListener('open', res));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return { __err: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text };
  return r.result?.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:7310/' });
await sleep(1500);

// 登录
await evaluate(`(async()=>{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'admin123'})});const j=await r.json();localStorage.setItem('depot.token',j.token);localStorage.setItem('depot.user',JSON.stringify(j.user));})()`);
await send('Page.navigate', { url: 'http://127.0.0.1:7310/#/armory/org/sylixos-middleware?tab=member' });
await sleep(2500);
await send('Page.navigate', { url: 'http://127.0.0.1:7310/#/armory/org/sylixos-middleware?tab=member' });
await sleep(2000);

console.log('--- member 页签 body 长度 ---');
console.log(await evaluate(`document.body.innerText.length`));
console.log('--- member 页签 body 文本 ---');
console.log((await evaluate(`document.body.innerText`)).slice(0, 1200));
console.log('--- add-member 按钮数 ---');
console.log(await evaluate(`document.querySelectorAll('[data-act="add-member"]').length`));
console.log('--- 当前 user ---');
console.log(JSON.stringify(await evaluate(`JSON.parse(localStorage.getItem('depot.user')||'null')`)));
console.log('--- 接口 permissions ---');
console.log(await evaluate(`(async()=>{const r=await fetch('/api/namespaces/sylixos-middleware',{headers:{Authorization:'Bearer '+localStorage.getItem('depot.token')}});const j=await r.json();return JSON.stringify(j.permissions);})()`));

console.log('\n--- 个人中心 watch ---');
await send('Page.navigate', { url: 'http://127.0.0.1:7310/#/armory/personal-center?tab=watch' });
await sleep(2500);
console.log('cards=', await evaluate(`document.querySelectorAll('.armory-manage-card').length`));
console.log('body=', (await evaluate(`document.body.innerText`)).slice(0, 900));

ws.close();
proc.kill();
process.exit(0);
