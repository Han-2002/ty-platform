# 项目迁移与 WorkBuddy / CodeBuddy 环境重配指引

本指引用于把「智能推演平台（多智能体兵棋推演平台）」从当前开发环境迁移到**另一套开发工具**，
并在新环境中重新配置 AI 助手插件（WorkBuddy / CodeBuddy），让项目恢复可运行状态。

---

## 1. 项目概览

| 项目 | 说明 |
| --- | --- |
| 名称 | multi-agent-wargaming-platform |
| 定位 | 导演部多席位智能体集群：配置驱动的席位运行时、带权限知识库、Skill 体系、MCP 仿真推演与自进化闭环 |
| 技术栈 | TypeScript + Vite + React 18 + Vitest + YAML + pnpm workspace |

项目由**两部分**组成：

| 部分 | 路径 | 作用 | 包管理器 / 运行时 |
| --- | --- | --- | --- |
| 核心平台 | 根目录 `src/`、`web/`、`config/`、`skills/`、`simulators/`、`tests/`、`openspec/` | 席位/角色/知识库/技能/仿真/自进化的后端逻辑与 React 前端骨架 | npm + Node 20 |
| 前端宿主 | `deepseek-harness/` | **DeepSeek Harness 前端（dsh）**，本项目在其上新增了 `ui-wargame` 插件（推演控制台、技能卡片、宝剑按钮等）并修改了若干 dsh 源码 | pnpm + Node 24 |

> ⚠️ 注意：`deepseek-harness/` **不再是**「零引用的第三方仓库」。本项目的 UI 功能（推演控制台、技能管理、技能插入 composer 等）**以插件 + 源码改动的方式落在其中**，必须随包迁移。

关键目录：

```
├── src/                # 平台核心运行时（席位、组织、知识库、技能、仿真、自进化）
├── web/                # React 前端（Vite 根目录 root=web）
├── config/             # YAML 配置（席位/角色、技能、仿真器、知识库、personas）
├── skills/             # 技能定义（markdown，每个技能一个目录）
├── simulators/         # mock MCP 仿真引擎（sim-blue / sim-red）
├── tests/              # 单元测试（Vitest）
├── openspec/           # OpenSpec 规范驱动开发（specs + changes + config.yaml）
├── .codebuddy/         # AI 助手项目级配置（commands/opsx 与 skills/openspec-*）
├── deepseek-harness/   # 前端宿主（dsh），含 ui-wargame 插件与 dsh 源码改动
└── package.json / tsconfig.json / vite.config.ts / vitest.config.ts
```

---

## 2. 迁移包内容说明

本迁移包**包含**：

- 核心平台：`src/`、`web/`、`config/`、`skills/`、`simulators/`、`tests/`、`openspec/`、`.codebuddy/`、`package.json`、`package-lock.json`、`tsconfig.json`、`vite.config.ts`、`vitest.config.ts`、`.gitignore`
- 前端宿主：`deepseek-harness/` 的**源码 + 已构建的 `lib/`**（含 `packages/client/ui-wargame/` 及所有 dsh 源码改动），便于迁移后免重复构建
- 本 `MIGRATION.md`

本迁移包**不包含**（需在新环境重新生成）：

| 内容 | 原因 | 新环境处理方式 |
| --- | --- | --- |
| `node_modules/`（根目录与 `deepseek-harness/node_modules/`） | 依赖体积大、与平台/系统相关 | `npm install` / `pnpm install` 重新安装 |
| `deepseek-harness/.git/` | git 历史体积大、非运行必需 | 如需版本管理，按第 7 节单独 clone |
| `dist/`、`*.log`、`.DS_Store`、`*.tsbuildinfo`、`*.map` | 构建产物/临时文件/sourcemap | 重新构建生成 |

---

## 3. 环境要求

项目两部分对运行时要求不同，请**分别准备**：

| 依赖 | 用途 | 版本 |
| --- | --- | --- |
| Node.js | 核心平台 | >= 18（推荐 **20 LTS**） |
| Node.js | deepseek-harness | **^22.19.0 或 >= 24**（实测 24.14.0） |
| npm | 核心平台 | 与 Node 20 配套（10.x） |
| pnpm | deepseek-harness | **11.7.0**（`packageManager` 已声明，`corepack enable` 会自动启用） |

检查方式：

```sh
node -v      # 核心平台建议 20；deepseek-harness 建议 24
npm -v
pnpm -v      # 11.7.0
```

> WorkBuddy / CodeBuddy 插件内置的运行时管理可安装多版本 Node（如 20 与 24），
> 也可用 `corepack enable` 启用 pnpm 对应版本。

---

## 4. 恢复运行（核心步骤）

### 4.1 核心平台（Node 20 + npm）

在项目**根目录**执行：

```sh
npm install          # 或 npm ci（更严格锁定 package-lock.json）

npm run typecheck    # 类型检查
npm test             # 运行 65+ 个测试（Vitest）
npm run build:web    # 构建 React 前端
npm run dev:web      # 启动前端开发服务器，默认 http://localhost:5173
```

### 4.2 前端宿主 deepseek-harness（Node 24 + pnpm）

在 `deepseek-harness/` 目录执行：

