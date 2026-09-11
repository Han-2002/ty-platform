# task-and-approval Specification

## Purpose
定义任务的自动分派、权限校验、产出状态机与人在回路审批，确保越权分派被明确拒绝，且关键产出必须经人类确认才闭环。

## Requirements

### Requirement: 按能力与负载自动分派任务

系统 SHALL 支持按席位能力与当前负载自动分派任务（`auto_dispatch`），分派结果 MUST 仅落在具备所需能力的席位上。

#### Scenario: 自动分派选中具备能力且负载较低的席位

- **WHEN** 提交一个需要特定技能的任务并启用自动分派
- **THEN** 系统 MUST 将该任务分派给具备该技能且当前负载较低的席位，且 MUST NOT 分派给不具备该技能的席位

### Requirement: 按技能与密级筛选可用席位

系统 SHALL 提供可用席位筛选（`capable_seats`），筛选 MUST 同时依据席位所具备的技能与密级；不满足任一条件的席位 MUST 被排除。

#### Scenario: 技能或密级不足的席位被排除

- **WHEN** 查询某任务的可用席位，该任务要求技能 A 且密级不低于 3
- **THEN** 结果 MUST 仅包含具备技能 A 且密级不低于 3 的席位，不具备技能 A 或密级不足的席位 MUST 被排除

### Requirement: 无分派权的席位分派任务必须被拒绝

当席位所属角色不具备 `can_dispatch` 时，系统 MUST 拒绝其分派任务的请求并抛出 `PermissionDenied`。

#### Scenario: 无分派权席位分派被拒

- **WHEN** 一个 `can_dispatch=false` 的席位尝试向其他席位分派任务
- **THEN** 系统 MUST 抛出 `PermissionDenied`，且该任务 MUST NOT 被创建

### Requirement: 无审批权的席位不能审批

当席位所属角色不具备 `can_approve` 时，系统 MUST 拒绝其对待审产出执行审批操作，且产出 MUST 保持在待审状态。

#### Scenario: 无审批权席位审批被拒

- **WHEN** 一个 `can_approve=false` 的席位尝试通过某份待审产出
- **THEN** 系统 MUST 拒绝该操作，且该产出 MUST 仍处于待审状态

### Requirement: 产出遵循待审状态机

系统 SHALL 使产出遵循状态机 `执行中 → 待审(WAITING_APPROVAL) → 人确认 → 完成`；产出 MUST 默认挂起为待审，且 MUST 仅在经人类确认后才进入完成。

#### Scenario: 产出默认挂起待审

- **WHEN** 席位完成一项任务并提交产出
- **THEN** 该产出 MUST 处于待审（WAITING_APPROVAL）状态，且 MUST NOT 自动进入完成

#### Scenario: 人类确认后产出闭环

- **WHEN** 人类对一份待审产出执行确认通过
- **THEN** 该产出 MUST 从待审转为完成

### Requirement: 人类反馈被记录并作为自进化输入

系统 SHALL 记录人类对产出的反馈（包含 Good/Bad response 标记），且该反馈 MUST 可被自进化流程读取作为改进输入。

#### Scenario: 反馈被持久化且可被自进化读取

- **WHEN** 人类对某产出标记为 Bad response 并附带改进意见
- **THEN** 系统 MUST 持久化该反馈，且自进化流程 MUST 能读取该反馈用于后续提炼
