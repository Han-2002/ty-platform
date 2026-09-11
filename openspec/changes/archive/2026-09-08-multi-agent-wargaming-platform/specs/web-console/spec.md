## Purpose

提供承载平台全部操作入口的前端控制台，使人类能够切换活动、观察席位集群与协同消息、审核产出、比对推演结果，并管理知识库、技能与仿真服务。

## ADDED Requirements

### Requirement: 活动选择与切换

系统 SHALL 提供活动（工作区）的选择与切换入口；在未选择任何活动时，系统的输入能力 MUST 处于不可用状态。

#### Scenario: 未选活动时输入不可用

- **WHEN** 用户尚未选择任何活动
- **THEN** 界面中的任务下达与消息输入 MUST 处于不可用状态，直到用户选定某个活动

### Requirement: 会话列表区分群聊与直达

系统 SHALL 展示会话列表，且 MUST 区分群聊会话与席位直达会话。

#### Scenario: 会话列表按类型区分展示

- **WHEN** 用户查看会话列表，列表中同时存在群聊与席位直达会话
- **THEN** 界面 MUST 能明确区分这两类会话

### Requirement: 席位集群视图展示席位状态

系统 SHALL 提供席位集群视图，并 MUST 展示每个席位的状态，状态集合 MUST 至少包含：空闲、执行中、待审。

#### Scenario: 席位状态被正确呈现

- **WHEN** 集群中同时存在空闲、执行中与待审三种状态的席位
- **THEN** 席位集群视图 MUST 将这三种状态分别呈现，且与实际状态一致

### Requirement: 协同消息流按类型呈现

系统 SHALL 展示协同消息流，并 MUST 按消息类型区分呈现，类型集合 MUST 至少包含：指令、汇报、主动提示。

#### Scenario: 消息按类型可区分

- **WHEN** 消息流中包含指令、汇报与主动提示三类消息
- **THEN** 界面 MUST 能明确区分这三类消息

### Requirement: 人工审核队列支持通过与打回

系统 SHALL 提供人工审核队列，汇聚全部待审产出，并 MUST 支持对每条产出执行通过或打回操作。

#### Scenario: 审核通过使产出闭环

- **WHEN** 审核人员在队列中对一条待审产出执行通过
- **THEN** 该产出 MUST 转为完成状态，并从待审队列中移除

#### Scenario: 审核打回使产出退回

- **WHEN** 审核人员对一条待审产出执行打回
- **THEN** 该产出 MUST 退回给提交席位，且 MUST NOT 进入完成状态

### Requirement: 方案推演结果对比

系统 SHALL 提供方案推演结果对比视图，MUST 展示每套候选方案在各仿真系统的评分、加权总分与最终择优结果。

#### Scenario: 对比视图呈现多仿真评分与择优结果

- **WHEN** 多套方案完成推演
- **THEN** 界面 MUST 呈现每套方案在各仿真系统的评分与加权总分，并 MUST 标出择优方案

### Requirement: 知识库权限视图

系统 SHALL 提供知识库权限视图，MUST 按当前角色展示其可见文档，且 MUST 屏蔽越权内容使其完全不可见。

#### Scenario: 越权文档在视图中被屏蔽

- **WHEN** 以较低密级角色查看知识库视图
- **THEN** 超出该角色权限的文档 MUST NOT 出现在列表中，且 MUST NOT 以占位或脱敏摘要形式暴露其存在

### Requirement: Skill 管理入口

系统 SHALL 提供 Skill 管理入口，MUST 支持技能的上传、启停、打包与角色装配操作。

#### Scenario: 通过界面完成启停与角色装配

- **WHEN** 管理员在 Skill 管理入口对某技能执行停用，并为某角色装配一个技能包
- **THEN** 该技能 MUST 变为不可用，且目标角色 MUST 获得该技能包内的技能

### Requirement: MCP 服务管理入口

系统 SHALL 提供 MCP 服务管理入口，MUST 展示每个已配置仿真服务的连接状态，并 MUST 支持对其执行启动与停止。

#### Scenario: 连接状态可见且可启停

- **WHEN** 管理员查看 MCP 服务管理入口，其中含一个连接失败的服务
- **THEN** 该服务 MUST 被显示为未连接，且管理员 MUST 能对其执行启动操作

### Requirement: 执行轨迹与运行时指标视图

系统 SHALL 提供执行轨迹（Trajectory）视图，并 MUST 展示运行时指标，指标集合 MUST 至少包含：turns、steps、TTFT、tokens、上下文占用。

#### Scenario: 轨迹与指标被呈现

- **WHEN** 用户查看某席位的一次执行
- **THEN** 界面 MUST 呈现该次执行的轨迹，并 MUST 展示 turns、steps、TTFT、tokens 与上下文占用五项指标
