TY Platform Complete Demo V1
============================

这是“演示成品”，不是又一个小补丁。
它独立放在 demo-final 目录，不覆盖同学现有 Runtime/Skill/MCP 代码。

直接运行：
1. 把 demo-final 整个文件夹放到 ty-platform 项目根目录下。
2. 双击 demo-final\START_DEMO.bat
3. 浏览器会打开 http://127.0.0.1:8790
4. 登录：director / demo123
5. 点击“一键运行完整演示”
6. 演示会自动推进到“等待人工最终确认”
7. 到“方案 / 仿真”页面，人工选择一套方案并下发
8. 到“审计 / 进化”查看全链路记录和 Agent 进化建议

演示账号：
- director / demo123   总导演席
- leaderA  / demo123   A组组长席
- intelA   / demo123   A组情报席
- peerB    / demo123   B组方案席

你可以同时开多个无痕窗口，用不同账号登录，测试实时群聊。

完整演示链路：
想定准备
→ 任务组织
→ A组层级协同 / B组平级多Agent协商
→ 席位Agent自动检索知识库与调用Skill
→ 多套方案形成
→ 3套仿真系统 × 3套方案
→ 系统给出可解释推荐
→ 人工最终确认
→ 方案下发
→ 审计
→ Agent Skill / Workflow 进化建议（人工审批）

100席位：
- Demo初始化100个席位/Agent。
- 每席位有角色、密级、记忆条数、Skill集合、运行状态和任务。
- 前11个席位参与主演示流程，其余席位用于体现大活动规模及Agent集群。

数据：
- Demo状态存入本机 PostgreSQL 的 demo_snapshot 表。
- 重启 Demo 后状态仍保留。
- 点击“重置演示”可以恢复初始状态。

重要边界：
- 当前 Agent 执行轨迹是可运行的 Demo Agent Engine（确定性演示逻辑），用于完整展示产品闭环。
- 同学所说的正式 Agent Runtime/MCP 之后应通过 adapter 替换 Demo Agent Engine；本Demo不删除、不覆盖那些模块。
- 多仿真结果为 Demo 仿真结果，用来展示真实多系统接入后的产品交互与数据结构。
- 这版目标是“能从头演示到尾”，不是生产部署最终版。
