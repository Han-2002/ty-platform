## Purpose

定义导演部的席位、角色、指挥链与活动作用域，使组织规模与业务边界完全由配置决定，扩席位或换活动无需改动代码。

## ADDED Requirements

### Requirement: 席位定义配置驱动且可横向扩展

系统 SHALL 从配置文件加载全部席位定义，席位数量 MUST NOT 存在硬编码上限；新增席位仅需在配置中追加条目，无需修改或新增代码。

#### Scenario: 席位从 100 扩容至 200 无需改码

- **WHEN** 管理员在席位配置中追加条目，使席位总数由 100 增加到 200
- **THEN** 系统 MUST 成功加载全部 200 个席位，每个席位均获得彼此独立的运行时，且该扩容过程不产生任何代码变更需求

### Requirement: 角色定义层级、密级与权限属性

系统 SHALL 为每个角色定义层级 `level`、密级 `clearance`、职责描述、可分派权 `can_dispatch`、可审批权 `can_approve`；席位 MUST 通过归属角色继承这些属性。

#### Scenario: 席位继承角色权限属性

- **WHEN** 某席位归属的角色定义为 `can_dispatch=false`、`clearance=2`
- **THEN** 该席位 MUST 表现为不可分派任务，且其可见内容 MUST 被限制在密级 2 以内

#### Scenario: 修改角色定义影响全部归属席位

- **WHEN** 管理员将某角色的 `can_approve` 由 `false` 改为 `true`
- **THEN** 归属该角色的全部席位 MUST 立即具备审批权，无需逐个修改席位配置

### Requirement: 指挥链通过 parent 构成树状层级

系统 SHALL 支持席位通过 `parent` 字段指向上级席位以形成树状指挥链，并 MUST 支持沿指挥链向上或向下遍历。

#### Scenario: 指挥链广播仅覆盖自身子树

- **WHEN** 某席位发起指挥链广播
- **THEN** 该席位的直接下级及其全部后代席位 MUST 收到该消息，而不在该子树内的席位 MUST NOT 收到

### Requirement: 活动作为一等公民切换业务作用域

系统 SHALL 将活动（Activity）作为一等公民，每个活动拥有独立的业务流程与任务集；切换活动 MUST 切换当前作用域，且不同活动之间的任务与会话 MUST 相互隔离。

#### Scenario: 切换活动后作用域相互隔离

- **WHEN** 用户在活动 A 下创建任务与会话，随后切换到活动 B
- **THEN** 活动 B 中 MUST NOT 出现活动 A 的任务与会话，且切回活动 A 后其内容 MUST 完整保留

### Requirement: 活动包含五个标准阶段

系统 SHALL 为每个活动定义阶段，且阶段集合 MUST 至少包含：准备、方案拟制、推演验证、执行、复盘。

#### Scenario: 活动阶段可完整枚举

- **WHEN** 查询任一活动的阶段列表
- **THEN** 返回结果 MUST 包含准备、方案拟制、推演验证、执行、复盘五个阶段
