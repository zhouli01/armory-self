'use strict';

/**
 * 首次启动时生成的同构示例数据。
 * 结构对齐原 Armory 平台：用户 / 空间 / 空间成员 / 软件包 / 版本 / 制品 / 审计。
 * 制品文件会真实写入 storage 目录，下载链路可直接验证。
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const config = require('./config');
const { fmtTime, fmtDay, uuid, sha256, hashPassword } = require('./util');
const { seededRandom } = require('./util');

const rnd = seededRandom(20261028);

function pick(list) {
  return list[Math.floor(rnd() * list.length)];
}

function daysAgoDate(n, hour, minute) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour === undefined ? Math.floor(rnd() * 20) + 1 : hour);
  d.setMinutes(minute === undefined ? Math.floor(rnd() * 60) : minute);
  d.setSeconds(Math.floor(rnd() * 60));
  return d;
}

function makeUser(id, username, realName, role, password, hue) {
  const salt = uuid().replace(/-/g, '');
  return {
    id, username, realName,
    email: `${username}@depot.local`,
    role,
    hue,
    salt,
    passwordHash: hashPassword(password, salt),
    createTime: fmtTime(daysAgoDate(90)),
  };
}

const README_ARMORY_CLI = `# armory-cli

ARMORY 命令行客户端，支持 Windows / macOS / Linux 多平台，提供用户认证、团队管理、
软件包权限定制、发布、下载、检索等能力，帮助研发团队规范化管理制品流转。

## 安装

\`\`\`bash
# Linux / macOS
curl -fsSL http://10.12.7.250/acohub/install.sh | bash

# Windows (PowerShell)
irm http://10.12.7.250/acohub/install.ps1 | iex
\`\`\`

## 常用命令

\`\`\`bash
armory login                       # 登录仓库
armory search libffi               # 检索软件包
armory install @sylixos-middleware/libffi@3.3.0
armory publish -n libffi -v 3.3.0 -p sylixos -a x86_64 ./dist/
armory list -n sylixos-middleware  # 列出空间内的包
\`\`\`

## 制品命名规范

\`<package>-<version>-<platform>-<arch>.tar.gz\`

平台取值：linux / windows / macos / sylixos / android / any  
架构取值：x86_64 / aarch64 / armv7 / mips64 / riscv64 / any

## 版本策略

遵循 [Semantic Versioning 2.0.0](https://semver.org/lang/zh-CN/)：
主版本号用于不兼容变更，次版本号用于向下兼容的功能新增，修订号用于向下兼容的问题修复。
`;

const PACKAGE_SPECS = [
  {
    namespace: 'global',
    name: 'armory-cli',
    description: 'ARMORY 多平台命令行客户端，提供认证、检索、发布与下载能力。',
    accessLevel: 'Open',
    tags: ['cli', 'toolchain'],
    readme: README_ARMORY_CLI,
    createdDaysAgo: 68,
    versions: [
      { version: '2.0.0', daysAgo: 60, base: 12, platforms: [['linux', 'x86_64'], ['windows', 'x86_64']] },
      { version: '2.1.0', daysAgo: 41, base: 18, platforms: [['linux', 'x86_64'], ['windows', 'x86_64']] },
      { version: '2.2.0', daysAgo: 20, base: 26, platforms: [['linux', 'x86_64'], ['linux', 'aarch64'], ['macos', 'aarch64']] },
      {
        version: '2.2.1', daysAgo: 3, base: 46,
        platforms: [['linux', 'x86_64'], ['linux', 'aarch64'], ['windows', 'x86_64'], ['macos', 'aarch64']],
        description: '修复跨域代理下制品校验失败的问题',
      },
    ],
  },
  {
    namespace: 'global',
    name: 'armory-cli-executable',
    description: 'ARMORY 命令行客户端的单文件可执行版本。',
    accessLevel: 'Open',
    tags: ['cli'],
    createdDaysAgo: 64,
    versions: [
      { version: '2.2.1', daysAgo: 3, base: 9, platforms: [['linux', 'x86_64']] },
    ],
  },
  {
    namespace: 'sylixos-middleware',
    name: 'libffi',
    description: 'A portable foreign-function interface library.',
    accessLevel: 'Open',
    tags: ['middleware', 'ffi'],
    createdDaysAgo: 52,
    versions: [
      { version: '3.2.1', daysAgo: 47, base: 14, platforms: [['sylixos', 'x86_64']] },
      { version: '3.3.0', daysAgo: 12, base: 23, platforms: [['sylixos', 'x86_64'], ['sylixos', 'aarch64']] },
    ],
  },
  {
    namespace: 'sylixos-middleware',
    name: 'zlib',
    description: '通用的 DEFLATE 压缩库，被多个中间件作为基础依赖。',
    accessLevel: 'Open',
    tags: ['middleware', 'compression'],
    createdDaysAgo: 55,
    versions: [
      { version: '1.2.13', daysAgo: 50, base: 31, platforms: [['sylixos', 'x86_64'], ['sylixos', 'aarch64']] },
    ],
  },
  {
    namespace: 'sylixos-middleware',
    name: 'openssl',
    description: 'TLS/SSL 与密码学基础库，SylixOS 平台移植版本。',
    accessLevel: 'Open',
    tags: ['middleware', 'security'],
    createdDaysAgo: 49,
    versions: [
      {
        version: '3.0.8', daysAgo: 8, base: 27,
        platforms: [['sylixos', 'x86_64'], ['sylixos', 'aarch64']],
        dependencies: [{ name: 'zlib', version: '>=1.2.13', scope: 'runtime' }],
      },
    ],
  },
  {
    namespace: 'sylixos-middleware',
    name: 'lwjson',
    description: '轻量级 JSON 解析库，适用于资源受限的嵌入式环境。',
    accessLevel: 'Open',
    tags: ['middleware', 'json', 'embedded'],
    createdDaysAgo: 44,
    versions: [
      { version: '1.0.2', daysAgo: 6, base: 11, platforms: [['sylixos', 'x86_64']] },
      { version: '1.0.3-rc.1', daysAgo: 1, base: 0, pending: true, platforms: [['sylixos', 'aarch64']] },
    ],
  },
  {
    namespace: 'sylixos-middleware',
    name: 'sqlite',
    description: '嵌入式关系型数据库引擎，含 SylixOS 文件系统适配层。',
    accessLevel: 'Open',
    tags: ['middleware', 'database'],
    createdDaysAgo: 38,
    versions: [
      {
        version: '3.42.0', daysAgo: 15, base: 19,
        platforms: [['sylixos', 'x86_64']],
        dependencies: [{ name: 'zlib', version: '>=1.2.13', scope: 'runtime' }],
      },
    ],
  },
  {
    namespace: 'edge-computing',
    name: 'vsoa',
    description: 'VSOA 微服务通信框架，提供 RPC、发布订阅与位置服务。',
    accessLevel: 'Open',
    tags: ['framework', 'rpc'],
    createdDaysAgo: 33,
    versions: [
      {
        version: '1.2.0', daysAgo: 21, base: 16,
        dependencies: [{ name: '@sylixos-middleware/openssl', version: '>=3.0.0', scope: 'runtime' }],
        platforms: [['linux', 'x86_64'], ['sylixos', 'aarch64']],
      },
      { version: '1.3.0-rc.1', daysAgo: 2, base: 4, platforms: [['linux', 'x86_64']] },
    ],
  },
  {
    namespace: 'edge-computing',
    name: 'hermes-agent',
    description: '边缘侧智能体运行时，负责设备侧任务编排与本地推理调度。',
    accessLevel: 'Open',
    tags: ['agent', 'runtime'],
    createdDaysAgo: 26,
    versions: [
      {
        version: '0.9.4', daysAgo: 5, base: 13,
        platforms: [['linux', 'aarch64'], ['linux', 'x86_64']],
      },
    ],
  },
  {
    namespace: 'qa',
    name: 'unified-testcase-generator',
    description: '统一测试用例生成器，把需求与截图转换为结构化用例集。',
    accessLevel: 'Open',
    tags: ['testing', 'ai'],
    createdDaysAgo: 18,
    versions: [
      {
        version: '0.0.1', daysAgo: 4, base: 7,
        platforms: [['any', 'any']],
        dependencies: [{ name: '@sylixos-middleware/lwjson', version: '>=1.0.0', scope: 'runtime' }],
      },
    ],
  },
  {
    namespace: 'zhouli',
    name: 'test-pkg',
    description: '联调用测试软件包',
    accessLevel: 'Restricted',
    tags: [],
    createdDaysAgo: 11,
    versions: [
      { version: '0.0.3', daysAgo: 9, base: 3, platforms: [['any', 'any']] },
    ],
  },
  {
    namespace: 'zhouli',
    name: 'create1',
    description: '从界面创建的演示软件包，用于验证命名空间下的自助发布流程',
    accessLevel: 'Open',
    tags: ['demo'],
    createdDaysAgo: 7,
    versions: [
      { version: '0.0.4', daysAgo: 2, base: 2, platforms: [['linux', 'x86_64']] },
    ],
  },
];

function writeArtifactFile(namespace, name, version, platform, arch) {
  const filename = `${name}-${version}-${platform}-${arch}.tar.gz`;
  const manifest = {
    schema: 'depot.artifact/v1',
    package: `@${namespace}/${name}`,
    version,
    platform,
    arch,
    builtAt: new Date().toISOString(),
    note: '示例制品：由 Depot 初始化脚本生成，用于演示上传下载链路。',
    files: [`include/${name}.h`, `lib/lib${name}.so`, `share/doc/${name}/README.md`],
  };
  const buf = zlib.gzipSync(Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
  const rel = `${namespace}/${name}/${version}/${platform}/${arch}/${filename}`;
  const abs = path.join(config.STORAGE_DIR, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buf);
  return { filename, size: buf.length, sha256: sha256(buf), storagePath: rel };
}

function buildSeedDb() {
  const counters = { namespace: 0, member: 0, package: 0, version: 0, artifact: 0, audit: 0 };
  const next = (k) => { counters[k] += 1; return counters[k]; };

  /* ---------------- 用户 ---------------- */
  const users = [
    makeUser(1, 'admin', '管理员', 'ADMIN', 'admin123', 222),
    makeUser(2, 'zhouli', '周立', 'USER', 'user123', 264),
    makeUser(3, 'fanwenting', '范文婷', 'USER', 'user123', 150),
    makeUser(4, 'liupeidong', '刘沛东', 'USER', 'user123', 32),
    makeUser(5, 'qa-bot', '质量保障', 'USER', 'user123', 96),
  ];
  const U = Object.fromEntries(users.map((u) => [u.username, u]));

  /* ---------------- 空间与成员 ---------------- */
  const nsSpec = [
    { namespaceId: 'global', type: 'ORG', description: '系统内置全局作用域' },
    { namespaceId: 'sylixos-middleware', type: 'ORG', description: 'SylixOS 中间件软件包空间' },
    { namespaceId: 'edge-computing', type: 'ORG', description: '边缘计算与云枢相关组件' },
    { namespaceId: 'qa', type: 'ORG', description: '自动化测试与质量工程制品' },
    { namespaceId: 'zhouli', type: 'USER', description: null },
  ];
  const namespaces = [];
  const namespaceMembers = [];
  const memberSpec = {
    global: [['admin', 'ORG_OWNER'], ['zhouli', 'ORG_MEMBER']],
    'sylixos-middleware': [['admin', 'ORG_OWNER'], ['fanwenting', 'ORG_ADMIN'], ['liupeidong', 'ORG_MEMBER']],
    'edge-computing': [['admin', 'ORG_OWNER'], ['liupeidong', 'ORG_ADMIN'], ['fanwenting', 'ORG_MEMBER']],
    qa: [['admin', 'ORG_OWNER'], ['qa-bot', 'ORG_ADMIN'], ['zhouli', 'ORG_GUEST']],
    zhouli: [['zhouli', 'ORG_OWNER']],
  };

  nsSpec.forEach((spec) => {
    const ns = {
      id: next('namespace'),
      namespaceId: spec.namespaceId,
      type: spec.type,
      description: spec.description,
      createUserId: spec.namespaceId === 'zhouli' ? U.zhouli.id : U.admin.id,
      createTime: fmtTime(daysAgoDate(90 - namespaces.length * 3, 10, 12)),
      settings: { publishConfirmation: spec.namespaceId === 'sylixos-middleware' },
    };
    namespaces.push(ns);
    (memberSpec[spec.namespaceId] || []).forEach(([username, roleId], i) => {
      namespaceMembers.push({
        id: next('member'),
        namespaceId: spec.namespaceId,
        userId: U[username].id,
        roleId,
        joinTime: fmtTime(daysAgoDate(85 - i * 4, 14, 20)),
      });
    });
  });

  /* ---------------- 软件包 / 版本 / 制品 ---------------- */
  const packages = [];
  const versions = [];

  PACKAGE_SPECS.forEach((spec) => {
    const creator = (memberSpec[spec.namespace] || [['admin']])[0];
    const creatorUser = U[creator[0]];
    const pkg = {
      id: next('package'),
      namespace: spec.namespace,
      name: spec.name,
      description: spec.description,
      accessLevel: spec.accessLevel,
      admins: [creatorUser.id],
      watchers: spec.accessLevel === 'Open' ? [U.zhouli.id] : [],
      status: 'OK',
      defaultVersion: null,
      tags: spec.tags,
      readme: spec.readme || `# ${spec.name}\n\n${spec.description}\n\n## 安装\n\n\`\`\`bash\narmory install @${spec.namespace}/${spec.name}@<version>\n\`\`\`\n`,
      createTime: fmtTime(daysAgoDate(spec.createdDaysAgo, 11, 5)),
      createUserId: creatorUser.id,
    };
    packages.push(pkg);

    spec.versions.forEach((vSpec) => {
      const v = {
        id: next('version'),
        packageId: pkg.id,
        version: vSpec.version,
        status: vSpec.pending ? 'PENDING' : 'PUBLISHED',
        description: vSpec.description || '',
        dependencies: vSpec.dependencies || [],
        artifacts: [],
        downloads: 0,
        createUserId: creatorUser.id,
        createTime: fmtTime(daysAgoDate(vSpec.daysAgo, 15, 30)),
        publishTime: fmtTime(daysAgoDate(vSpec.daysAgo, 15, 30)),
      };
      v.downloads = Math.floor(vSpec.base * (0.7 + rnd() * 0.6));
      vSpec.platforms.forEach(([platform, arch], idx) => {
        const file = writeArtifactFile(spec.namespace, spec.name, vSpec.version, platform, arch);
        v.artifacts.push({
          id: next('artifact'),
          platform,
          arch,
          filename: file.filename,
          size: file.size,
          sha256: file.sha256,
          storagePath: file.storagePath,
          downloads: Math.floor(v.downloads / (idx + 1.4)),
          uploadTime: v.publishTime,
          uploadUserId: creatorUser.id,
        });
      });
      versions.push(v);
    });

    const sorted = spec.versions
      .filter((v) => !v.pending)
      .map((v) => v.version)
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    pkg.defaultVersion = sorted[0] || spec.versions[0].version;
  });

  /* ---------------- 历史审计（供趋势图与日志页使用） ---------------- */
  const audits = [];
  const pushAudit = (time, operationType, resourceType, resource, detail, user) => {
    audits.push({
      id: next('audit'),
      operationType,
      resourceType,
      resource,
      detail,
      userId: user.id,
      username: user.username,
      time: fmtTime(time),
      ip: `10.12.7.${20 + Math.floor(rnd() * 60)}`,
    });
  };

  // 近 14 天的下载与维护操作，越近越密集
  for (let d = 13; d >= 0; d -= 1) {
    const daily = d < 7 ? 6 + Math.floor(rnd() * 12) + (6 - d) : 4 + Math.floor(rnd() * 8);
    for (let i = 0; i < daily; i += 1) {
      const pkgSpec = pick(PACKAGE_SPECS.filter((p) => !p.versions.some((v) => v.pending)));
      const vSpec = pick(pkgSpec.versions);
      const user = pick(users.slice(1));
      const t = daysAgoDate(d);
      pushAudit(
        t, 'DOWNLOAD', 'PACKAGE', `@${pkgSpec.namespace}/${pkgSpec.name}@${vSpec.version}`,
        `下载 ${pick(vSpec.platforms).join('/')} 制品`, user,
      );
    }
    if (d % 3 === 0) {
      const t = daysAgoDate(d, 9, 40);
      pushAudit(t, 'LOGIN', 'SYS', 'session', '登录成功', pick(users));
    }
  }

  PACKAGE_SPECS.forEach((spec) => {
    spec.versions.forEach((vSpec) => {
      const creator = U[(memberSpec[spec.namespace] || [['admin']])[0][0]];
      pushAudit(
        daysAgoDate(vSpec.daysAgo, 15, 30), vSpec.pending ? 'PUBLISH' : 'PUBLISH', 'PACKAGE',
        `@${spec.namespace}/${spec.name}@${vSpec.version}`,
        vSpec.pending ? '发布待确认版本 sylixos/aarch64 制品' : `发布 ${vSpec.platforms[0].join('/')} 制品`,
        creator,
      );
    });
  });

  pushAudit(daysAgoDate(6, 10, 22), 'ADD_ORG_MEMBER', 'NAMESPACE', 'qa', '添加成员 qa-bot（管理员）', U.admin);
  pushAudit(daysAgoDate(5, 16, 8), 'CHANGE_PKG_ACCESS_LEVEL', 'PACKAGE', '@zhouli/test-pkg', '访问级别调整为 Restricted', U.admin);
  pushAudit(daysAgoDate(4, 11, 35), 'ADD_TAG', 'PACKAGE', '@sylixos-middleware/lwjson', '新增标签 embedded', U.fanwenting);
  pushAudit(daysAgoDate(2, 9, 3), 'UPDATE_README', 'PACKAGE', '@global/armory-cli', '更新 README', U.admin);

  audits.sort((a, b) => String(b.time).localeCompare(String(a.time)));

  return {
    schemaVersion: 1,
    createdAt: fmtTime(),
    counters,
    users,
    sessions: [],
    namespaces,
    namespaceMembers,
    packages,
    versions,
    audits,
  };
}

module.exports = { buildSeedDb };
