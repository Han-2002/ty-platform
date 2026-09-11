## Purpose

基于 SKILL.md 开放标准构建技能体系：技能本体由业务人员以 Markdown 维护，启用、授权与打包由管理员在编排配置中管理，二者互不干扰，并提供带安全校验的上传安装入口。

## ADDED Requirements

### Requirement: 技能采用 SKILL.md 开放标准

系统 SHALL 采用 SKILL.md 开放标准描述技能；技能定义 MUST 位于 `skills/<名称>/SKILL.md`，其 frontmatter MUST 包含 `name`、`description` 与 `metadata`（含 `clearance`、`allowed_roles`），正文 MUST 采用"步骤 + 检查清单 + 输出格式 + 禁止事项"的规程形式。

#### Scenario: 合法 SKILL.md 可被解析登记

- **WHEN** 一个包含 `name`、`description` 与 `metadata` 的 SKILL.md 被放入 `skills/<名称>/`
- **THEN** 系统 MUST 解析出技能名称、描述与权限元数据，且这些字段 MUST 可被后续授权流程引用

### Requirement: 技能本体与编排配置分离

系统 SHALL 将技能本体存放于 `skills/` 目录（由业务人员维护），将启用、授权与打包编排存放于编排配置文件（由管理员维护）；调整技能授权 MUST NOT 要求修改 SKILL.md 本体。

#### Scenario: 仅改编排配置即可调整授权

- **WHEN** 管理员在编排配置中修改某技能的角色授权
- **THEN** 授权变更 MUST 立即生效，且该技能的 SKILL.md 文件 MUST 保持未被修改

### Requirement: 技能启用状态可由开关控制

系统 SHALL 为每个技能提供 `enabled` 启停开关；将技能置为停用 MUST 使其对所有席位不可用，且 MUST NOT 删除该技能的文件。

#### Scenario: 停用技能后不可见且文件保留

- **WHEN** 管理员将某技能的 `enabled` 置为 false
- **THEN** 该技能 MUST 对所有席位不可见且不可用，同时其在 `skills/` 下的文件 MUST 仍然存在

### Requirement: 技能按角色授权

系统 SHALL 支持在注册表中为每个技能配置 `allowed_roles` 以全局收紧使用范围；不在 `allowed_roles` 内的角色 MUST 无法使用该技能。

#### Scenario: 不在授权角色列表中的席位无法使用

- **WHEN** 某席位所属角色不在技能 A 的 `allowed_roles` 中
- **THEN** 系统 MUST 拒绝该席位使用技能 A，且技能 A MUST NOT 出现在该席位的可用技能列表中

### Requirement: 技能可通过技能包整体挂载

系统 SHALL 支持将一组技能定义为技能包 `packs`，角色或席位一次挂载技能包即获得包内全部技能。

#### Scenario: 挂载技能包批量获得技能

- **WHEN** 管理员为某角色挂载一个包含技能 A、B、C 的技能包
- **THEN** 该角色下的席位 MUST 同时获得 A、B、C 三个技能，无需逐个列举

### Requirement: 技能可用需同时满足引用与授权两个条件

系统 SHALL 要求技能可用同时满足：① 角色通过技能包或技能授权列表引用了该技能；② 注册表的 `allowed_roles` 允许该角色。任一条件不满足时，该技能 MUST 不可用。

#### Scenario: 仅被引用但未获授权时不可用

- **WHEN** 某角色通过技能包引用了技能 A，但注册表 `allowed_roles` 未包含该角色
- **THEN** 技能 A MUST 对该角色不可用

#### Scenario: 已获授权但未被引用时不可用

- **WHEN** 注册表 `allowed_roles` 包含某角色，但该角色未通过技能包或授权列表引用技能 A
- **THEN** 技能 A MUST 对该角色不可用

#### Scenario: 两个条件均满足时可用

- **WHEN** 某角色既引用了技能 A，且 `allowed_roles` 也允许该角色
- **THEN** 技能 A MUST 对该角色可用

### Requirement: 管理员编排配置优先于内嵌元数据

当编排配置中的设置与 SKILL.md 内嵌 `metadata` 冲突时，系统 MUST 以管理员编排配置为准。

#### Scenario: 冲突时以管理员配置为准

- **WHEN** SKILL.md 内嵌 `metadata` 声明 `allowed_roles` 为 `[参谋]`，而编排配置声明为 `[总导演]`
- **THEN** 系统 MUST 采用 `[总导演]`，并忽略内嵌声明

### Requirement: 支持上传 zip 技能包自动解析安装

系统 SHALL 提供上传入口，接收 `.zip` 技能包后自动解析其中的 SKILL.md、安装到 `skills/` 并同步登记进注册表；MUST 同时支持单技能包（SKILL.md 位于包根）与多技能批量包（每个子目录各含一个 SKILL.md）。

#### Scenario: 安装单技能包

- **WHEN** 上传一个根目录直接包含 SKILL.md 的 zip 包
- **THEN** 系统 MUST 将其安装为单个技能并在注册表中完成登记

#### Scenario: 安装多技能批量包

- **WHEN** 上传一个 zip 包，其中每个子目录各包含一个 SKILL.md
- **THEN** 系统 MUST 将每个子目录分别安装为独立技能，并全部登记进注册表

### Requirement: 上传技能包必须通过安全校验

系统 SHALL 对上传的技能包执行安全校验，并 MUST 拒绝以下任一情况：解压目标路径逃逸出 `skills/` 目录（zip slip）、包含 `.exe`/`.dll`/`.so`/`.bat` 等可执行文件、包含非白名单文件类型、解压后总体积超过 20MB、文件数量超过 500、技能名未通过净化仍含目录穿越成分、包内不含任何 SKILL.md。

#### Scenario: 拒绝路径穿越包

- **WHEN** 上传的 zip 包含以 `../` 开头的条目，试图写入 `skills/` 之外
- **THEN** 系统 MUST 拒绝该包，且 MUST NOT 在 `skills/` 之外创建任何文件

#### Scenario: 拒绝可执行文件

- **WHEN** 上传的 zip 包含 `.exe` 或 `.dll` 文件
- **THEN** 系统 MUST 拒绝该包并说明被拒绝的原因

#### Scenario: 拒绝超出体积或文件数上限的包

- **WHEN** 上传的 zip 解压后总体积超过 20MB，或文件数量超过 500
- **THEN** 系统 MUST 拒绝该包

#### Scenario: 拒绝无 SKILL.md 的无效包

- **WHEN** 上传的 zip 中不包含任何 SKILL.md
- **THEN** 系统 MUST 拒绝该包并提示缺少 SKILL.md

#### Scenario: 净化技能名防目录穿越

- **WHEN** 上传包中的技能名包含 `../` 等目录穿越成分
- **THEN** 系统 MUST 净化该名称，确保最终安装路径仍位于 `skills/` 之内
