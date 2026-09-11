# seat-collaboration Specification

## Purpose
提供席位之间的协同消息与会话能力，形态类似群聊，使多个席位能以群聊、直达、提及与广播方式交互，并能从任意消息分支出新会话以支撑多方案分叉推演。

## Requirements

### Requirement: 支持群聊会话

系统 SHALL 支持多个席位加入同一群聊会话，任一成员发送的消息 MUST 对群内全部成员可见，且 MUST 对非群成员不可见。

#### Scenario: 群聊消息仅对成员可见

- **WHEN** 某席位在一个包含 3 个成员的群聊中发送消息
- **THEN** 另外 2 个成员 MUST 都收到该消息，且非该群成员的席位 MUST NOT 收到

### Requirement: 支持席位直达会话

系统 SHALL 支持两个席位之间的直达会话，直达会话中的消息 MUST 仅对这两个席位可见。

#### Scenario: 直达消息仅两方可见

- **WHEN** 席位 A 与席位 B 在直达会话中通信
- **THEN** 该会话中的消息 MUST 仅对 A 与 B 可见，其他席位 MUST NOT 收到

### Requirement: 支持 @ 提及

系统 SHALL 支持在消息中使用 `@` 提及指定席位，被提及的席位 MUST 收到针对该消息的明确通知。

#### Scenario: 被提及席位收到通知

- **WHEN** 席位 A 在群聊中发送一条包含 `@席位B` 的消息
- **THEN** 席位 B MUST 收到针对该消息的提及通知

### Requirement: 支持指挥链广播

系统 SHALL 支持沿指挥链向下广播消息，广播 MUST 覆盖发起席位的全部下级与后代席位，且 MUST NOT 扩散到该子树之外。

#### Scenario: 广播覆盖指挥链子树

- **WHEN** 席位 A 发起一次指挥链广播
- **THEN** A 的全部后代席位 MUST 收到该消息，不在该子树内的席位 MUST NOT 收到

### Requirement: 消息必须区分类型

系统 SHALL 为每条消息标记类型，且类型集合 MUST 至少包含：指令、汇报、主动提示、待审产出。

#### Scenario: 消息携带与其语义一致的类型标记

- **WHEN** 席位提交一份产出等待人类确认，且另一席位在空闲时主动发出一条提示
- **THEN** 前者 MUST 被标记为待审产出类型，后者 MUST 被标记为主动提示类型

### Requirement: 支持从任意消息分支出新会话

系统 SHALL 支持从任意一条消息分支出新会话；新会话 MUST 继承该消息及其之前的上下文，且 MUST 与源会话相互独立。

#### Scenario: 分支会话继承上下文且互不污染

- **WHEN** 用户从会话 S 中的消息 M 分支出新会话 T
- **THEN** 会话 T MUST 包含消息 M 及其之前的上下文，且后续在 T 中的交流 MUST NOT 写入会话 S
