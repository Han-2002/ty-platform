// 前端视图模型（镜像后端领域类型）

export type SeatStatus = 'idle' | 'executing' | 'waiting_approval';
export type MessageType = 'instruction' | 'report' | 'proactive';
export type ConversationType = 'group' | 'direct';

export interface ActivityItem {
  id: string;
  name: string;
}

export interface ConversationItem {
  id: string;
  type: ConversationType;
  name: string;
}

export interface SeatItem {
  id: string;
  name: string;
  role: string;
  status: SeatStatus;
}

export interface MessageItem {
  id: string;
  type: MessageType;
  from: string;
  content: string;
}

export interface ApprovalItem {
  id: string;
  title: string;
  seatId: string;
  content: string;
}

export interface PlanScore {
  planId: string;
  planName: string;
  scores: { simulator: string; score: number }[];
  weighted: number;
  selected: boolean;
}

export interface KnowledgeItem {
  id: string;
  title: string;
  clearance: number;
  visible: boolean;
}

export interface SkillItem {
  id: string;
  name: string;
  enabled: boolean;
  allowedRoles: string[];
}

export interface McpServiceItem {
  id: string;
  name: string;
  connected: boolean;
}

export interface TrajectoryStep {
  step: number;
  action: string;
}

export interface RuntimeMetrics {
  turns: number;
  steps: number;
  ttft: number;
  tokens: number;
  contextUsage: number;
}
