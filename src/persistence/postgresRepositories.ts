import type { Pool, PoolClient } from 'pg';
import type { UserProfile, SeatAssignment } from '../identity/userSeatManager.js';
import type { ActivityTemplate, ActivityTemplateBinding } from '../activity/activityTemplateManager.js';
import type { TaskGroup, Task } from '../types.js';
import type { WorkflowInstance, WorkflowChangeProposal, WorkflowChange } from '../workflow/workflowManager.js';
import type { TemporaryGrant } from '../permission/permissionEngine.js';
import type { VersionedPlan, EvaluationRun } from '../plan/planLifecycle.js';
import type { AuditRecord } from '../audit/auditTrail.js';
import type { PlanRunResult } from '../sim/simulation.js';

type Queryable = Pool | PoolClient;

export class PostgresRepositories {
  constructor(private readonly db: Queryable) {}

  async saveUser(user: UserProfile): Promise<void> {
    await this.db.query(
      `INSERT INTO users(id,name,status,created_at)
       VALUES($1,$2,$3,$4)
       ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,status=EXCLUDED.status`,
      [user.id, user.name, user.status, user.createdAt],
    );
  }

  async getUser(id: string): Promise<UserProfile | undefined> {
    const { rows } = await this.db.query(`SELECT id,name,status,created_at FROM users WHERE id=$1`, [id]);
    const r = rows[0];
    return r ? { id:r.id, name:r.name, status:r.status, createdAt:Number(r.created_at) } : undefined;
  }

  async listUsers(): Promise<UserProfile[]> {
    const { rows } = await this.db.query(`SELECT id,name,status,created_at FROM users ORDER BY created_at,id`);
    return rows.map((r) => ({ id:r.id, name:r.name, status:r.status, createdAt:Number(r.created_at) }));
  }

  async saveSeatAssignment(a: SeatAssignment): Promise<void> {
    await this.db.query(
      `INSERT INTO seat_assignments(
         id,user_id,seat_id,activity_id,active,assigned_at,released_at,assigned_by_seat_id
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT(id) DO UPDATE SET active=EXCLUDED.active,released_at=EXCLUDED.released_at`,
      [a.id,a.userId,a.seatId,a.activityId,a.active,a.assignedAt,a.releasedAt ?? null,a.assignedBySeatId],
    );
  }

  async listSeatAssignments(): Promise<SeatAssignment[]> {
    const { rows } = await this.db.query(
      `SELECT id,user_id,seat_id,activity_id,active,assigned_at,released_at,assigned_by_seat_id
       FROM seat_assignments ORDER BY assigned_at,id`,
    );
    return rows.map((r) => ({
      id:r.id,userId:r.user_id,seatId:r.seat_id,activityId:r.activity_id,active:r.active,
      assignedAt:Number(r.assigned_at),
      releasedAt:r.released_at == null ? undefined : Number(r.released_at),
      assignedBySeatId:r.assigned_by_seat_id,
    }));
  }

  async saveActivityTemplate(t: ActivityTemplate): Promise<void> {
    await this.db.query(
      `INSERT INTO activity_templates(
         id,name,phases,hierarchical_workflow,peer_workflow,require_final_human_approval
       ) VALUES($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6)
       ON CONFLICT(id) DO UPDATE SET
         name=EXCLUDED.name,phases=EXCLUDED.phases,
         hierarchical_workflow=EXCLUDED.hierarchical_workflow,
         peer_workflow=EXCLUDED.peer_workflow,
         require_final_human_approval=EXCLUDED.require_final_human_approval`,
      [t.id,t.name,JSON.stringify(t.phases),JSON.stringify(t.hierarchicalWorkflow),
       JSON.stringify(t.peerWorkflow),t.requireFinalHumanApproval],
    );
  }

  async saveActivityBinding(b: ActivityTemplateBinding): Promise<void> {
    await this.db.query(
      `INSERT INTO activity_template_bindings(activity_id,template_id,current_phase,bound_at,bound_by_seat_id)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(activity_id) DO UPDATE SET template_id=EXCLUDED.template_id,current_phase=EXCLUDED.current_phase`,
      [b.activityId,b.templateId,b.currentPhase,b.boundAt,b.boundBySeatId],
    );
  }

