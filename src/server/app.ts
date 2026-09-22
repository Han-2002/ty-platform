import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { WebSocketServer } from 'ws';
import { PermissionDenied } from '../errors.js';
import { AuthenticationError, AccountLockedError } from '../auth/authService.js';
import type { GroupPlan } from '../types.js';
import type { WorkflowChange } from '../workflow/workflowManager.js';
import type { ServerContext } from './context.js';
import { RealtimeHub } from './events.js';
import { bearerToken, requirePrincipal } from './auth.js';

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

export interface ApiServerOptions {
  host?: string;
  port?: number;
}

export interface RunningApiServer {
  host: string;
  port: number;
  baseUrl: string;
  hub: RealtimeHub;
  close(): Promise<void>;
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

async function businessActor(req: IncomingMessage, ctx: ServerContext) {
  const principal = await requirePrincipal(req, ctx.auth);
  const seatId = header(req, 'x-seat-id');
  const activityId = header(req, 'x-activity-id');
  if (!seatId || !activityId) {
    throw new Error('缺少业务上下文请求头：x-seat-id / x-activity-id');
  }

  // 普通用户仍必须具有真实席位编配。
  // admin 作为推演控制台管理员，可在当前活动中代理合法席位。
  ctx.identities.context(principal.userId, seatId, activityId);

  return {
    userId: principal.userId,
    userName: principal.userName,
    seatId,
    activityId,
    sessionId: principal.sessionId,
  };
}

async function body<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > 2 * 1024 * 1024) throw new Error('请求体超过 2MB 限制');
    chunks.push(buf);
  }
  if (chunks.length === 0) return {} as T;
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
}

function json(res: ServerResponse, status: number, data: Json): void {
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'access-control-allow-origin': '*',
    'access-control-allow-headers':
      'content-type,authorization,x-seat-id,x-activity-id',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  });
  res.end(payload);
}

const ok = (res: ServerResponse, data: Json) => json(res, 200, data);
const created = (res: ServerResponse, data: Json) => json(res, 201, data);
const notFound = (res: ServerResponse) => json(res, 404, { error: 'NOT_FOUND' });
const routeMatch = (path: string, pattern: RegExp) => path.match(pattern);

