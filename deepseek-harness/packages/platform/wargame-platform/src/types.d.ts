export declare const STANDARD_PHASES: readonly ["准备", "方案拟制", "推演验证", "执行", "复盘"];
export type Phase = (typeof STANDARD_PHASES)[number];
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
export interface KnowledgeDocument {
    id: string;
    title: string;
    content: string;
    clearance: number;
    allow: string[];
    deny: string[];
}
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
export type OutputStatus = 'executing' | 'waiting_approval' | 'completed';
export interface Output {
    id: string;
    taskId: string;
    seatId: string;
    content: string;
    status: OutputStatus;
    feedback?: {
        rating: 'good' | 'bad';
        note?: string;
    };
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
export type MemoryKind = 'working' | 'long_term' | 'episodic';
export interface MemoryEntry {
    id: string;
    kind: MemoryKind;
    content: string;
    createdAt: number;
}
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
//# sourceMappingURL=types.d.ts.map