  async saveTaskGroup(group: TaskGroup): Promise<void> {
    const client = 'connect' in this.db ? await (this.db as Pool).connect() : this.db as PoolClient;
    const owned = 'connect' in this.db;
    try {
      if (owned) await client.query('BEGIN');
      await client.query(
        `INSERT INTO task_groups(id,activity_id,name,mode,leader_seat_id,peer_decision_mode,status,created_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT(id) DO UPDATE SET
           name=EXCLUDED.name,leader_seat_id=EXCLUDED.leader_seat_id,
           peer_decision_mode=EXCLUDED.peer_decision_mode,status=EXCLUDED.status`,
        [group.id,group.activityId,group.name,group.mode,group.leaderSeatId ?? null,
         group.peerDecisionMode ?? null,group.status,group.createdAt],
      );
      await client.query(`DELETE FROM task_group_members WHERE group_id=$1`, [group.id]);
      for (const seatId of group.memberSeatIds) {
        await client.query(`INSERT INTO task_group_members(group_id,seat_id) VALUES($1,$2)`, [group.id,seatId]);
      }
      if (owned) await client.query('COMMIT');
    } catch (error) {
      if (owned) await client.query('ROLLBACK');
      throw error;
    } finally {
      if (owned && 'release' in client) client.release();
    }
  }

  async listTaskGroups(activityId?: string): Promise<TaskGroup[]> {
    const params: unknown[] = [];
    let where = '';
    if (activityId) {
      params.push(activityId);
      where = `WHERE g.activity_id=$1`;
    }
    const { rows } = await this.db.query(
      `SELECT g.id,g.activity_id,g.name,g.mode,g.leader_seat_id,g.peer_decision_mode,g.status,g.created_at,
              COALESCE(array_agg(m.seat_id ORDER BY m.seat_id) FILTER (WHERE m.seat_id IS NOT NULL), '{}') AS members
       FROM task_groups g
       LEFT JOIN task_group_members m ON m.group_id=g.id
       ${where}
       GROUP BY g.id
       ORDER BY g.created_at,g.id`,
      params,
    );
    return rows.map((r) => ({
      id:r.id, activityId:r.activity_id, name:r.name, mode:r.mode,
      memberSeatIds:r.members,
      leaderSeatId:r.leader_seat_id ?? undefined,
      peerDecisionMode:r.peer_decision_mode ?? undefined,
      status:r.status,
      createdAt:Number(r.created_at),
    }));
  }

  async saveTask(task: Task): Promise<void> {
    await this.db.query(
      `INSERT INTO tasks(
        id,activity_id,title,required_skills,required_clearance,assigned_seat_id,group_id,status,output_json
      ) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9::jsonb)
      ON CONFLICT(id) DO UPDATE SET
        assigned_seat_id=EXCLUDED.assigned_seat_id,group_id=EXCLUDED.group_id,
        status=EXCLUDED.status,output_json=EXCLUDED.output_json`,
      [task.id,task.activityId,task.title,JSON.stringify(task.requiredSkills),task.requiredClearance,
       task.assignedSeatId ?? null,task.groupId ?? null,task.status,task.output ? JSON.stringify(task.output) : null],
    );
  }

