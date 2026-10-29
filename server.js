'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const config = require('./src/config');
const store = require('./src/store');
const api = require('./src/api');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let pathname = decodeURI(url.pathname);
  if (pathname === '/' || pathname === '') pathname = '/index.html';

  const resolved = path.resolve(config.PUBLIC_DIR, `.${pathname}`);
  if (!resolved.startsWith(config.PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(resolved, (err, stat) => {
    if (err || !stat.isFile()) {
      // 单页应用回退
      const fallback = path.join(config.PUBLIC_DIR, 'index.html');
      fs.readFile(fallback, (e2, buf) => {
        if (e2) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('页面不存在');
          return;
        }
        res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
        res.end(buf);
      });
      return;
    }
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(resolved).pipe(res);
  });
}

const startedAt = Date.now();

const server = http.createServer((req, res) => {
  const started = Date.now();
  res.on('finish', () => {
    if (req.url && !req.url.startsWith('/api/audits')) {
      console.log(
        `[depot] ${req.method} ${decodeURI(req.url)} ${res.statusCode} ${Date.now() - started}ms`,
      );
    }
  });

  if (req.url && req.url.startsWith('/api/')) {
    api.handle(req, res);
    return;
  }
  serveStatic(req, res);
});

store.init();
const db = store.db();

server.listen(config.PORT, config.HOST, () => {
  const pkgCount = db.packages.length;
  const verCount = db.versions.length;
  console.log('');
  console.log('  Depot · 企业制品仓库平台');
  console.log('  ------------------------------------------');
  console.log(`  本地地址:  http://${config.HOST}:${config.PORT}`);
  console.log(`  数据文件:  ${config.DB_FILE}`);
  console.log(`  制品目录:  ${config.STORAGE_DIR}`);
  console.log(`  已有数据:  ${db.namespaces.length} 个空间 / ${pkgCount} 个软件包 / ${verCount} 个版本`);
  console.log('  默认账号:  admin / admin123（管理员）  zhouli / user123');
  console.log('  ------------------------------------------');
  console.log('  Ctrl+C 停止服务');
  console.log('');
});

function shutdown(signal) {
  console.log(`\n[depot] 收到 ${signal}，正在保存数据并退出...`);
  try { store.flush(); } catch (e) { console.error('[depot] 保存失败:', e.message); }
  console.log(`[depot] 服务已停止，本次运行 ${Math.round((Date.now() - startedAt) / 1000)}s`);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (e) => {
  console.error('[depot] 未捕获异常:', e);
});