async function auditCommand(
  ctx: ServerContext,
  input: {
    activityId?: string;
    userId?: string;
    seatId?: string;
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  ctx.audit.append({
    actorType: 'human',
    activityId: input.activityId,
    userId: input.userId,
    seatId: input.seatId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    result: 'success',
    metadata: input.metadata,
  });
  await ctx.persistentAudit.flush();
}

export async function startApiServer(
  ctx: ServerContext,
  options: ApiServerOptions = {},
): Promise<RunningApiServer> {
  const host = options.host ?? process.env.API_HOST ?? '127.0.0.1';
  const requestedPort = options.port ?? Number(process.env.API_PORT ?? 8787);
  const hub = new RealtimeHub();

  const server = createServer(async (req, res) => {
    try {
      if (!req.url || !req.method) return notFound(res);

      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'access-control-allow-origin': '*',
          'access-control-allow-headers':
            'content-type,authorization,x-seat-id,x-activity-id',
          'access-control-allow-methods': 'GET,POST,OPTIONS',
        });
        res.end();
        return;
      }

      const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
      const path = url.pathname;

      // ---------- Public ----------
      if (req.method === 'GET' && path === '/api/health') {
        await ctx.db.ping();
        return ok(res, {
          status: 'ok',
          database: 'connected',
          auth: 'enabled',
          websocketClients: hub.clientCount,
          timestamp: Date.now(),
        });
      }


      // ---------- Demo seat login ----------
      // Only enabled when DEMO_SEAT_LOGIN=1.
      if (req.method === 'GET' && path === '/api/demo-login/options') {
        if (process.env.DEMO_SEAT_LOGIN !== '1') return notFound(res);

        const options = ctx.identities
          .allAssignments()
          .filter((a) => a.active)
          .map((a) => {
            const user = ctx.identities.getUser(a.userId);
            const seat = ctx.org.getSeat(a.seatId);
            const activity = ctx.org.getActivity(a.activityId);
            return {
              assignmentId: a.id,
              userId: a.userId,
              userName: user.name,
              activityId: a.activityId,
              activityName: activity.name,
              seatId: a.seatId,
              seatName: seat.name,
              roleId: seat.role.id,
              roleName: seat.role.name,
              clearance: seat.clearance,
              canDispatch: seat.can_dispatch,
              canApprove: seat.can_approve,
            };
          })
          .sort((a, b) =>
            a.activityName.localeCompare(b.activityName, 'zh-CN') ||
            a.seatName.localeCompare(b.seatName, 'zh-CN')
          );

        return ok(res, options);
      }

      if (req.method === 'POST' && path === '/api/demo-login') {
        if (process.env.DEMO_SEAT_LOGIN !== '1') return notFound(res);

        const data = await body<{ activityId: string; seatId: string }>(req);
        if (!data.activityId || !data.seatId) {
          throw new Error('activityId 和 seatId 必填');
        }

        const assignment = ctx.identities
          .allAssignments()
          .find(
            (a) =>
              a.active &&
              a.activityId === data.activityId &&
              a.seatId === data.seatId,
          );

        if (!assignment) {
          throw new Error(
            `活动 ${data.activityId} 中没有可用席位编配 ${data.seatId}`,
          );
        }

        const result = await ctx.auth.demoLogin(assignment.userId, {
          userAgent: header(req, 'user-agent'),
          ipAddress: req.socket.remoteAddress,
        });

        ctx.audit.append({
          actorType: 'human',
          activityId: assignment.activityId,
          userId: assignment.userId,
          seatId: assignment.seatId,
          action: 'auth.demo-seat-login',
          targetType: 'session',
          targetId: result.sessionId,
          result: 'success',
          metadata: {
            demo: true,
            assignmentId: assignment.id,
          },
        });
        await ctx.persistentAudit.flush();

        return ok(res, {
          ...result,
          activityId: assignment.activityId,
          seatId: assignment.seatId,
        });
      }

      if (req.method === 'POST' && path === '/api/auth/login') {
        const data = await body<{ userId: string; password: string }>(req);
        if (!data.userId || !data.password) throw new Error('userId 和 password 必填');

        const result = await ctx.auth.login(data.userId, data.password, {
          userAgent: header(req, 'user-agent'),
          ipAddress: req.socket.remoteAddress,
        });

        ctx.audit.append({
          actorType: 'human',
          userId: result.userId,
          action: 'auth.login',
          targetType: 'session',
          targetId: result.sessionId,
          result: 'success',
        });
        await ctx.persistentAudit.flush();

        return ok(res, result);
      }

      if (req.method === 'POST' && path === '/api/auth/logout') {
        const token = bearerToken(req);
        if (!token) return json(res, 401, { error: 'UNAUTHENTICATED' });
        const principal = await ctx.auth.authenticate(token);
        await ctx.auth.logout(token);
        ctx.audit.append({
          actorType: 'human',
          userId: principal.userId,
          action: 'auth.logout',
          targetType: 'session',
          targetId: principal.sessionId,
          result: 'success',
        });
        await ctx.persistentAudit.flush();
        return ok(res, { ok: true });
      }

      // 除 health/login/logout 外，所有 API 都必须先登录。
      const principal = await requirePrincipal(req, ctx.auth);

      // ---------- Metadata ----------
      if (req.method === 'GET' && path === '/api/me') {
        return ok(res, {
          userId: principal.userId,
          userName: principal.userName,
          sessionId: principal.sessionId,
          expiresAt: principal.expiresAt,
          assignments: ctx.identities.assignmentsForUser(principal.userId),
        });
      }

      if (req.method === 'GET' && path === '/api/activities') {
        return ok(
          res,
          ctx.org.allActivities().map((a) => ({ id: a.id, name: a.name, phases: a.phases })),
        );
      }

      if (req.method === 'GET' && path === '/api/seats') {
        return ok(
          res,
          ctx.org.allSeats().map((s) => ({
            id: s.id,
            name: s.name,
            roleId: s.role.id,
            roleName: s.role.name,
            parentId: s.parentId,
            clearance: s.clearance,
            canDispatch: s.can_dispatch,
            canApprove: s.can_approve,
          })),
        );
      }

      // ---------- Identity ----------
      if (req.method === 'GET' && path === '/api/users') {
        return ok(res, ctx.identities.allUsers());
      }

      if (req.method === 'POST' && path === '/api/users') {
        const a = await businessActor(req, ctx);
        const seat = ctx.org.getSeat(a.seatId);
        if (!seat.can_approve) throw new PermissionDenied('只有审批席位可以创建用户');

        const data = await body<{ id: string; name: string; password?: string }>(req);
        if (!data.id || !data.name) throw new Error('id 和 name 必填');

        const user = await ctx.persistentIdentities.createUser(data.id, data.name);
        if (data.password) await ctx.auth.setPassword(user.id, data.password);

        await auditCommand(ctx, {
          activityId: a.activityId,
          userId: a.userId,
          seatId: a.seatId,
          action: 'identity.user.create',
          targetType: 'user',
          targetId: user.id,
        });
        hub.publish({ type: 'identity.user.created', at: Date.now(), payload: user });
        return created(res, user);
      }

      if (req.method === 'GET' && path === '/api/seat-assignments') {
        const activityId = url.searchParams.get('activityId');
        const list = activityId
          ? ctx.identities.assignmentsForActivity(activityId)
          : ctx.identities.allAssignments();
        return ok(res, list);
      }

      if (req.method === 'POST' && path === '/api/seat-assignments') {
        const a = await businessActor(req, ctx);
        const data = await body<{ userId: string; seatId: string; activityId: string }>(req);
        if (data.activityId !== a.activityId) throw new Error('activityId 与当前业务上下文不一致');

        const assignment = await ctx.persistentIdentities.assign(
          a.seatId,
          data.userId,
          data.seatId,
          data.activityId,
        );
        await auditCommand(ctx, {
          activityId: data.activityId,
          userId: a.userId,
          seatId: a.seatId,
          action: 'seat.assignment.create',
          targetType: 'seat_assignment',
          targetId: assignment.id,
          metadata: { userId: data.userId, seatId: data.seatId },
        });
        hub.publish({
          type: 'seat.assignment.created',
          at: Date.now(),
          activityId: data.activityId,
          seatId: data.seatId,
          payload: assignment,
        });
        return created(res, assignment);
      }

      const releaseMatch = routeMatch(path, /^\/api\/seat-assignments\/([^/]+)\/release$/);
      if (req.method === 'POST' && releaseMatch) {
        const a = await businessActor(req, ctx);
        const assignment = ctx.identities.getAssignment(releaseMatch[1]);
        if (assignment.activityId !== a.activityId) throw new Error('跨活动释放席位被拒绝');

        const released = await ctx.persistentIdentities.release(a.seatId, releaseMatch[1]);
        await auditCommand(ctx, {
          activityId: released.activityId,
          userId: a.userId,
          seatId: a.seatId,
          action: 'seat.assignment.release',
          targetType: 'seat_assignment',
          targetId: released.id,
        });
        hub.publish({
          type: 'seat.assignment.released',
          at: Date.now(),
          activityId: released.activityId,
          seatId: released.seatId,
          payload: released,
        });
        return ok(res, released);
      }

      // ---------- Task groups ----------
      if (req.method === 'GET' && path === '/api/task-groups') {
        const activityId = url.searchParams.get('activityId');
        return ok(
          res,
          activityId
            ? ctx.taskGroups.groupsForActivity(activityId)
            : ctx.taskGroups.allGroups(),
        );
      }

      if (req.method === 'POST' && path === '/api/task-groups') {
        const a = await businessActor(req, ctx);
        const data = await body<{
          activityId: string;
          name: string;
          mode: 'hierarchical' | 'peer';
          memberSeatIds: string[];
          leaderSeatId?: string;
          peerDecisionMode?: 'vote' | 'score' | 'negotiate';
        }>(req);
        if (data.activityId !== a.activityId) throw new Error('activityId 与当前业务上下文不一致');

        const group = await ctx.persistentTaskGroups.createGroup(a.seatId, data);
        await auditCommand(ctx, {
          activityId: group.activityId,
          userId: a.userId,
          seatId: a.seatId,
          action: 'task_group.create',
          targetType: 'task_group',
          targetId: group.id,
          metadata: { mode: group.mode, members: group.memberSeatIds },
        });
        hub.publish({
          type: 'task_group.created',
          at: Date.now(),
          activityId: group.activityId,
          payload: group,
        });
        return created(res, group);
      }

      // ---------- Workflow ----------
      if (req.method === 'GET' && path === '/api/workflows') {
        const activityId = url.searchParams.get('activityId');
        const all = ctx.workflows.allWorkflows();
        return ok(res, activityId ? all.filter((w) => w.activityId === activityId) : all);
      }

      if (req.method === 'GET' && path === '/api/workflow-proposals') {
        const a = await businessActor(req, ctx);
        const activityId = url.searchParams.get('activityId') ?? a.activityId;
        if (activityId !== a.activityId) {
          throw new Error('跨活动工作流申请查询被拒绝');
        }

        const workflowIds = new Set(
          ctx.workflows
            .allWorkflows()
            .filter((w) => w.activityId === activityId)
            .map((w) => w.id),
        );

        return ok(
          res,
          ctx.workflows
            .allProposals()
            .filter((p) => workflowIds.has(p.workflowId)),
        );
      }

      const groupWorkflowMatch = routeMatch(path, /^\/api\/task-groups\/([^/]+)\/workflow$/);
      if (req.method === 'POST' && groupWorkflowMatch) {
        const a = await businessActor(req, ctx);
        const group = ctx.taskGroups.getGroup(groupWorkflowMatch[1]);
        if (group.activityId !== a.activityId) throw new Error('跨活动创建工作流被拒绝');

        const workflow = await ctx.persistentWorkflows.createForGroup(group.id);
        await auditCommand(ctx, {
          activityId: workflow.activityId,
          userId: a.userId,
          seatId: a.seatId,
          action: 'workflow.create',
          targetType: 'workflow',
          targetId: workflow.id,
          metadata: { groupId: workflow.groupId, template: workflow.template },
        });
        hub.publish({
          type: 'workflow.created',
          at: Date.now(),
          activityId: workflow.activityId,
          payload: workflow,
        });
        return created(res, workflow);
      }

      const completeMatch = routeMatch(path, /^\/api\/workflows\/([^/]+)\/complete$/);
      if (req.method === 'POST' && completeMatch) {
        const a = await businessActor(req, ctx);
        const existing = ctx.workflows.getWorkflow(completeMatch[1]);
        if (existing.activityId !== a.activityId) throw new Error('跨活动推进工作流被拒绝');

        const workflow = await ctx.persistentWorkflows.completeCurrentStep(existing.id, a.seatId);
        await auditCommand(ctx, {
          activityId: workflow.activityId,
          userId: a.userId,
          seatId: a.seatId,
          action: 'workflow.step.complete',
          targetType: 'workflow',
          targetId: workflow.id,
          metadata: { currentStep: ctx.workflows.currentStep(workflow.id)?.key },
        });
        hub.publish({
          type: 'workflow.updated',
          at: Date.now(),
          activityId: workflow.activityId,
          payload: workflow,
        });
        return ok(res, workflow);
      }

      const proposalMatch = routeMatch(path, /^\/api\/workflows\/([^/]+)\/proposals$/);
      if (req.method === 'POST' && proposalMatch) {
        const a = await businessActor(req, ctx);
        const existing = ctx.workflows.getWorkflow(proposalMatch[1]);
        if (existing.activityId !== a.activityId) throw new Error('跨活动流程变更被拒绝');

        const data = await body<{ change: WorkflowChange; reason: string }>(req);
        const proposal = await ctx.persistentWorkflows.proposeChange(
          existing.id,
          a.seatId,
          data.change,
          data.reason,
        );
        await auditCommand(ctx, {
          activityId: existing.activityId,
          userId: a.userId,
          seatId: a.seatId,
          action: 'workflow.change.propose',
          targetType: 'workflow_change_proposal',
          targetId: proposal.id,
          metadata: { changeType: proposal.change.type },
        });
        hub.publish({
          type: 'workflow.change.proposed',
          at: Date.now(),
          activityId: existing.activityId,
          payload: proposal,
        });
        return created(res, proposal);
      }

      const approveProposalMatch = routeMatch(path, /^\/api\/workflow-proposals\/([^/]+)\/approve$/);
      if (req.method === 'POST' && approveProposalMatch) {
        const a = await businessActor(req, ctx);
        const proposal = ctx.workflows.getProposal(approveProposalMatch[1]);
        const workflow = ctx.workflows.getWorkflow(proposal.workflowId);
        if (workflow.activityId !== a.activityId) throw new Error('跨活动审批流程变更被拒绝');

        const approved = await ctx.persistentWorkflows.approveChange(a.seatId, proposal.id);
        await auditCommand(ctx, {
          activityId: workflow.activityId,
          userId: a.userId,
          seatId: a.seatId,
          action: 'workflow.change.approve',
          targetType: 'workflow_change_proposal',
          targetId: approved.id,
        });
        hub.publish({
          type: 'workflow.change.approved',
          at: Date.now(),
          activityId: workflow.activityId,
          payload: { proposal: approved, workflow: ctx.workflows.getWorkflow(workflow.id) },
        });
        return ok(res, approved);
      }

      const rejectProposalMatch = routeMatch(
        path,
        /^\/api\/workflow-proposals\/([^/]+)\/reject$/,
      );

      if (req.method === 'POST' && rejectProposalMatch) {
        const a = await businessActor(req, ctx);
        const proposal = ctx.workflows.getProposal(rejectProposalMatch[1]);
        const workflow = ctx.workflows.getWorkflow(proposal.workflowId);

        if (workflow.activityId !== a.activityId) {
          throw new Error('跨活动拒绝流程变更被拒绝');
        }

        const rejected = await ctx.persistentWorkflows.rejectChange(
          a.seatId,
          proposal.id,
        );

        await auditCommand(ctx, {
          activityId: workflow.activityId,
          userId: a.userId,
          seatId: a.seatId,
          action: 'workflow.change.reject',
          targetType: 'workflow_change_proposal',
          targetId: rejected.id,
        });

        hub.publish({
          type: 'workflow.change.rejected',
          at: Date.now(),
          activityId: workflow.activityId,
          payload: rejected,
        });

        return ok(res, rejected);
      }

      // ---------- Temporary grants ----------
      if (req.method === 'GET' && path === '/api/permissions/grants') {
        const activityId = url.searchParams.get('activityId');
        const grants = ctx.permissions.allGrants();
        return ok(res, activityId ? grants.filter((g) => g.activityId === activityId) : grants);
      }

      if (req.method === 'POST' && path === '/api/permissions/grants') {
        const a = await businessActor(req, ctx);
        const data = await body<{
          userId: string;
          seatId: string;
          activityId: string;
          action: Parameters<typeof ctx.persistentPermissions.issueTemporaryGrant>[1]['action'];
          resourceId?: string;
          targetGroupId?: string;
          expiresAt: number;
          reason: string;
        }>(req);
        if (data.activityId !== a.activityId) throw new Error('activityId 与当前业务上下文不一致');

        const grant = await ctx.persistentPermissions.issueTemporaryGrant(a.seatId, data);
        await ctx.persistentAudit.flush();
        hub.publish({
          type: 'permission.grant.issued',
          at: Date.now(),
          activityId: grant.activityId,
          seatId: grant.seatId,
          payload: grant,
        });
        return created(res, grant);
      }

      const revokeGrantMatch = routeMatch(path, /^\/api\/permissions\/grants\/([^/]+)\/revoke$/);
      if (req.method === 'POST' && revokeGrantMatch) {
        const a = await businessActor(req, ctx);
        const existing = ctx.permissions.getGrant(revokeGrantMatch[1]);
        if (existing.activityId !== a.activityId) throw new Error('跨活动撤销授权被拒绝');

        const grant = await ctx.persistentPermissions.revokeTemporaryGrant(a.seatId, existing.id);
        await ctx.persistentAudit.flush();
        hub.publish({
          type: 'permission.grant.revoked',
          at: Date.now(),
          activityId: grant.activityId,
          seatId: grant.seatId,
          payload: grant,
        });
        return ok(res, grant);
      }


      // ---------- Realtime conversations / chat ----------
      if (req.method === 'GET' && path === '/api/conversations') {
        const a = await businessActor(req, ctx);
        const activityId = url.searchParams.get('activityId') ?? a.activityId;
        if (activityId !== a.activityId) throw new Error('跨活动会话查询被拒绝');
        return ok(res, await ctx.chat.listConversations(activityId, a.seatId));
      }

      if (req.method === 'POST' && path === '/api/conversations') {
        const a = await businessActor(req, ctx);
        const data = await body<{
          name: string;
          kind?: 'group' | 'direct';
          memberSeatIds: string[];
        }>(req);
        const conversation = await ctx.chat.createConversation({
          activityId: a.activityId,
          name: data.name,
          kind: data.kind ?? 'group',
          memberSeatIds: data.memberSeatIds ?? [],
          createdByUserId: a.userId,
          createdBySeatId: a.seatId,
        });
        await auditCommand(ctx, {
          activityId: a.activityId,
          userId: a.userId,
          seatId: a.seatId,
          action: 'conversation.create',
          targetType: 'conversation',
          targetId: conversation.id,
        });
        hub.publish({
          type: 'conversation.created',
          at: Date.now(),
          activityId: a.activityId,
          payload: conversation,
        });
        return created(res, conversation);
      }

      const messagesMatch = routeMatch(path, /^\/api\/conversations\/([^/]+)\/messages$/);
      if (req.method === 'GET' && messagesMatch) {
        const a = await businessActor(req, ctx);
        const messages = await ctx.chat.listMessages(messagesMatch[1], a.seatId);
        return ok(res, messages);
      }

      if (req.method === 'POST' && messagesMatch) {
        const a = await businessActor(req, ctx);
        const data = await body<{ content: string }>(req);
        const message = await ctx.chat.sendMessage({
          conversationId: messagesMatch[1],
          userId: a.userId,
          seatId: a.seatId,
          content: data.content,
        });
        hub.publish({
          type: 'chat.message.created',
          at: Date.now(),
          activityId: message.activityId,
          payload: message,
        });
        return created(res, message);
      }

      // ---------- Plan / simulation ----------
      if (req.method === 'GET' && path === '/api/plans') {
        const activityId = url.searchParams.get('activityId');
        return ok(res, activityId ? ctx.plans.versionsForActivity(activityId) : ctx.plans.allVersions());
      }

      if (req.method === 'POST' && path === '/api/plans/from-group-plan') {
        const a = await businessActor(req, ctx);
        const data = await body<{ groupPlan: GroupPlan }>(req);
        if (data.groupPlan.activityId !== a.activityId) throw new Error('activityId 与当前业务上下文不一致');

        const version = await ctx.persistentPlans.createFromGroupPlan(
          {
            userId: a.userId,
            seatId: a.seatId,
            activityId: a.activityId,
            groupId: data.groupPlan.groupId,
          },
          data.groupPlan,
        );
        await ctx.persistentAudit.flush();
        hub.publish({
          type: 'plan.version.created',
          at: Date.now(),
          activityId: version.activityId,
          payload: { ...version, content: undefined },
        });
        return created(res, version);
      }

      if (req.method === 'POST' && path === '/api/evaluations') {
        const a = await businessActor(req, ctx);
        const data = await body<{ versionIds: string[] }>(req);
        const result = await ctx.persistentPlans.evaluate(
          { userId: a.userId, seatId: a.seatId, activityId: a.activityId },
          data.versionIds,
        );
        await ctx.persistentAudit.flush();
        hub.publish({
          type: 'simulation.evaluation.completed',
          at: Date.now(),
          activityId: a.activityId,
          payload: {
            run: result.run,
            scores: result.results.map((r) => ({
              planVersionId: r.plan.plan_id,
              weightedScore: r.weightedScore,
              rank: r.rank,
            })),
          },
        });
        return created(res, result);
      }

      const confirmMatch = routeMatch(path, /^\/api\/evaluations\/([^/]+)\/confirm$/);
      if (req.method === 'POST' && confirmMatch) {
        const a = await businessActor(req, ctx);
        const data = await body<{ versionId: string; reason: string }>(req);
        const run = await ctx.persistentPlans.confirmSelection(
          { userId: a.userId, seatId: a.seatId, activityId: a.activityId },
          confirmMatch[1],
          data.versionId,
          data.reason,
        );
        await ctx.persistentAudit.flush();
        hub.publish({
          type: 'plan.selection.confirmed',
          at: Date.now(),
          activityId: a.activityId,
          payload: run,
        });
        return ok(res, run);
      }

      const dispatchMatch = routeMatch(path, /^\/api\/evaluations\/([^/]+)\/dispatch$/);
      if (req.method === 'POST' && dispatchMatch) {
        const a = await businessActor(req, ctx);
        const plan = await ctx.persistentPlans.dispatchSelected(
          { userId: a.userId, seatId: a.seatId, activityId: a.activityId },
          dispatchMatch[1],
        );
        await ctx.persistentAudit.flush();
        hub.publish({
          type: 'plan.dispatched',
          at: Date.now(),
          activityId: a.activityId,
          payload: { ...plan, content: undefined },
        });
        return ok(res, plan);
      }

      // ---------- Audit ----------
      if (req.method === 'GET' && path === '/api/audit') {
        const a = await businessActor(req, ctx);
        if (!ctx.org.getSeat(a.seatId).can_approve) {
          throw new PermissionDenied('只有审批席位可以查询审计记录');
        }
        const activityId = url.searchParams.get('activityId') ?? a.activityId;
        if (activityId !== a.activityId) throw new Error('跨活动审计查询被拒绝');

        const userId = url.searchParams.get('userId') ?? undefined;
        const seatId = url.searchParams.get('seatId') ?? undefined;
        const action = url.searchParams.get('action') ?? undefined;
        return ok(res, ctx.audit.query({ activityId, userId, seatId, action }));
      }

      return notFound(res);
    } catch (error) {
      const message = (error as Error).message;

      if (
        error instanceof AuthenticationError ||
        message.startsWith('UNAUTHENTICATED:')
      ) {
        return json(res, 401, { error: 'UNAUTHENTICATED', message });
      }
      if (error instanceof AccountLockedError) {
        return json(res, 423, { error: 'ACCOUNT_LOCKED', message });
      }
      if (error instanceof PermissionDenied) {
        return json(res, 403, { error: 'PERMISSION_DENIED', message });
      }
      if (error instanceof SyntaxError) {
        return json(res, 400, { error: 'INVALID_JSON', message });
      }

      console.error(error);
      return json(res, 400, { error: 'BAD_REQUEST', message });
    }
  });

  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', async (ws, req) => {
    try {
      const url = new URL(req.url ?? '/ws', `http://${req.headers.host ?? 'localhost'}`);
      const token = url.searchParams.get('token') ?? '';
      const principal = await ctx.auth.authenticate(token);

      const activityId = url.searchParams.get('activityId') ?? undefined;
      const seatId = url.searchParams.get('seatId') ?? undefined;

      if ((activityId && !seatId) || (!activityId && seatId)) {
        throw new Error('WebSocket seatId/activityId 必须同时提供');
      }
      if (activityId && seatId) {
        ctx.identities.context(principal.userId, seatId, activityId);
      }

      hub.add(ws, { activityId, seatId });
    } catch (error) {
      ws.close(1008, (error as Error).message.slice(0, 120));
    }
  });

  const heartbeatTimer = setInterval(() => hub.heartbeat(), 30_000);
  heartbeatTimer.unref();

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(requestedPort, host, () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('无法获取 API 监听地址');
  const port = address.port;

  return {
    host,
    port,
    baseUrl: `http://${host}:${port}`,
    hub,
    async close() {
      clearInterval(heartbeatTimer);
      hub.closeAll();
      await new Promise<void>((resolve, reject) => {
        wss.close(() => {
          server.close((err) => (err ? reject(err) : resolve()));
        });
      });
    },
  };
}




