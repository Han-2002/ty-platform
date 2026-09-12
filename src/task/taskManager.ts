import { randomUUID } from 'node:crypto';
import type { Output, Task } from '../types.js';
import { PermissionDenied } from '../errors.js';
import type { Organization, Seat } from '../org/organization.js';
import type { SkillRegistry, SkillRoleView } from '../skills/skillRegistry.js';

export interface TaskInput {
  activityId: string;
  title: string;
  requiredSkills: string[];
  requiredClearance: number;
}

export interface FeedbackRecord {
  outputId: string;
  seatId: string;
  rating: 'good' | 'bad';
  note?: string;
  at: number;
}

export class TaskManager {
  private readonly tasks = new Map<string, Task>();
  private readonly outputs = new Map<string, Output>();
  private readonly feedbackLog: FeedbackRecord[] = [];
  private readonly load = new Map<string, number>();

  constructor(
    private readonly org: Organization,
    private readonly registry: SkillRegistry,
  ) {}

  private roleView(seat: Seat): SkillRoleView {
    return {
      id: seat.role.id,
      clearance: seat.clearance,
      packs: seat.packs,
      skill_allow: seat.skill_allow,
    };
  }

  capableSeats(requiredSkills: string[], requiredClearance: number): Seat[] {
    return this.org.allSeats().filter((seat) => {
      if (seat.clearance < requiredClearance) return false;
      const available = new Set(this.registry.availableSkills(this.roleView(seat)).map((s) => s.name));
      return requiredSkills.every((s) => available.has(s));
    });
  }

  private createTask(input: TaskInput, assignedSeatId: string, groupId?: string): Task {
    const task: Task = {
      id: randomUUID(),
      activityId: input.activityId,
      title: input.title,
      requiredSkills: [...input.requiredSkills],
      requiredClearance: input.requiredClearance,
      assignedSeatId,
      groupId,
      status: 'executing',
    };
    this.tasks.set(task.id, task);
    this.load.set(assignedSeatId, (this.load.get(assignedSeatId) ?? 0) + 1);
    return task;
  }

  autoDispatch(input: TaskInput): Task {
    const capable = this.capableSeats(input.requiredSkills, input.requiredClearance);
    if (capable.length === 0) throw new Error('无满足能力与密级要求的可用席位');
    capable.sort((a, b) => (this.load.get(a.id) ?? 0) - (this.load.get(b.id) ?? 0));
    return this.createTask(input, capable[0].id);
  }

  dispatch(bySeatId: string, input: TaskInput, targetSeatId: string): Task {
    const bySeat = this.org.getSeat(bySeatId);
    if (!bySeat.can_dispatch) {
      throw new PermissionDenied(`席位 ${bySeatId} 无分派权，任务未创建`);
    }
    this.assertCapable(targetSeatId, input);
    return this.createTask(input, targetSeatId);
  }

  // 供 TaskGroupManager 使用：完成任务组权限校验后，创建带 groupId 的真实 Task。
  dispatchInGroup(input: TaskInput, targetSeatId: string, groupId: string): Task {
    this.assertCapable(targetSeatId, input);
    return this.createTask(input, targetSeatId, groupId);
  }

  private assertCapable(targetSeatId: string, input: TaskInput): void {
    const capable = this.capableSeats(input.requiredSkills, input.requiredClearance);
    if (!capable.some((s) => s.id === targetSeatId)) {
      throw new Error(`席位 ${targetSeatId} 不具备该任务所需能力或密级`);
    }
  }

  getTask(taskId: string): Task {
    const t = this.tasks.get(taskId);
    if (!t) throw new Error(`任务不存在: ${taskId}`);
    return t;
  }

  submitOutput(taskId: string, seatId: string, content: string): Output {
    const task = this.getTask(taskId);
    if (task.assignedSeatId !== seatId) {
      throw new PermissionDenied(`席位 ${seatId} 不是任务 ${taskId} 的承办席位`);
    }
    const output: Output = {
      id: randomUUID(),
      taskId,
      seatId,
      content,
      status: 'waiting_approval',
    };
    this.outputs.set(output.id, output);
    task.output = output;
    task.status = 'done';
    this.load.set(seatId, Math.max(0, (this.load.get(seatId) ?? 1) - 1));
    return output;
  }

  getOutput(outputId: string): Output {
    const o = this.outputs.get(outputId);
    if (!o) throw new Error(`产出不存在: ${outputId}`);
    return o;
  }

  approve(bySeatId: string, outputId: string): Output {
    const bySeat = this.org.getSeat(bySeatId);
    if (!bySeat.can_approve) {
      throw new PermissionDenied(`席位 ${bySeatId} 无审批权，产出保持待审`);
    }
    const output = this.getOutput(outputId);
    output.status = 'completed';
    return output;
  }

  reject(bySeatId: string, outputId: string): Output {
    const bySeat = this.org.getSeat(bySeatId);
    if (!bySeat.can_approve) {
      throw new PermissionDenied(`席位 ${bySeatId} 无审批权，产出保持待审`);
    }
    const output = this.getOutput(outputId);
    output.status = 'executing';
    return output;
  }

  recordFeedback(outputId: string, rating: 'good' | 'bad', note?: string): FeedbackRecord {
    const output = this.getOutput(outputId);
    const rec: FeedbackRecord = { outputId, seatId: output.seatId, rating, note, at: Date.now() };
    this.feedbackLog.push(rec);
    output.feedback = { rating, note };
    return rec;
  }

  getFeedback(): FeedbackRecord[] {
    return [...this.feedbackLog];
  }

  pendingOutputs(): Output[] {
    return [...this.outputs.values()].filter((o) => o.status === 'waiting_approval');
  }

  tasksForActivity(activityId: string): Task[] {
    return [...this.tasks.values()].filter((t) => t.activityId === activityId);
  }

  tasksForGroup(groupId: string): Task[] {
    return [...this.tasks.values()].filter((t) => t.groupId === groupId);
  }

  loadOf(seatId: string): number {
    return this.load.get(seatId) ?? 0;
  }
}
