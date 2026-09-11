## Purpose

让多套候选方案被并发生成，并送入多套仿真系统推演；仿真系统经 MCP 以纯配置方式接入，结果按权重加权择优，择优方案需人工确认后方可下发。

## ADDED Requirements

### Requirement: 多套候选方案并发生成

系统 SHALL 支持由多个席位**并发**生成多套候选方案；生成总耗时 MUST 接近其中最慢的单个席位耗时，而 MUST NOT 等于各席位耗时之和。

#### Scenario: 并发生成总耗时接近最慢单席

- **WHEN** 由 5 个席位并发生成 5 套方案，各席位单独耗时约在 2 到 4 秒之间
- **THEN** 总生成耗时 MUST 接近其中最慢的单个席位耗时（约 4 秒量级），且 MUST 显著小于各席位耗时之和

### Requirement: 仿真系统经 MCP 配置化接入

系统 SHALL 通过 MCP（JSON-RPC 2.0 over stdio）接入仿真系统；新增一套仿真系统 MUST 仅需在配置中登记 `id`、`name`、`command`、`args`、`tool`、`weight`，且 MUST NOT 要求修改代码。

#### Scenario: 仅改配置即接入新仿真系统

- **WHEN** 管理员在仿真配置中新增一个条目，填写其启动命令与工具名
- **THEN** 系统 MUST 能在不修改任何代码的前提下启动该仿真系统并调用其推演工具

### Requirement: 仿真工具遵循统一调用契约

系统 SHALL 以统一契约调用仿真工具：入参 MUST 包含 `plan_id`、`plan_name`、`plan_content`；返回值 MUST 为包含 `score`、`metrics`、`narrative`、`success` 的 JSON 结果。

#### Scenario: 解析仿真工具返回值

- **WHEN** 某仿真系统返回一个含 `score`、`metrics`、`narrative`、`success` 的 JSON 结果
- **THEN** 系统 MUST 正确解析这些字段，并将其纳入后续加权汇总

### Requirement: 单个仿真系统连接失败不中断整体

当某个仿真系统连接或调用失败时，系统 MUST 将其标记为未连接或失败，且 MUST 继续完成其余仿真系统的推演，不得中断整体流程。

#### Scenario: 单系统失败被隔离且整体继续

- **WHEN** 配置了 3 套仿真系统，其中 1 套启动失败
- **THEN** 系统 MUST 将失败的那一套标记为未连接，且 MUST 正常完成另外 2 套的推演并输出汇总结果

### Requirement: 多仿真结果按权重加权汇总并择优

系统 SHALL 将各仿真系统的结果按其配置权重加权汇总，据此对方案排序择优，并 MUST 输出可供人类阅读的方案对比报告。

#### Scenario: 加权汇总结果符合配置权重

- **WHEN** 某方案在权重 0.7 的仿真系统得 80 分、在权重 0.3 的仿真系统得 60 分
- **THEN** 该方案的加权得分 MUST 为 74 分，且方案排序 MUST 依据该加权得分

#### Scenario: 输出方案对比报告

- **WHEN** 多套方案的推演全部完成
- **THEN** 系统 MUST 输出一份对比报告，其中包含每套方案在各仿真系统的得分与最终加权排序

### Requirement: 择优方案需人工确认后才下发

系统 MUST NOT 自动下发择优方案；择优结果 MUST 经人类确认后才进入下发与执行。

#### Scenario: 未确认时不下发

- **WHEN** 推演完成并产生择优方案，但人类尚未确认
- **THEN** 该方案 MUST 保持待确认状态，且 MUST NOT 被下发执行

#### Scenario: 确认后下发执行

- **WHEN** 人类确认该择优方案
- **THEN** 系统 MUST 将其下发执行
