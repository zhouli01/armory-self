'use strict';

/**
 * 重置演示数据：删除 data/db.json 与 storage/ 下的制品文件，
 * 下次启动服务时会按 src/seed.js 重新生成同构示例数据。
 *
 * 用法: npm run reset
 */

const fs = require('node:fs');
const path = require('node:path');

const config = require('../src/config');

function main() {
  if (!process.argv.includes('--yes')) {
    console.log('该操作会清空本地数据与制品文件：');
    console.log(`  数据库: ${config.DB_FILE}`);
    console.log(`  制品库: ${config.STORAGE_DIR}`);
    console.log('\n确认执行请加 --yes :  npm run reset -- --yes');
    process.exit(1);
  }

  if (fs.existsSync(config.DB_FILE)) {
    fs.rmSync(config.DB_FILE, { force: true });
    console.log('已删除', config.DB_FILE);
  }
  if (fs.existsSync(config.STORAGE_DIR)) {
    fs.rmSync(config.STORAGE_DIR, { recursive: true, force: true });
    console.log('已清空', config.STORAGE_DIR);
  }
  fs.mkdirSync(config.STORAGE_DIR, { recursive: true });

  // 顺带清掉遗留的临时文件
  const dataDir = path.dirname(config.DB_FILE);
  for (const f of fs.readdirSync(dataDir)) {
    if (f.endsWith('.tmp')) fs.rmSync(path.join(dataDir, f), { force: true });
  }

  console.log('\n重置完成，重新执行 npm start 将生成全新的示例数据。');
}

main();
