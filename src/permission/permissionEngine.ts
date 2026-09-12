import { randomUUID } from 'node:crypto';
import { PermissionDenied } from '../errors.js';
import type { Organization } from '../org/organization.js';
import type { UserSeatManager } from '../identity/userSeatManager.js';
import type { AuditTrail } from '../audit/auditTrail.js';

export type PermissionAction =
  | 'knowledge.read'
  | 'message.send'
  | 'message.cross_group'
  | 'task.dispatch'
  | 'workflow.propose_change'
  | 'workflow.approve_change'
  | 'plan.submit'
  | 'plan.approve'
  | 'simulation.run'
  | 'plan.dispatch'
  | 'seat.assign';

export interface PermissionRequest {
  userId: string;
  seatId: string;
  activityId: string;
  action: PermissionAction;
  groupId?: string;
  taskId?: string;
  resourceId?: string;
  resourceClearance?: number;
  allowedRoleIds?: string[];
  deniedRoleIds?: string[];
  targetGroupId?: string;
  actorType?: 'human' | 'agent' | 'system';
}

export interface PermissionDecision {
  allowed: boolean;
  reason: string;
  source: 'base_policy' | 'temporary_grant' | 'deny';
}

export interface TemporaryGrant {
  id: string;
  userId: string;
  seatId: string;
  activityId: string;
  action: PermissionAction;
  resourceId?: string;
  targetGroupId?: string;
  issuedBySeatId: string;
  issuedAt: number;
  expiresAt: number;
  revokedAt?: number;
  reason: string;
}

const APPROVAL_ACTIONS = new Set<PermissionAction>([
  'workflow.approve_change',
  'plan.approve',
  'plan.dispatch',
  'seat.assign',
]);

const DISPATCH_ACTIONS = new Set<PermissionAction>(['task.dispatch']);

export class PermissionEngine {
  private readonly grants = new Map<string, TemporaryGrant>();

  constructor(
    private readonly org: Organization,
    private readonly userSeats: UserSeatManager,
    private readonly audit?: AuditTrail,
  ) {}

  check(req: PermissionRequest): PermissionDecision {
    let ctx;
    try {
      ctx = this.userSeats.context(req.userId, req.seatId, req.activityId);
    } catch (e) {
      return this.finish(req, {
        allowed: false,
        reason: (e as Error).message,
        source: 'deny',
      });
    }

    if (req.deniedRoleIds?.includes(ctx.roleId)) {
      return this.finish(req, {
        allowed: false,
        reason: `角色 ${ctx.roleId} 被资源策略显式拒绝`,
        source: 'deny',
      });
    }

    if (
      req.allowedRoleIds &&
      req.allowedRoleIds.length > 0 &&
      !req.allowedRoleIds.includes(ctx.roleId)
    ) {
      return this.finish(req, {
        allowed: false,
        reason: `角色 ${ctx.roleId} 不在资源白名单`,
        source: 'deny',
      });
    }

    if ((req.resourceClearance ?? 0) > ctx.clearance) {
      return this.finish(req, {
        allowed: false,
        reason: `席位密级 ${ctx.clearance} 低于资源密级 ${req.resourceClearance}`,
        source: 'deny',
      });
    }

    if (APPROVAL_ACTIONS.has(req.action)) {
      if (ctx.canApprove) {
        return this.finish(req, {
          allowed: true,
          reason: '席位具备审批权限',
          source: 'base_policy',
        });
      }
      const grant = this.matchingGrant(req);
      if (grant) {
        return this.finish(req, {
          allowed: true,
          reason: `临时授权 ${grant.id}`,
          source: 'temporary_grant',
        });
      }
      return this.finish(req, {
        allowed: false,
        reason: `动作 ${req.action} 需要审批权限`,
        source: 'deny',
      });
    }

    if (DISPATCH_ACTIONS.has(req.action)) {
      if (ctx.canDispatch) {
        return this.finish(req, {
          allowed: true,
          reason: '席位具备分派权限',
          source: 'base_policy',
        });
      }
      const grant = this.matchingGrant(req);
      if (grant) {
        return this.finish(req, {
          allowed: true,
          reason: `临时授权 ${grant.id}`,
          source: 'temporary_grant',
        });
      }
      return this.finish(req, {
        allowed: false,
        reason: `动作 ${req.action} 需要分派权限`,
        source: 'deny',
      });
    }

    if (req.action === 'message.cross_group') {
      const grant = this.matchingGrant(req);
      if (grant) {
        return this.finish(req, {
          allowed: true,
          reason: `临时跨组授权 ${grant.id}`,
          source: 'temporary_grant',
        });
      }
      return this.finish(req, {
        allowed: false,
        reason: '跨组通信默认隔离，需临时授权',
        source: 'deny',
      });
    }

    return this.finish(req, {
      allowed: true,
      reason: '通过基础业务上下文与资源策略校验',
      source: 'base_policy',
    });
  }

