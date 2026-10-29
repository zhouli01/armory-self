# Depot · 企业制品仓库平台

一个**零依赖**的制品仓库平台，参照内网 Armory（`http://10.12.7.250/acohub/armory`）的功能模型实现：
命名空间与角色治理、软件包与版本、多平台架构制品、上传下载、标签、依赖关系、访问级别、审计日志与概览看板。

- 后端：Node.js 内置模块（`http` / `fs` / `crypto` / `zlib`），**无需 npm install**
- 存储：`data/db.json`（元数据）+ `storage/`（制品文件）
- 前端：原生 ES Module，无框架、无构建步骤，hash 路由
- 启动：一条命令，默认 `http://127.0.0.1:7310`

## 快速开始

```bash
cd depot
npm start          # 或 node server.js
```

打开 `http://127.0.0.1:7310`，使用内置演示账号登录：

| 账号 | 密码 | 角色 |
| --- | --- | --- |
| `admin` | `admin123` | 系统管理员（level 50） |
| `zhouli` | `user123` | 空间所有者（ORG_OWNER） |
| `fanwenting` | `user123` | 普通成员（ORG_MEMBER） |

首次启动会按 `src/seed.js` 生成同构示例数据：5 个命名空间、12 个软件包、18 个版本、30 个制品。

## 命令

| 命令 | 说明 |
| --- | --- |
| `npm start` | 启动服务（`PORT` / `HOST` 环境变量可覆盖） |
| `npm test` | 后端 API 冒烟（45 项，含权限边界与上传下载） |
| `npm run test:ui` | 前端端到端冒烟（47 项，无头 Edge + CDP 真实驱动页面） |
| `npm run shots` | 逐页截图到 `shots/`，用于视觉验收 |
| `npm run reset -- --yes` | 清空数据与制品，下次启动重建示例数据 |

> 两套冒烟均为"跑完自动清理"：测试用的空间/包/版本会在用例末尾删除，
> 记录型数据（审计日志、下载计数）会保留，因此重复执行不影响业务数据。

## 功能

**命名空间与权限**
- 命名空间类型：`global`（全局，内置不可删）、`ORG`（组织）、`USER`（个人）
- 四级角色：`ORG_OWNER(40)` / `ORG_ADMIN(30)` / `ORG_MEMBER(20)` / `ORG_GUEST(10)`，非成员为 0；系统管理员 50
- 成员增删与角色调整、空间重命名（级联更新成员与包归属）、发布确认开关

**软件包与版本**
- SEMVER 校验与倒序比较；`latest` / `default` 版本解析
- 版本状态：`PUBLISHED` / `PENDING`（空间开启"发布需确认"时）→ 管理员确认后转正
- 版本与制品二级软删除（同时清理磁盘文件，并自下而上回收空目录）
- 访问级别 `Open` / `Restricted`：受限包对非空间成员不可见

**制品**
- 平台：`linux` / `windows` / `macos` / `sylixos` / `android` / `any`
- 架构：`x86_64` / `aarch64` / `armv7` / `mips64` / `riscv64` / `any`
- 上传：`multipart/form-data` 流式解析，落盘走"临时文件 + 原子 rename"，重复版本不会破坏已有制品
- 下载：流式响应 + `Content-Disposition`（含 `filename*=UTF-8''`）+ `X-Checksum-SHA256`；
  支持 `Authorization` 头或 `?token=` 查询参数（供浏览器直链下载）
- 单文件上限 200 MB

**治理**
- 标签（`^[a-z0-9][a-z0-9-_.]{0,23}$`，上限 20 个）、关注/取消关注、包管理员、依赖与被依赖反查
- 审计日志：26 类操作、按操作类型/资源类型/操作人筛选、分页，上限 5000 条
- 概览看板：包/版本/下载/存储统计、近 7 天下载趋势、下载排行、平台与命名空间分布、最近发布

## 界面结构

| 路由 | 页面 |
| --- | --- |
| `#/login` | 登录（含演示账号一键填入） |
| `#/dashboard` | 概览看板 |
| `#/packages` | 软件包列表（关键词/命名空间/访问级别筛选、排序、分页） |
| `#/packages/:ns/:name` | 包详情（版本与制品 / README / 依赖 / 管理员 / 治理设置） |
| `#/namespaces` | 命名空间（我的 / 全部） |
| `#/namespaces/:ns` | 空间详情（软件包 / 成员 / 空间设置） |
| `#/audits` | 审计日志 |

前端目录：

