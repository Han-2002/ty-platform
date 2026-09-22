import { randomUUID } from 'node:crypto';
import { PermissionDenied } from '../errors.js';
import type { Organization } from '../org/organization.js';

export type UserStatus = 'active' | 'disabled';

export interface UserProfile {
  id: string;
  name: string;
  status: UserStatus;
  createdAt: number;
}

export interface SeatAssignment {
  id: string;
  userId: string;
  seatId: string;
  activityId: string;
  active: boolean;
  assignedAt: number;
  releasedAt?: number;
  assignedBySeatId: string;
}

export interface BusinessContext {
  userId: string;
  userName: string;
  seatId: string;
  seatName: string;
  roleId: string;
  activityId: string;
  clearance: number;
  canDispatch: boolean;
  canApprove: boolean;
}

export class UserSeatManager {
  private readonly users = new Map<string, UserProfile>();
  private readonly assignments = new Map<string, SeatAssignment>();

  constructor(private readonly org: Organization) {}

  createUser(id: string, name: string): UserProfile {
    if (this.users.has(id)) throw new Error(`用户已存在: ${id}`);
    const user: UserProfile = { id, name, status: 'active', createdAt: Date.now() };
    this.users.set(id, user);
    return user;
  }

  getUser(userId: string): UserProfile {
    const user = this.users.get(userId);
    if (!user) throw new Error(`用户不存在: ${userId}`);
    return user;
  }

  allUsers(): UserProfile[] {
    return [...this.users.values()].map((u) => ({ ...u }));
  }

  disableUser(userId: string): UserProfile {
    const user = this.getUser(userId);
    user.status = 'disabled';
    return user;
  }

  assign(
    bySeatId: string,
    userId: string,
    seatId: string,
    activityId: string,
  ): SeatAssignment {
    const actor = this.org.getSeat(bySeatId);
    if (!actor.can_dispatch && !actor.can_approve) {
      throw new PermissionDenied(`席位 ${bySeatId} 无席位编配权限`);
    }

    const user = this.getUser(userId);
    if (user.status !== 'active') throw new Error(`用户 ${userId} 已停用`);

    this.org.getSeat(seatId);
    this.org.getActivity(activityId);

    const occupied = [...this.assignments.values()].find(
      (x) => x.active && x.activityId === activityId && x.seatId === seatId,
    );
    if (occupied) {
      throw new Error(`活动 ${activityId} 中席位 ${seatId} 已被用户 ${occupied.userId} 占用`);
    }

    const assignment: SeatAssignment = {
      id: randomUUID(),
      userId,
      seatId,
      activityId,
      active: true,
      assignedAt: Date.now(),
      assignedBySeatId: bySeatId,
    };
    this.assignments.set(assignment.id, assignment);
    return assignment;
  }

  release(bySeatId: string, assignmentId: string): SeatAssignment {
    const actor = this.org.getSeat(bySeatId);
    if (!actor.can_dispatch && !actor.can_approve) {
      throw new PermissionDenied(`席位 ${bySeatId} 无席位编配权限`);
    }

    const assignment = this.getAssignment(assignmentId);
    if (!assignment.active) return assignment;
    assignment.active = false;
    assignment.releasedAt = Date.now();
    return assignment;
  }

  getAssignment(assignmentId: string): SeatAssignment {
    const assignment = this.assignments.get(assignmentId);
    if (!assignment) throw new Error(`席位编配记录不存在: ${assignmentId}`);
    return assignment;
  }

  allAssignments(): SeatAssignment[] {
    return [...this.assignments.values()].map((a) => ({ ...a }));
  }

  activeAssignment(userId: string, seatId: string, activityId: string): SeatAssignment | undefined {
    return [...this.assignments.values()].find(
      (x) =>
        x.active &&
        x.userId === userId &&
        x.seatId === seatId &&
        x.activityId === activityId,
    );
  }

  assignmentsForActivity(activityId: string): SeatAssignment[] {
    return [...this.assignments.values()].filter((x) => x.activityId === activityId);
  }

  assignmentsForUser(userId: string): SeatAssignment[] {
    return [...this.assignments.values()].filter((x) => x.userId === userId);
  }

  // 仅供持久化恢复使用：不重复执行业务创建逻辑，但仍校验关键引用。
  restoreUser(user: UserProfile): void {
    if (this.users.has(user.id)) return;
    this.users.set(user.id, { ...user });
  }

  // 仅供持久化恢复使用。
  restoreAssignment(assignment: SeatAssignment): void {
    this.org.getSeat(assignment.seatId);
    this.org.getActivity(assignment.activityId);
    if (!this.users.has(assignment.userId)) {
      throw new Error(`恢复席位编配失败：用户不存在 ${assignment.userId}`);
    }

    if (assignment.active) {
      const occupied = [...this.assignments.values()].find(
        (x) =>
          x.active &&
          x.activityId === assignment.activityId &&
          x.seatId === assignment.seatId &&
          x.id !== assignment.id,
      );
      if (occupied) {
        throw new Error(
          `恢复席位编配冲突：活动 ${assignment.activityId} 中席位 ${assignment.seatId} 已被占用`,
        );
      }
    }
    this.assignments.set(assignment.id, { ...assignment });
  }

  clearForRestore(): void {
    this.users.clear();
    this.assignments.clear();
  }

  context(userId: string, seatId: string, activityId: string): BusinessContext {
    const assignment = this.activeAssignment(userId, seatId, activityId);
    if (!assignment) {
      throw new PermissionDenied(
        `用户 ${userId} 当前未被授权在活动 ${activityId} 使用席位 ${seatId}`,
      );
    }

    const user = this.getUser(userId);
    const seat = this.org.getSeat(seatId);
    return {
      userId,
      userName: user.name,
      seatId,
      seatName: seat.name,
      roleId: seat.role.id,
      activityId,
      clearance: seat.clearance,
      canDispatch: seat.can_dispatch,
      canApprove: seat.can_approve,
    };
  }
}