  assert(req: PermissionRequest): void {
    const decision = this.check(req);
    if (!decision.allowed) throw new PermissionDenied(decision.reason);
  }

  issueTemporaryGrant(
    bySeatId: string,
    grant: Omit<TemporaryGrant, 'id' | 'issuedBySeatId' | 'issuedAt' | 'revokedAt'>,
  ): TemporaryGrant {
    const issuer = this.org.getSeat(bySeatId);
    if (!issuer.can_approve) {
      throw new PermissionDenied(`席位 ${bySeatId} 无临时授权审批权`);
    }

    this.userSeats.context(grant.userId, grant.seatId, grant.activityId);
    if (grant.expiresAt <= Date.now()) throw new Error('临时授权过期时间必须晚于当前时间');

    const created: TemporaryGrant = {
      ...grant,
      id: randomUUID(),
      issuedBySeatId: bySeatId,
      issuedAt: Date.now(),
    };
    this.grants.set(created.id, created);

    this.audit?.append({
      actorType: 'human',
      activityId: grant.activityId,
      seatId: bySeatId,
      action: 'permission.grant.issue',
      targetType: 'temporary_grant',
      targetId: created.id,
      result: 'success',
      reason: grant.reason,
      metadata: {
        granteeUserId: grant.userId,
        granteeSeatId: grant.seatId,
        permissionAction: grant.action,
        targetGroupId: grant.targetGroupId,
        resourceId: grant.resourceId,
        expiresAt: grant.expiresAt,
      },
    });

    return created;
  }

  revokeTemporaryGrant(bySeatId: string, grantId: string): TemporaryGrant {
    const issuer = this.org.getSeat(bySeatId);
    if (!issuer.can_approve) {
      throw new PermissionDenied(`席位 ${bySeatId} 无临时授权撤销权`);
    }

    const grant = this.getGrant(grantId);
    grant.revokedAt = Date.now();

    this.audit?.append({
      actorType: 'human',
      activityId: grant.activityId,
      seatId: bySeatId,
      action: 'permission.grant.revoke',
      targetType: 'temporary_grant',
      targetId: grant.id,
      result: 'success',
      metadata: {
        granteeUserId: grant.userId,
        granteeSeatId: grant.seatId,
        permissionAction: grant.action,
      },
    });

    return grant;
  }

  getGrant(grantId: string): TemporaryGrant {
    const grant = this.grants.get(grantId);
    if (!grant) throw new Error(`临时授权不存在: ${grantId}`);
    return grant;
  }

  allGrants(): TemporaryGrant[] {
    return [...this.grants.values()].map((g) => ({ ...g }));
  }

  restoreGrant(grant: TemporaryGrant): void {
    this.userSeats.context(grant.userId, grant.seatId, grant.activityId);
    this.grants.set(grant.id, { ...grant });
  }

  clearGrantsForRestore(): void {
    this.grants.clear();
  }

  activeGrantsFor(userId: string, seatId: string, activityId: string): TemporaryGrant[] {
    const now = Date.now();
    return [...this.grants.values()].filter(
      (g) =>
        g.userId === userId &&
        g.seatId === seatId &&
        g.activityId === activityId &&
        !g.revokedAt &&
        g.expiresAt > now,
    );
  }

  private matchingGrant(req: PermissionRequest): TemporaryGrant | undefined {
    const now = Date.now();
    return [...this.grants.values()].find((g) => {
      if (g.revokedAt || g.expiresAt <= now) return false;
      if (g.userId !== req.userId) return false;
      if (g.seatId !== req.seatId) return false;
      if (g.activityId !== req.activityId) return false;
      if (g.action !== req.action) return false;
      if (g.resourceId && g.resourceId !== req.resourceId) return false;
      if (g.targetGroupId && g.targetGroupId !== req.targetGroupId) return false;
      return true;
    });
  }

  private finish(req: PermissionRequest, decision: PermissionDecision): PermissionDecision {
    this.audit?.append({
      actorType: req.actorType ?? 'human',
      activityId: req.activityId,
      userId: req.userId,
      seatId: req.seatId,
      action: 'permission.check',
      targetType: req.action,
      targetId: req.resourceId ?? req.targetGroupId,
      result: decision.allowed ? 'allowed' : 'denied',
      reason: decision.reason,
      metadata: {
        source: decision.source,
        groupId: req.groupId,
        taskId: req.taskId,
      },
    });
    return decision;
  }
}
