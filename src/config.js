'use strict';

const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

module.exports = {
  ROOT,
  PORT: Number(process.env.PORT || 7310),
  HOST: process.env.HOST || '127.0.0.1',
  DATA_DIR: path.join(ROOT, 'data'),
  DB_FILE: path.join(ROOT, 'data', 'db.json'),
  STORAGE_DIR: path.join(ROOT, 'storage'),
  PUBLIC_DIR: path.join(ROOT, 'public'),
  SESSION_TTL_MS: 1000 * 60 * 60 * 24 * 7,
  MAX_UPLOAD_BYTES: 200 * 1024 * 1024,
};