  async saveWorkflow(workflow: WorkflowInstance): Promise<void> {
    const client = 'connect' in this.db ? await (this.db as Pool).connect() : this.db as PoolClient;
    const owned = 'connect' in this.db;
    try {
      if (owned) await client.query('BEGIN');
      await client.query(
        `INSERT INTO workflow_instances(id,group_id,activity_id,template,status,created_at,updated_at)
         VALUES($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,updated_at=EXCLUDED.updated_at`,
        [workflow.id,workflow.groupId,workflow.activityId,workflow.template,workflow.status,
         workflow.createdAt,workflow.updatedAt],
      );
      await client.query(`DELETE FROM workflow_steps WHERE workflow_id=$1`, [workflow.id]);
      for (const [index, s] of workflow.steps.entries()) {
        await client.query(
          `INSERT INTO workflow_steps(id,workflow_id,step_order,step_key,name,actor_rule,status)
           VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [s.id,workflow.id,index,s.key,s.name,s.actorRule,s.status],
        );
      }
      if (owned) await client.query('COMMIT');
    } catch (error) {
      if (owned) await client.query('ROLLBACK');
      throw error;
    } finally {
      if (owned && 'release' in client) client.release();
    }
  }

  async listWorkflows(activityId?: string): Promise<WorkflowInstance[]> {
    const params: unknown[] = [];
    let where = '';
    if (activityId) {
      params.push(activityId);
      where = `WHERE w.activity_id=$1`;
    }
    const { rows } = await this.db.query(
      `SELECT w.id,w.group_id,w.activity_id,w.template,w.status,w.created_at,w.updated_at,
              COALESCE(
                jsonb_agg(
                  jsonb_build_object(
                    'id',s.id,'key',s.step_key,'name',s.name,'actorRule',s.actor_rule,'status',s.status
                  ) ORDER BY s.step_order
                ) FILTER (WHERE s.id IS NOT NULL),
                '[]'::jsonb
              ) AS steps
       FROM workflow_instances w
       LEFT JOIN workflow_steps s ON s.workflow_id=w.id
       ${where}
       GROUP BY w.id
       ORDER BY w.created_at,w.id`,
      params,
    );
    return rows.map((r) => ({
      id:r.id, groupId:r.group_id, activityId:r.activity_id, template:r.template,
      status:r.status, steps:r.steps, createdAt:Number(r.created_at), updatedAt:Number(r.updated_at),
    }));
  }

  async saveWorkflowProposal(p: WorkflowChangeProposal): Promise<void> {
    await this.db.query(
      `INSERT INTO workflow_change_proposals(
        id,workflow_id,proposed_by_seat_id,reason,change_json,status,created_at,decided_at,decided_by_seat_id
      ) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9)
      ON CONFLICT(id) DO UPDATE SET
        change_json=EXCLUDED.change_json,status=EXCLUDED.status,
        decided_at=EXCLUDED.decided_at,decided_by_seat_id=EXCLUDED.decided_by_seat_id`,
      [p.id,p.workflowId,p.proposedBySeatId,p.reason,JSON.stringify(p.change),p.status,p.createdAt,
       p.decidedAt ?? null,p.decidedBySeatId ?? null],
    );
  }

  async listWorkflowProposals(activityId?: string): Promise<WorkflowChangeProposal[]> {
    const params: unknown[] = [];
    let where = '';
    if (activityId) {
      params.push(activityId);
      where = `WHERE w.activity_id=$1`;
    }
    const { rows } = await this.db.query(
      `SELECT p.id,p.workflow_id,p.proposed_by_seat_id,p.reason,p.change_json,p.status,
              p.created_at,p.decided_at,p.decided_by_seat_id
       FROM workflow_change_proposals p
       JOIN workflow_instances w ON w.id=p.workflow_id
       ${where}
       ORDER BY p.created_at,p.id`,
      params,
    );
    return rows.map((r) => ({
      id:r.id, workflowId:r.workflow_id, proposedBySeatId:r.proposed_by_seat_id,
      reason:r.reason, change:r.change_json as WorkflowChange, status:r.status,
      createdAt:Number(r.created_at),
      decidedAt:r.decided_at == null ? undefined : Number(r.decided_at),
      decidedBySeatId:r.decided_by_seat_id ?? undefined,
    }));
  }

  async saveTemporaryGrant(g: TemporaryGrant): Promise<void> {
    await this.db.query(
      `INSERT INTO temporary_grants(
        id,user_id,seat_id,activity_id,action,resource_id,target_group_id,
        issued_by_seat_id,issued_at,expires_at,revoked_at,reason
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT(id) DO UPDATE SET revoked_at=EXCLUDED.revoked_at`,
      [g.id,g.userId,g.seatId,g.activityId,g.action,g.resourceId ?? null,g.targetGroupId ?? null,
       g.issuedBySeatId,g.issuedAt,g.expiresAt,g.revokedAt ?? null,g.reason],
    );
  }

  async savePlanVersion(v: VersionedPlan): Promise<void> {
    await this.db.query(
      `INSERT INTO plan_versions(
        id,logical_plan_id,activity_id,group_id,version,name,content,
        submitted_by_seat_id,parent_version_id,status,created_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status`,
      [v.id,v.logicalPlanId,v.activityId,v.groupId,v.version,v.name,v.content,v.submittedBySeatId,
       v.parentVersionId ?? null,v.status,v.createdAt],
    );
  }

  async saveEvaluationRun(run: EvaluationRun, results: PlanRunResult[] = []): Promise<void> {
    await this.db.query(
      `INSERT INTO evaluation_runs(
        id,activity_id,recommended_plan_version_id,selected_plan_version_id,
        created_at,confirmed_at,dispatched_at,selection_reason
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(id) DO UPDATE SET
        recommended_plan_version_id=EXCLUDED.recommended_plan_version_id,
        selected_plan_version_id=EXCLUDED.selected_plan_version_id,
        confirmed_at=EXCLUDED.confirmed_at,dispatched_at=EXCLUDED.dispatched_at,
        selection_reason=EXCLUDED.selection_reason`,
      [run.id,run.activityId,run.recommendedPlanVersionId ?? null,run.selectedPlanVersionId ?? null,
       run.createdAt,run.confirmedAt ?? null,run.dispatchedAt ?? null,run.selectionReason ?? null],
    );

    const byPlanId = new Map(results.map((r) => [r.plan.plan_id, r]));
    for (const versionId of run.planVersionIds) {
      const result = byPlanId.get(versionId);
      await this.db.query(
        `INSERT INTO evaluation_run_plans(
           evaluation_run_id,plan_version_id,weighted_score,rank,result_json
         ) VALUES($1,$2,$3,$4,$5::jsonb)
         ON CONFLICT(evaluation_run_id,plan_version_id) DO UPDATE SET
           weighted_score=COALESCE(EXCLUDED.weighted_score,evaluation_run_plans.weighted_score),
           rank=COALESCE(EXCLUDED.rank,evaluation_run_plans.rank),
           result_json=COALESCE(EXCLUDED.result_json,evaluation_run_plans.result_json)`,
        [
          run.id,
          versionId,
          result?.weightedScore ?? null,
          result?.rank ?? null,
          result ? JSON.stringify({ outcomes: result.outcomes }) : null,
        ],
      );
    }
  }

  async saveAuditRecord(r: AuditRecord): Promise<void> {
    await this.db.query(
      `INSERT INTO audit_records(
        id,at,sequence,prev_hash,hash,activity_id,user_id,seat_id,
        actor_type,action,target_type,target_id,result,reason,metadata
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
      ON CONFLICT(id) DO NOTHING`,
      [r.id,r.at,r.sequence,r.prevHash,r.hash,r.activityId ?? null,r.userId ?? null,r.seatId ?? null,
       r.actorType,r.action,r.targetType ?? null,r.targetId ?? null,r.result,r.reason ?? null,
       r.metadata ? JSON.stringify(r.metadata) : null],
    );
  }

  async listTemporaryGrants(activityId?: string): Promise<TemporaryGrant[]> {
    const params: unknown[] = [];
    let where = '';
    if (activityId) {
      params.push(activityId);
      where = `WHERE activity_id=$1`;
    }
    const { rows } = await this.db.query(
      `SELECT id,user_id,seat_id,activity_id,action,resource_id,target_group_id,
              issued_by_seat_id,issued_at,expires_at,revoked_at,reason
       FROM temporary_grants
       ${where}
       ORDER BY issued_at,id`,
      params,
    );
    return rows.map((r) => ({
      id:r.id,
      userId:r.user_id,
      seatId:r.seat_id,
      activityId:r.activity_id,
      action:r.action,
      resourceId:r.resource_id ?? undefined,
      targetGroupId:r.target_group_id ?? undefined,
      issuedBySeatId:r.issued_by_seat_id,
      issuedAt:Number(r.issued_at),
      expiresAt:Number(r.expires_at),
      revokedAt:r.revoked_at == null ? undefined : Number(r.revoked_at),
      reason:r.reason,
    }));
  }

  async listPlanVersions(activityId?: string): Promise<VersionedPlan[]> {
    const params: unknown[] = [];
    let where = '';
    if (activityId) {
      params.push(activityId);
      where = `WHERE activity_id=$1`;
    }
    const { rows } = await this.db.query(
      `SELECT id,logical_plan_id,activity_id,group_id,version,name,content,
              submitted_by_seat_id,parent_version_id,status,created_at
       FROM plan_versions
       ${where}
       ORDER BY created_at,id`,
      params,
    );
    return rows.map((r) => ({
      id:r.id,
      logicalPlanId:r.logical_plan_id,
      activityId:r.activity_id,
      groupId:r.group_id,
      version:r.version,
      name:r.name,
      content:r.content,
      submittedBySeatId:r.submitted_by_seat_id,
      parentVersionId:r.parent_version_id ?? undefined,
      status:r.status,
      createdAt:Number(r.created_at),
    }));
  }

  async listEvaluationRuns(activityId?: string): Promise<Array<{ run: EvaluationRun; results: PlanRunResult[] }>> {
    const params: unknown[] = [];
    let where = '';
    if (activityId) {
      params.push(activityId);
      where = `WHERE e.activity_id=$1`;
    }
    const { rows } = await this.db.query(
      `SELECT e.id,e.activity_id,e.recommended_plan_version_id,e.selected_plan_version_id,
              e.created_at,e.confirmed_at,e.dispatched_at,e.selection_reason,
              p.id AS plan_id,p.name AS plan_name,p.content AS plan_content,
              p.submitted_by_seat_id,p.group_id,
              erp.weighted_score,erp.rank,erp.result_json
       FROM evaluation_runs e
       JOIN evaluation_run_plans erp ON erp.evaluation_run_id=e.id
       JOIN plan_versions p ON p.id=erp.plan_version_id
       ${where}
       ORDER BY e.created_at,e.id,erp.rank NULLS LAST,p.id`,
      params,
    );

    const grouped = new Map<string, { run: EvaluationRun; results: PlanRunResult[] }>();
    for (const r of rows) {
      let item = grouped.get(r.id);
      if (!item) {
        item = {
          run: {
            id:r.id,
            activityId:r.activity_id,
            planVersionIds:[],
            recommendedPlanVersionId:r.recommended_plan_version_id ?? undefined,
            selectedPlanVersionId:r.selected_plan_version_id ?? undefined,
            createdAt:Number(r.created_at),
            confirmedAt:r.confirmed_at == null ? undefined : Number(r.confirmed_at),
            dispatchedAt:r.dispatched_at == null ? undefined : Number(r.dispatched_at),
            selectionReason:r.selection_reason ?? undefined,
          },
          results:[],
        };
        grouped.set(r.id, item);
      }
      item.run.planVersionIds.push(r.plan_id);
      const payload = r.result_json ?? {};
      item.results.push({
        plan: {
          plan_id:r.plan_id,
          plan_name:r.plan_name,
          plan_content:r.plan_content,
          seatId:r.submitted_by_seat_id,
          groupId:r.group_id,
        },
        outcomes:Array.isArray(payload.outcomes) ? payload.outcomes : [],
        weightedScore:r.weighted_score == null ? 0 : Number(r.weighted_score),
        rank:r.rank == null ? undefined : r.rank,
      });
    }
    return [...grouped.values()];
  }

  async listAuditRecords(): Promise<AuditRecord[]> {
    const { rows } = await this.db.query(
      `SELECT id,at,sequence,prev_hash,hash,activity_id,user_id,seat_id,
              actor_type,action,target_type,target_id,result,reason,metadata
       FROM audit_records
       ORDER BY sequence`,
    );

    return rows.map((r) => {
      // 重要：不要把数据库 NULL 还原成显式 `undefined` 字段。
      // AuditTrail 的 hash 是基于“实际存在的字段”计算的；
      // 若恢复时人为增加 { userId: undefined } 之类字段，
      // canonical hash 输入就会变化，导致合法审计链被误判为篡改。
      const record: AuditRecord = {
        id: r.id,
        at: Number(r.at),
        sequence: Number(r.sequence),
        prevHash: r.prev_hash,
        hash: r.hash,
        actorType: r.actor_type,
        action: r.action,
        result: r.result,
      };

      if (r.activity_id !== null) record.activityId = r.activity_id;
      if (r.user_id !== null) record.userId = r.user_id;
      if (r.seat_id !== null) record.seatId = r.seat_id;
      if (r.target_type !== null) record.targetType = r.target_type;
      if (r.target_id !== null) record.targetId = r.target_id;
      if (r.reason !== null) record.reason = r.reason;
      if (r.metadata !== null) record.metadata = r.metadata;

      return record;
    });
  }

}
