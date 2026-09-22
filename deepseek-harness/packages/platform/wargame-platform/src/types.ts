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
  allow: string[]; // 角色白名单；为空表示不额外限制
  deny: string[]; // 角色黑名单；优先级高于 allow
}

// ---------- 消息与会话 ----------

export type MessageType = 'instruction' | 'report' | 'proactive' | 'pending_output';

export interface Message {
  id: string;
  conversationId: string;
  type: MessageType;
  from: string; // 席位 id
  content: string;
  mentions: string[]; // 被 @ 提及的席位 id
  timestamp: number;
  parentMessageId?: string; // 分支会话的源消息
}

export type ConversationType = 'group' | 'direct';

export interface Conversation {
  id: string;
  type: ConversationType;
  members: string[]; // 席位 id
  activityId: string;
  branchFrom?: string; // 分支自哪条消息
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
}

// ---------- 记忆 ----------

export type MemoryKind = 'working' | 'long_term' | 'episodic';

export interface MemoryEntry {
  id: string;
  kind: MemoryKind;
  content: string;
  createdAt: number;
}

// ============================================================================
// Remote wire 视图类型（`wargame` namespace 的 client-safe JSON 视图）
// ============================================================================

export type SeatStatus = 'idle' | 'executing' | 'awaiting';

export interface SeatView {
  id: string;
  name: string;
  roleId: string;
  roleName: string;
  level: number;
  clearance: number;
  canDispatch: boolean;
  canApprove: boolean;
  parentId: string | null;
  status: SeatStatus;
}

export interface RoleView {
  id: string;
  name: string;
  level: number;
  clearance: number;
  canDispatch: boolean;
  canApprove: boolean;
  packs: string[];
}

export interface ActivityView {
  id: string;
  name: string;
  phases: string[];
}

export interface KnowledgeView {
  id: string;
  title: string;
  content: string;
  clearance: number;
}

export interface SkillView {
  name: string;
  description: string;
  clearance: number;
  enabled: boolean;
  allowedRoles: string[];
}

export interface SimulatorView {
  id: string;
  name: string;
  weight: number;
}

export interface ConversationView {
  id: string;
  type: 'group' | 'direct';
  members: string[];
  activityId: string;
  branchFrom?: string;
}

export type MessageKind = 'instruction' | 'report' | 'proactive' | 'pending_output';

export interface MessageView {
  id: string;
  conversationId: string;
  type: MessageKind;
  from: string;
  content: string;
  mentions: string[];
  timestamp: number;
}

export interface TaskView {
  id: string;
  activityId: string;
  title: string;
  requiredSkills: string[];
  requiredClearance: number;
  assignedSeatId?: string;
  status: 'pending' | 'executing' | 'done';
}

export interface OutputView {
  id: string;
  taskId: string;
  seatId: string;
  content: string;
  status: 'executing' | 'waiting_approval' | 'completed';
}

export interface PlanOutcomeView {
  simulatorId: string;
  connected: boolean;
  score?: number;
}

export interface PlanResultView {
  planId: string;
  planName: string;
  content: string;
  seatId: string;
  weightedScore: number;
  rank: number;
  outcomes: PlanOutcomeView[];
  confirmed: boolean;
}

export interface SendInstructionRequest {
  activityId: string;
  text: string;
  bySeatId?: string;
}

export interface ApproveOutputRequest {
  outputId: string;
  bySeatId: string;
}

export interface SubmitOutputRequest {
  taskId: string;
  seatId: string;
  content: string;
}

export interface ListKnowledgeRequest {
  roleId: string;
}

export interface ListSkillsRequest {
  roleId: string;
}

export interface ListMessagesRequest {
  conversationId: string;
}

export interface GeneratePlansRequest {
  topic: string;
}

export interface GeneratePlansValue {
  plans: PlanResultView[];
  report: string;
}

export interface AgentSeatContextSync {
  sessionId: string;
  token: string;
  userId: string;
  userName: string;
  activityId: string;
  activityName: string;
  seatId: string;
  seatName: string;
  roleId: string;
  roleName: string;
  clearance: number;
  canDispatch: boolean;
  canApprove: boolean;
}
