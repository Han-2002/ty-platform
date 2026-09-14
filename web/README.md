# 导演部推演控制台（`web/`）

这是「导演部多席位智能体集群」的**推演控制台前端**，从 deepseek-harness 的
`ui-wargame` 插件移植而来（原插件运行在 deepseek-harness 的 Web 界面里，
通过 cordis slot 挂载；移植版改成独立 React 应用 + 后端 HTTP API 对接）。

---

## ⚠️ 先确认你改的是哪个前端

仓库里现在有**两套互不相关的前端**，改代码前请确认目标：

| 目录 | 是什么 | 技术栈 | 启动方式 |
|---|---|---|---|
| **`web/`**（本目录） | 推演控制台（左侧 11 个模块） | Vite + React + TypeScript | `npm run dev:web` → 5173 |
| `standalone-ui/` | 另一套独立前端 | 纯静态 HTML/JS + 自带静态服务器 | `node standalone-ui/server.mjs` → 8790 |
| `demo-final/` | 早期演示成品 | 纯静态 + 自带服务器 | `node demo-final/server.mjs` → 8790 |

**本目录（`web/`）是推演控制台的正版实现，请不要用其他实现替换 `web/src/`。**

---

## 目录结构

```
web/
├── index.html
└── src/
    ├── main.tsx                 入口（挂载 <App/>）
    ├── App.tsx                  登录 + 挂载控制台
    ├── api.ts                   后端 HTTP 客户端（API_BASE 在这里）
    ├── app.css                  全局样式（含登录页）
    ├── data.ts / types.ts       （旧 mock 版遗留，未被引用，可忽略）
    ├── components/              （旧 mock 版遗留组件，未被引用，可忽略）
    └── console/                 ★ 推演控制台本体（从 ui-wargame 移植）
        ├── store.tsx            状态 + actions（React Context，替代框架 store）
        ├── ConsoleShell.tsx     控制台外壳（顶部状态条 + 左侧模块导航）
        ├── dataLoader.ts        后端数据加载（把 API 数据灌进 store）
        ├── modules.ts           模块注册表（导航顺序 = 这里）
        ├── locales.ts           中文文案
        ├── types.ts             领域类型
        └── views/               11 个模块视图 + console.module.css
```

## 11 个模块（左侧导航顺序）

活动选择 · 会话列表 · 席位集群 · 协同消息流 · 人工审核队列 ·
方案推演对比 · 知识库权限 · Skill 管理 · MCP 服务管理 · 执行轨迹 · 运行时指标

---

## 启动步骤

### 第 1 步：启动后端（必须先起）

后端在仓库根目录，**默认端口 8787**。

**方式 A：本机有 PostgreSQL（常规）**

```bash
npm install
node scripts/migrate.mjs                          # 建表
TY_ADMIN_PASSWORD='Admin123456!' npx tsx scripts/bootstrap-admin.ts   # 播种账号
npx tsx src/server/main.ts                        # 启动 API（8787）
```

**方式 B：本机没有 PostgreSQL（内存预览，最快）**

```bash
npm install
npm install pg-mem                                 # 内存数据库，仅预览需要
PG_MEM=1 TY_ADMIN_PASSWORD='Admin123456!' npx tsx scripts/start-preview.ts
```

> `start-preview.ts` 在**同一进程内**完成「建表 + 播种账号 + 启动 API」，
> 因为内存库不跨进程共享（单独跑 `bootstrap-admin.ts` 起不到作用）。
> 内存库数据在进程退出后丢失。

**端口被占用时**：`API_PORT=8791 PG_MEM=1 ... npx tsx scripts/start-preview.ts`

### 第 2 步：启动前端

```bash
npm run dev:web          # vite，默认 http://localhost:5173
```

### 第 3 步：确认前后端端口一致

`web/src/api.ts` 顶部：

```ts
export const API_BASE = 'http://localhost:8787';   // ← 必须与后端端口一致
```

后端换了端口（比如 8791），这里要同步改。

### 登录账号

| 用户 ID | 密码 |
|---|---|
| `admin` | `Admin123456!` |

（`admin` 绑定审批席位 `seat-director`、活动 `act-blue`）

---

## 改动指引

- **加/改模块**：在 `web/src/console/views/` 加视图，再到 `modules.ts` 注册（导航顺序按数组顺序）。
- **加/改数据**：优先在 `dataLoader.ts` 里调后端接口，再通过 `store.tsx` 的 `loadXxx` action 写入。
- **本地交互**（派发指令 / 审批 / 方案打分等）保留在 `store.tsx` 的 action 里，改的时候注意它是「克隆-修改-写回」的写法（`update()` 内部）。
- **样式**：全部走 `web/src/console/views/console.module.css`，用 CSS Modules，不要加全局类名。

## 常见问题

- **登录后列表为空**：后端没起，或 `API_BASE` 端口不对。
- **方案 / 审计模块空**：这两个接口要求审批席位（`can_approve`），非审批账号会被后端拒绝，前端已降级为空态。
- **改完没生效**：vite 热更新偶尔失灵，硬刷 `Cmd+Shift+R`。
