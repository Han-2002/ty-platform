# 智能推演平台（导演部多席位智能体集群）

配置驱动的席位运行时、带权限知识库、Skill 体系、MCP 仿真推演与自进化闭环。

---

## 一、仓库里有什么

| 目录 | 是什么 |
|---|---|
| `src/` `config/` `skills/` `simulators/` | **平台后端**：多席位运行时、知识库、Skill、MCP 仿真（HTTP API + WebSocket） |
| `deepseek-harness/` | **deepseek-harness**（上游项目）＋ 本项目的 wargame 集成：`ui-wargame` 客户端插件、`wargame-platform` host 服务 |
| `web/` | **推演控制台前端**（从 `ui-wargame` 移植出来的独立 React 应用） |
| `standalone-ui/` | 另一套独立前端（纯静态） |
| `demo-final/` | 早期演示成品 |
| `db/migrations/` | PostgreSQL 建表脚本 |
| `scripts/` | 工具脚本（迁移 / 播种账号 / 预览启动） |

## 二、三套前端怎么区分

| 前端 | 入口 | 数据来源 | 特点 |
|---|---|---|---|
| **A. deepseek-harness 集成版** | `deepseek-harness` → 8080 | deepseek-harness 的 `wargame-platform`（Remote） | 完整 deepseek-harness Web 界面 + 推演控制台插件 |
| **B. 独立控制台 `web/`** | 顶层项目 → 5173 | 顶层后端 `src/server`（8787） | 只保留推演控制台，轻量独立 |
| **C. `standalone-ui/`** | 8790 | 顶层后端 `src/server`（8787） | 静态页面，无构建 |

---

## 三、A. deepseek-harness 集成版（8080）—— 完整启动说明

> 这是「结合 deepseek-harness 那套」的前端：deepseek-harness 的 Web 界面里，
> 进入会话后点 composer 左下角 **🗡️ 宝剑按钮** 或侧栏底部 **「推」按钮**，
> 弹出推演控制台（11 个模块）。

### 环境要求

| 项 | 版本 |
|---|---|
| Node | `^22.19.0 \|\| >=24.0.0` |
| pnpm | `11.7.0`（`packageManager` 已锁定） |

### 步骤 1：安装依赖

`node_modules` **未入库**（`.gitignore` 忽略），必须自行安装：

```bash
cd deepseek-harness
pnpm install
```

> 仓库较大（286 个 workspace 包），首次安装耗时较长。
> 若本机 `git config core.hooksPath` 指向自定义 hooks 目录导致 lefthook 安装失败，
> 用 `DSH_LEFTHOOK_ALLOW_HOOKS_PATH_OVERRIDE=1 pnpm install` 放行。

### 步骤 2：构建客户端插件产物

`lib/` 构建产物**未入库**（`.gitignore` 忽略）。deepseek-harness 的客户端插件
（含 `ui-wargame`）是以构建后的 `lib/client.js` 通过 `/plugins/<id>/client.js`
提供给浏览器的，**不构建就没有推演控制台**。

```bash
# 最小构建：只构建客户端插件（推荐，快）
pnpm run build:lib:client

# 或完整构建（host + client，更慢但更全）
pnpm run build
```

### 步骤 3：启动 Web 服务

```bash
cd deepseek-harness
node --import tsx/esm apps/cli/src/bin.ts web --no-open --port 8080
```

启动后终端会打印带 token 的地址，形如：

```
dsh web: http://127.0.0.1:8080/?token=xxxxxxxx
```

**用这个完整 URL 访问**（token 走 cookie，直接访问根路径会 401）。

### 步骤 4：打开推演控制台

1. **进入一个会话**（侧栏新建，或点已有会话）
   —— 控制台入口挂在会话级 slot 上，首页 hero 状态看不到
2. 点 **composer 左下角 🗡️ 宝剑按钮**，或 **侧栏底部「推」按钮**
3. 弹出推演控制台，11 个模块：
   活动选择 / 会话列表 / 席位集群 / 协同消息流 / 人工审核队列 /
   方案推演对比 / 知识库权限 / Skill 管理 / MCP 服务管理 / 执行轨迹 / 运行时指标

### 集成点在哪（改代码时看这里）

| 文件 | 作用 |
|---|---|
| `deepseek-harness/packages/client/ui-wargame/` | 推演控制台插件（store / 外壳 / 11 个模块视图） |
| `deepseek-harness/packages/platform/wargame-platform/` | host 服务，提供 `wargame` Remote 命名空间 |
| `deepseek-harness/packages/bundle/web-app/cordis.patch.yml` | 登记 `wargame-platform`（host 行）与 `ui-wargame`（client 行） |
| `deepseek-harness/packages/api/remotes/src/client/index.ts` | 把 `wargame` Remote 挂到客户端 |
| `deepseek-harness/packages/api/remotes/src/client/_inline/wargame-remote.js` | 内联的 Remote 契约（规避跨包解析问题） |

### 常见问题

- **首页 401**：必须用终端打印的**带 token 的完整 URL**，它会种 cookie 后跳转。
- **没有宝剑按钮 / 控制台打不开**：`ui-wargame` 的 `lib/client.js` 没构建 —— 回到步骤 2。
- **改了插件代码不生效**：重新 `pnpm run build:lib:client`，然后**重启 Web 服务**；
  浏览器再硬刷 `Cmd+Shift+R`（插件产物带 `immutable` 缓存头）。
- **控制台模块列表为空**：`wargame-platform` host 服务没挂上，检查步骤 3 的启动日志。

---

## 四、B. 独立控制台 `web/`（5173）

详细说明见 [`web/README.md`](web/README.md)。简要：

```bash
# 后端（二选一）
npx tsx src/server/main.ts                                  # 有 PostgreSQL，端口 8787
PG_MEM=1 TY_ADMIN_PASSWORD='Admin123456!' npx tsx scripts/start-preview.ts   # 无 PostgreSQL，内存库

# 前端
npm run dev:web                                             # 5173
```

登录：`admin` / `Admin123456!`（若用内存库，由 `start-preview.ts` 自动播种）

---

## 五、C. `standalone-ui/` 与 `demo-final/`

两者都自带静态服务器，直接跑：

```bash
node standalone-ui/server.mjs    # 8790（业务 API 需在 8787）
node demo-final/server.mjs       # 8790（自带 API + 静态页，可用内存降级）
```

---

## 六、本机开发备注

- **端口占用**：本机 8787 被另一个项目的 `api_server.py` 占用时，
  顶层后端用 `API_PORT=8791`，并同步改 `web/src/api.ts` 的 `API_BASE`。
- **没有 PostgreSQL**：顶层后端支持 `PG_MEM=1`（内存库，数据不持久）；
  `deepseek-harness` 那套不需要 PostgreSQL。
