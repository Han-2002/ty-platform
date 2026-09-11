# Tasks

> 实现清单：按 `design.md` 的 Migration Plan 分 9 个阶段推进。每阶段末尾标注其可执行断言（Vitest 测试用例），完成后勾选。

## 阶段 1：工程骨架与配置加载

- [x] 初始化 `package.json`（TypeScript + Vitest）、`tsconfig.json`、`vitest.config.ts`、`.gitignore`（排除 `runtime/`、`node_modules/`）
- [x] 建立目录：`config/`、`skills/`、`runtime/`、`src/`、`tests/`
- [x] 实现 YAML 配置加载器与启动时 schema 校验（`seats.yaml` / `skills.yaml` / `simulators.yaml`），校验失败即抛出明确错误
- [x] 提供示例配置：`config/seats.yaml`、`config/skills.yaml`、`config/simulators.yaml`、`config/personas/`

**断言**：配置缺字段/类型错误时启动加载抛出带定位信息的异常；合法配置加载成功。

## 阶段 2：席位 / 角色 / 指挥链 / 活动模型

- [x] 实现 `Seat`、`Role`（`level`/`clearance`/`can_dispatch`/`can_approve`）、`Activity`（五阶段）、`CommandChain`（`parent` 树）
- [x] 席位从配置加载，无硬编码上限；席位继承角色权限属性
- [x] 指挥链向下遍历（子树）与向上遍历
- [x] 活动作用域隔离（任务与会话按活动分区）

**断言**：`seats-and-roles/spec.md` 全部 6 个 Scenario。

## 阶段 3：Agent 运行时

- [x] 实现席位运行时上下文（记忆 / 会话 / 技能视图 / 权限边界），席位间隔离
- [x] 人格外置解析：席位级 > 角色级 > 内置默认
- [x] 三层记忆（工作 / 长期 / 情景）+ `persist()` / `restore()`
- [x] 越权知识/技能边界：明确拒绝、不编造
- [x] 空闲主动推送（产出标记为「主动提示」类型）

**断言**：`agent-runtime/spec.md` 全部 7 个 Scenario。

## 阶段 4：知识库与检索前过滤

- [x] 文档模型（含密级 `clearance` 与角色 `allow`/`deny`）
- [x] 可见集计算：`deny` 优先于 `allow`，密级 + 角色白名单
- [x] 检索仅在可见集内执行，返回结果不暴露不可见文档

**断言**：`knowledge-base/spec.md` 全部 4 个 Scenario。

## 阶段 5：Skill 体系与 zip 上传安全

- [x] SKILL.md 解析（frontmatter：`name`/`description`/`metadata`）
- [x] 编排配置：`enabled`、`allowed_roles`、`packs`；有效技能 = 引用 ∩ 授权 ∩ 启用
- [x] 管理员配置覆盖内嵌 `metadata`
- [x] zip 上传安装（单技能包 + 多技能批量包），安全校验：zip slip、可执行文件、类型白名单、20MB/500 文件上限、名称净化、必须含 `SKILL.md`

**断言**：`skill-system/spec.md` 全部 Scenario。

## 阶段 6：协同消息与任务审批闭环

- [x] `MessageBus` 接口 + 进程内实现：群聊 / 直达 / `@` 提及 / 指挥链广播
- [x] 消息类型：指令 / 汇报 / 主动提示 / 待审产出；会话分支（继承上下文、互不污染）
- [x] `auto_dispatch`（能力 + 负载）、`capable_seats`（技能 + 密级）
- [x] 权限校验：无 `can_dispatch` 抛 `PermissionDenied`，无 `can_approve` 拒绝审批
- [x] 产出状态机 `执行中 → 待审 → 完成`，默认挂起待审
- [x] 人类反馈（Good/Bad）持久化，供自进化读取

**断言**：`seat-collaboration/spec.md` + `task-and-approval/spec.md` 全部 Scenario。

## 阶段 7：MCP 仿真接入与加权择优

- [x] MCP stdio 客户端（JSON-RPC 2.0）：spawn 子进程、调用工具、超时与清理
- [x] 多套方案由多席位并发生成（`Promise.allSettled`，总耗时≈最慢单席）
- [x] 统一调用契约：入参 `{plan_id, plan_name, plan_content}`，返回 `{score, metrics, narrative, success}`
- [x] 单系统失败隔离（标记未连接，不中断整体）
- [x] 权重归一化加权汇总、择优排序、对比报告
- [x] 择优方案需人工确认后才下发

**断言**：`simulation-mcp/spec.md` 全部 Scenario（含并发耗时与 0.7×80+0.3×60=74 的加权断言）。

## 阶段 8：自进化闭环

- [x] 反思 → 提炼 → 验证 → 固化闭环
- [x] 产物强制 `clearance=1`，禁止自动提权
- [x] 危险指令校验（命中即拒绝固化）
- [x] 全过程留痕 + 回滚
- [x] 产物写入 `runtime/`（与 `skills/` 隔离）

**断言**：`agent-evolution/spec.md` 全部 Scenario。

## 阶段 9：前端控制台

- [x] React + Vite + TypeScript 骨架（`web/`）
- [x] 11 个功能模块：活动选择切换、会话列表、席位集群视图、协同消息流、人工审核队列、方案推演对比、知识库权限视图、Skill 管理、MCP 服务管理、执行轨迹、运行时指标
- [x] 本地 API 层对接后端

**断言**：`web-console/spec.md` 全部 Scenario（以组件渲染与状态逻辑测试为主）。

## 阶段 10：回归与校验

- [x] 运行全部 Vitest 测试，确认所有能力断言通过
- [x] 修改配置后跑回归，确认既有能力未被破坏
- [x] 执行 OpenSpec 校验（`validate` 通过：valid=true、无 issues）；归档留待确认后执行