```
public/
  index.html
  css/styles.css        设计令牌 + 全站样式（响应式 1180/900/760 断点）
  js/api.js            会话、请求封装、上传与下载
  js/ui.js             图标、Toast、弹窗、徽标、趋势图、格式化等通用件
  js/core.js           共享状态、路由跳转、Markdown 轻渲染、分页、骨架屏
  js/app.js            应用外壳、路由表、登录页
  js/views-*.js        5 个页面视图
```

## API

统一响应信封：成功 `{"status":"success", ...}`，失败 `{"status":"error","code":"...","message":"..."}`。
除 `/api/health`、`/api/auth/login` 外均需 `Authorization: Bearer <token>`（7 天有效）。

```
GET    /api/health
POST   /api/auth/login | /api/auth/logout
GET    /api/auth/me | /api/meta | /api/users

GET    /api/namespaces                    空间列表（scope=mine|all）
POST   /api/namespaces                    创建组织空间
GET    /api/namespaces/:ns                空间详情
PUT    /api/namespaces/:ns                改名 / 描述 / 发布确认
DELETE /api/namespaces/:ns                删除（内置空间禁止）
GET    /api/namespaces/:ns/members        成员列表
POST   /api/namespaces/:ns/members        添加成员
PUT    /api/namespaces/:ns/members/:userId    调整角色
DELETE /api/namespaces/:ns/members/:userId    移除成员

GET    /api/packages                      列表（keyword/namespace/accessLevel/sort/分页）
POST   /api/packages                      新建软件包
GET    /api/packages/:ns/:name            包详情（版本/依赖/权限）
PUT    /api/packages/:ns/:name            描述 / README / 访问级别
DELETE /api/packages/:ns/:name            删除软件包
POST   /api/packages/:ns/:name/default-version   设置默认版本
POST   /api/packages/:ns/:name/members           包管理员增删
POST   /api/packages/:ns/:name/tags              添加标签
DELETE /api/packages/:ns/:name/tags/:tag         删除标签
POST   /api/packages/:ns/:name/watch             关注 / 取消关注

POST   /api/packages/:ns/:name/versions                    上传新版本（multipart）
POST   /api/packages/:ns/:name/v/:version/confirm          确认发布 / 撤回
GET    /api/packages/:ns/:name/v/:version/platforms        版本可用平台
DELETE /api/packages/:ns/:name/v/:version                  删除版本
DELETE /api/packages/:ns/:name/v/:version/a/:platform/:arch 删除单个制品
GET    /api/packages/:ns/:name/v/:version/download         下载指定版本
GET    /api/packages/:ns/:name/download                    下载（latest 或 ?version=）

GET    /api/stats/overview                概览统计
GET    /api/audits                        审计日志
GET    /api/audits/operation-types        操作类型字典
```

## 上传示例

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:7310/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' | sed 's/.*"token":"\([^"]*\)".*/\1/')

curl -X POST "http://127.0.0.1:7310/api/packages/global/armory-cli/versions" \
  -H "Authorization: Bearer $TOKEN" \
  -F version=2.3.0 -F platform=linux -F arch=x86_64 \
  -F description="新增离线校验" -F dependencies='[]' \
  -F file=@./armory-cli-2.3.0-linux-x86_64.tar.gz
```

下载并校验：

```bash
curl -fL "http://127.0.0.1:7310/api/packages/global/armory-cli/v/2.3.0/download?platform=linux&arch=x86_64&token=$TOKEN" \
  -o pkg.tar.gz
sha256sum pkg.tar.gz
```

## 数据模型

`data/db.json` 顶层集合：`users` / `sessions` / `namespaces` / `members` / `packages` / `versions` / `audits` / `seq`。
写入策略：内存修改标记 dirty → 去抖合并落盘 → 写 `.tmp` 后原子 `rename`；进程退出（`SIGINT`/`SIGTERM`）前强制 flush。

## 验收结果

| 用例集 | 结果 |
| --- | --- |
| 后端 API 冒烟（`npm test`） | `PASS=45 FAIL=0` |
| 前端端到端（`npm run test:ui`） | `PASS=47 FAIL=0`，运行时报错 0 |
| 数据基线 | 5 空间 / 12 包 / 18 版本 / 30 制品，`storage/` 无空目录残留 |

## 说明

- 密码使用 PBKDF2-SHA256（10000 次迭代 + 随机盐）存储，仅用于演示
- 单进程内存态 + JSON 文件持久化，适合作为内网轻量制品库或原型；如需多实例部署，应替换为 PostgreSQL 与对象存储
