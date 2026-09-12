// 领域类型与常量定义

// 活动标准阶段（准备 / 方案拟制 / 推演验证 / 执行 / 复盘）
export const STANDARD_PHASES = ['准备', '方案拟制', '推演验证', '执行', '复盘'] as const;
export type Phase = (typeof STANDARD_PHASES)[number];

// ---------- 配置原始结构（对应 config/*.yaml） ----------

export interface RoleDef {
  id: string;
  name: string;
  level: number;
  clearance: number;
  can_dispatch: boolean;
  can_approve: boolean;
  packs: string[];
  skill_allow?: string[];
  description?: string;
}

export interface SeatDef {
  id: string;
  name: string;
  role: string;
  parent: string | null;
}

export interface ActivityDef {
  id: string;
  name: string;
}

export interface SeatsConfig {
  roles: RoleDef[];
  seats: SeatDef[];
  activities: ActivityDef[];
}

export interface SkillConfigEntry {
  name: string;
  enabled?: boolean;
  allowed_roles?: string[];
}

export interface SkillsConfig {
  skills: SkillConfigEntry[];
  packs: Record<string, string[]>;
}

export interface SimulatorConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  tool: string;
  weight: number;
}

export interface SimulatorsConfig {
  simulators: SimulatorConfig[];
}

// ---------- 知识库文档 ----------

export interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  clearance: number;
  allow: string[];
  deny: string[];
}

// ---------- 消息与会话 ----------

export type MessageType = 'instruction' | 'report' | 'proactive' | 'pending_output';

export interface Message {
  id: string;
  conversationId: string;
  type: MessageType;
  from: string;
  content: string;
  mentions: string[];
  timestamp: number;
  parentMessageId?: string;
}

export type ConversationType = 'group' | 'direct';

export interface Conversation {
  id: string;
  type: ConversationType;
  members: string[];
  activityId: string;
  branchFrom?: string;
}

// ---------- 任务组 ----------

// 任务组是“针对某个任务临时形成的协作组织”，与 Seat.parent 指挥链分开。
export type TaskGroupMode = 'hierarchical' | 'peer';
export type PeerDecisionMode = 'vote' | 'score' | 'negotiation';
export type TaskGroupStatus = 'forming' | 'executing' | 'plan_submitted' | 'completed';

export interface TaskGroup {
  id: string;
  activityId: string;
  name: string;
  mode: TaskGroupMode;
  memberSeatIds: string[];
  leaderSeatId?: string;
  peerDecisionMode?: PeerDecisionMode;
  status: TaskGroupStatus;
  createdAt: number;
}

export interface PeerDecisionRecord {
  groupId: string;
  mode: PeerDecisionMode;
  summary: string;
  confirmedBySeatIds: string[];
  createdAt: number;
}

export type GroupPlanStatus = 'submitted' | 'approved' | 'rejected';

export interface GroupPlan {
  id: string;
  activityId: string;
  groupId: string;
  name: string;
  content: string;
  submittedBySeatId: string;
  status: GroupPlanStatus;
  createdAt: number;
}

// ---------- 任务与产出 ----------

export type OutputStatus = 'executing' | 'waiting_approval' | 'completed';

export interface Output {
  id: string;
  taskId: string;
  seatId: string;
  content: string;
  status: OutputStatus;
  feedback?: { rating: 'good' | 'bad'; note?: string };
}

export interface Task {
  id: string;
  activityId: string;
  title: string;
  requiredSkills: string[];
  requiredClearance: number;
  assignedSeatId?: string;
  groupId?: string;
  status: 'pending' | 'executing' | 'done';
  output?: Output;
}

// ---------- 仿真 ----------

export interface SimulationResult {
  plan_id: string;
  simulatorId: string;
  score: number;
  metrics: Record<string, number>;
  narrative: string;
  success: boolean;
}

export interface Plan {
  plan_id: string;
  plan_name: string;
  plan_content: string;
  seatId: string;
  groupId?: string;
}

// ---------- 记忆 ----------

export type MemoryKind = 'working' | 'long_term' | 'episodic';

export interface MemoryEntry {
  id: string;
  kind: MemoryKind;
  content: string;
  createdAt: number;
}
