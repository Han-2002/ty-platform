/** Domain types for the console engine. */

export type SeatStatus = 'idle' | 'executing' | 'waiting_approval'
export type MessageType = 'instruction' | 'report' | 'proactive'
export type ConversationType = 'group' | 'direct'
export type OutputStatus = 'waiting_approval' | 'executing' | 'completed'

export interface ActivityItem { id: string; name: string }

export interface ConversationItem { id: string; type: ConversationType; name: string }

export interface SeatItem { id: string; name: string; status: SeatStatus }

export interface MessageItem {
  id: string
  type: MessageType
  from: string
  content: string
  at: number
}

export interface TaskItem {
  id: string
  activityId: string
  title: string
  assignedSeatId: string
  status: 'executing' | 'done'
}

export interface OutputItem {
  id: string
  taskId: string
  seatId: string
  content: string
  status: OutputStatus
  createdAt: number
}

export interface PlanScore {
  planId: string
  planName: string
  scores: { simulator: string; score: number }[]
  weighted: number
  selected: boolean
  dispatched: boolean
}

export interface KnowledgeItem {
  id: string
  title: string
  clearance: number
  allow: string[]
  deny: string[]
  content: string
}

export interface SkillItem { id: string; name: string; enabled: boolean }

export interface McpServiceItem {
  id: string
  name: string
  connected: boolean
  weight: number
}

export interface TrajectoryStep { step: number; action: string; at: number }

export interface RuntimeMetrics {
  turns: number
  steps: number
  ttft: number
  tokens: number
  contextUsage: number
}

export interface RoleItem { id: string; clearance: number; canApprove: boolean; canDispatch: boolean }
