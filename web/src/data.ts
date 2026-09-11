import type {
  ActivityItem,
  ConversationItem,
  SeatItem,
  MessageItem,
  ApprovalItem,
  PlanScore,
  KnowledgeItem,
  SkillItem,
  McpServiceItem,
  TrajectoryStep,
  RuntimeMetrics,
} from './types.js';

export const activities: ActivityItem[] = [
  { id: 'act-blue', name: '蓝军对抗演练' },
  { id: 'act-red', name: '红方推演活动' },
];

export const conversations: ConversationItem[] = [
  { id: 'c1', type: 'group', name: '导演部群聊' },
  { id: 'c2', type: 'direct', name: '总导演席 → 参谋一席' },
  { id: 'c3', type: 'group', name: '方案拟制协作群' },
];

export const seats: SeatItem[] = [
  { id: 's1', name: '总导演席', role: 'director', status: 'idle' },
  { id: 's2', name: '参谋一席', role: 'staff', status: 'executing' },
  { id: 's3', name: '参谋二席', role: 'staff', status: 'waiting_approval' },
  { id: 's4', name: '保障一席', role: 'support', status: 'idle' },
];

export const messages: MessageItem[] = [
  { id: 'm1', type: 'instruction', from: '总导演席', content: '请拟制蓝方对抗方案' },
  { id: 'm2', type: 'report', from: '参谋一席', content: '已提交三套候选方案' },
  { id: 'm3', type: 'proactive', from: '保障一席', content: '主动提示：资源已就绪' },
];

export const approvals: ApprovalItem[] = [
  { id: 'a1', title: '方案一（候选）', seatId: '参谋一席', content: '方案拟制产出' },
  { id: 'a2', title: '态势研判报告', seatId: '参谋二席', content: '态势研判产出' },
];

export const planScores: PlanScore[] = [
  {
    planId: 'p1',
    planName: '方案一',
    scores: [
      { simulator: '红方仿真', score: 80 },
      { simulator: '蓝方仿真', score: 60 },
    ],
    weighted: 74,
    selected: true,
  },
  {
    planId: 'p2',
    planName: '方案二',
    scores: [
      { simulator: '红方仿真', score: 70 },
      { simulator: '蓝方仿真', score: 50 },
    ],
    weighted: 64,
    selected: false,
  },
];

export const knowledgeItems: KnowledgeItem[] = [
  { id: 'd1', title: '兵棋推演组织规范', clearance: 1, visible: true },
  { id: 'd2', title: 'OODA 决策循环方法', clearance: 2, visible: true },
  { id: 'd3', title: '推演核心参数', clearance: 5, visible: false }, // 越权，应被屏蔽
];

export const skills: SkillItem[] = [
  { id: 'sk1', name: 'wargame-organization', enabled: true, allowedRoles: ['director', 'staff'] },
  { id: 'sk2', name: 'task-decomposition', enabled: false, allowedRoles: ['director', 'staff', 'support'] },
  { id: 'sk3', name: 'plan-drafting', enabled: true, allowedRoles: ['director', 'staff'] },
];

export const mcpServices: McpServiceItem[] = [
  { id: 'sim-red', name: '红方仿真引擎', connected: true },
  { id: 'sim-blue', name: '蓝方仿真引擎', connected: false },
];

export const trajectory: TrajectoryStep[] = [
  { step: 1, action: '接收指令' },
  { step: 2, action: '检索知识库' },
  { step: 3, action: '调用技能拟制方案' },
  { step: 4, action: '提交产出待审' },
];

export const metrics: RuntimeMetrics = {
  turns: 4,
  steps: 12,
  ttft: 320,
  tokens: 4821,
  contextUsage: 0.42,
};