```sh
# 1. 安装依赖（pnpm workspace，286 个项目，耗时较长）
pnpm install

# 2. 若迁移包已带 lib/ 构建产物，可跳过构建；
#    否则重新构建 client 侧（含 ui-wargame、ui-conversation、ui-sidebar、ui-brand-official 等）
pnpm build:lib:client

# 3. 启动 Web 前端（推演平台界面所在）
node --import tsx/esm apps/cli/src/bin.ts web --no-open --port 8080
# 或：pnpm dsh web --no-open --port 8080
```

启动后终端会打印类似 `dsh web: http://127.0.0.1:8080/?token=...` 的地址，用浏览器打开即可看到推演平台前端。

> 说明：`deepseek-harness` 的 Web 前端通过 `dsh` CLI 启动，serve 的是各 client 包的 `lib/client.js`（tsdown 产物）。
> 若改了 client 包源码，需先 `pnpm build:lib:client` 再启动。

---

## 5. 重新配置 AI 助手插件（WorkBuddy / CodeBuddy）

### 5.1 安装插件

在新开发工具中安装 WorkBuddy / CodeBuddy 插件，并使用原账号登录。

### 5.2 打开工作区

用新开发工具**打开项目根目录**（包含 `package.json`、`.codebuddy/`、`openspec/`、`deepseek-harness/` 的那一层），
而不是只打开某个子目录。插件以「工作区根目录」为锚点加载项目级配置。

### 5.3 项目级配置（随包迁移，无需手动重建）

- `.codebuddy/commands/opsx/` —— OpenSpec 工作流命令
- `.codebuddy/skills/openspec-*` —— OpenSpec 项目级技能
- `openspec/` —— 规范驱动开发的 specs / changes / config.yaml

> 若未自动识别：确认打开的是根目录 → 重载插件窗口（Reload Window）→ 检查「项目级配置 / project skills / commands」是否启用。

### 5.4 全局/账号级配置（不随包迁移，需手动确认）

1. **模型 / API 凭据**：在插件设置中重新配置 API Key / Endpoint（凭据不含在迁移包内）。
2. **MCP 服务器**：若原环境在插件里注册过 MCP，需在新工具中重新添加（`simulators/` 里的 `sim-blue.mjs` / `sim-red.mjs` 是项目自带 mock，随包迁移，无需额外注册）。
3. **用户级技能/规则**：原环境 `~/.codebuddy/` 下的个人配置不随包迁移，按需手动复制。
4. **代理/网络**：公司网络代理需在插件或终端环境变量中重新配置。

---

## 6. 常见问题（FAQ）

- **`npm install` / `pnpm install` 网络错误** → 配置镜像（`npm config set registry https://registry.npmmirror.com`；pnpm 同理）或代理后重试。
- **`pnpm install` 报 postinstall / lefthook 失败** → 若 `git config core.hooksPath` 被占用，可用 `DSH_LEFTHOOK_ALLOW_HOOKS_PATH_OVERRIDE=1 pnpm install` 放行。
- **`node --import tsx/esm` 报找不到模块** → 确认在 `deepseek-harness/` 目录下执行、`pnpm install` 已完成。
- **8080 端口被占用** → 改用 `--port 8081`。
- **`npm test` 报错** → 测试环境为 `node`（见 `vitest.config.ts`），确认无残留 `dist/` 干扰。
- **推演控制台不显示** → 确认已 `pnpm build:lib:client` 构建了 `ui-wargame` 等 client 包，且 Web 服务已重启。

---

## 7. deepseek-harness 中本项目的关键改动（便于追溯）

迁移后在 `deepseek-harness/` 中，以下改动构成本项目的 UI 能力：

| 类型 | 位置 | 说明 |
| --- | --- | --- |
| 新增插件 | `packages/client/ui-wargame/` | 推演控制台：席位集群、会话、协同消息、审核队列、方案对比、知识库权限、**技能管理（卡片 + 插入 composer）**、MCP、轨迹、指标 |
| 新增注册 | `packages/bundle/web-app/cordis.patch.yml` | 注册 `ui-wargame` 浏览器插件 |
| 新增依赖 | `packages/bundle/web-app/package.json`、`tsconfig.client.json` | 引入 `@deepseek-ai/dsh-client-ui-wargame` |
| 源码改动 | `packages/client/ui-conversation/src/client/skeleton/EmptyHero.tsx` | 删除 hero 鲸鱼 logo |
| 源码改动 | `packages/client/ui-conversation/src/client/skeleton/ConversationRoot.tsx` | HeroShell 去掉 brand renderSlot |
| 源码改动 | `packages/client/ui-conversation/src/client/locales.ts` | hero 标题改为「智能推演平台」 |
| 源码改动 | `packages/client/ui-brand-official/src/client/Brand.tsx` | 官方鲸鱼返回 null |
| 源码改动 | `packages/client/ui-sidebar/src/client/SidebarRoot.tsx` | 删除侧边栏鲸鱼 fallback |
| 源码改动 | `packages/client/ui-sidebar/src/client/SidebarRoot.module.css` | 侧边栏面板切换按钮常显 |

如需版本管理，可在新环境重新 clone 上游 `deepseek-ai/deepseek-harness` 后，将上述改动以 patch 方式重新应用（本次迁移包已包含改动后的源码，通常无需此操作）。
