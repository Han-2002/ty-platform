import type { Pool, PoolClient } from 'pg';
import type { UserProfile, SeatAssignment } from '../identity/userSeatManager.js';
import type { ActivityTemplate, ActivityTemplateBinding } from '../activity/activityTemplateManager.js';
import type { TaskGroup, Task } from '../types.js';
import type { WorkflowInstance, WorkflowChangeProposal } from '../workflow/workflowManager.js';
import type { TemporaryGrant } from '../permission/permissionEngine.js';
import type { VersionedPlan, EvaluationRun } from '../plan/planLifecycle.js';
import type { AuditRecord } from '../audit/auditTrail.js';

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
    const { rows } = await this.db.query(
      `SELECT id,name,status,created_at FROM users WHERE id=$1`,
      [id],
    );
    const r = rows[0];
    return r
      ? { id: r.id, name: r.name, status: r.status, createdAt: Number(r.created_at) }
      : undefined;
  }

  async listUsers(): Promise<UserProfile[]> {
    const { rows } = await this.db.query(
      `SELECT id,name,status,created_at FROM users ORDER BY created_at,id`,
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      createdAt: Number(r.created_at),
    }));
  }

  async saveSeatAssignment(a: SeatAssignment): Promise<void> {
    await this.db.query(
      `INSERT INTO seat_assignments(
         id,user_id,seat_id,activity_id,active,assigned_at,released_at,assigned_by_seat_id
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT(id) DO UPDATE SET
         active=EXCLUDED.active,
         released_at=EXCLUDED.released_at`,
      [a.id, a.userId, a.seatId, a.activityId, a.active, a.assignedAt, a.releasedAt ?? null, a.assignedBySeatId],
    );
  }

  async listSeatAssignments(): Promise<SeatAssignment[]> {
    const { rows } = await this.db.query(
      `SELECT id,user_id,seat_id,activity_id,active,assigned_at,released_at,assigned_by_seat_id
       FROM seat_assignments
       ORDER BY assigned_at,id`,
    );
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      seatId: r.seat_id,
      activityId: r.activity_id,
      active: r.active,
      assignedAt: Number(r.assigned_at),
      releasedAt: r.released_at == null ? undefined : Number(r.released_at),
      assignedBySeatId: r.assigned_by_seat_id,
    }));
  }

  async saveActivityTemplate(t: ActivityTemplate): Promise<void> {
    await this.db.query(
      `INSERT INTO activity_templates(
         id,name,phases,hierarchical_workflow,peer_workflow,require_final_human_approval
       ) VALUES($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6)
       ON CONFLICT(id) DO UPDATE SET
         name=EXCLUDED.name,
         phases=EXCLUDED.phases,
         hierarchical_workflow=EXCLUDED.hierarchical_workflow,
         peer_workflow=EXCLUDED.peer_workflow,
         require_final_human_approval=EXCLUDED.require_final_human_approval`,
      [
        t.id,
        t.name,
        JSON.stringify(t.phases),
        JSON.stringify(t.hierarchicalWorkflow),
        JSON.stringify(t.peerWorkflow),
        t.requireFinalHumanApproval,
      ],
    );
  }

  async saveActivityBinding(b: ActivityTemplateBinding): Promise<void> {
    await this.db.query(
      `INSERT INTO activity_template_bindings(activity_id,template_id,current_phase,bound_at,bound_by_seat_id)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(activity_id) DO UPDATE SET
         template_id=EXCLUDED.template_id,
         current_phase=EXCLUDED.current_phase`,
      [b.activityId, b.templateId, b.currentPhase, b.boundAt, b.boundBySeatId],
    );
  }

  async saveTaskGroup(group: TaskGroup): Promise<void> {
    const client = 'connect' in this.db ? await (this.db as Pool).connect() : this.db as PoolClient;
    const owned = 'connect' in this.db;
    try {
      if (owned) await client.query('BEGIN');

      await client.query(
        `INSERT INTO task_groups(
          id,activity_id,name,mode,leader_seat_id,peer_decision_mode,status,created_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT(id) DO UPDATE SET
          name=EXCLUDED.name,
          leader_seat_id=EXCLUDED.leader_seat_id,
          peer_decision_mode=EXCLUDED.peer_decision_mode,
          status=EXCLUDED.status`,
        [
          group.id,
          group.activityId,
          group.name,
          group.mode,
          group.leaderSeatId ?? null,
          group.peerDecisionMode ?? null,
          group.status,
          group.createdAt,
        ],
      );

      await client.query(`DELETE FROM task_group_members WHERE group_id=$1`, [group.id]);
      for (const seatId of group.memberSeatIds) {
        await client.query(
          `INSERT INTO task_group_members(group_id,seat_id) VALUES($1,$2)`,
          [group.id, seatId],
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

  async saveTask(task: Task): Promise<void> {
    await this.db.query(
      `INSERT INTO tasks(
        id,activity_id,title,required_skills,required_clearance,assigned_seat_id,group_id,status,output_json
      ) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9::jsonb)
      ON CONFLICT(id) DO UPDATE SET
        assigned_seat_id=EXCLUDED.assigned_seat_id,
        group_id=EXCLUDED.group_id,
        status=EXCLUDED.status,
        output_json=EXCLUDED.output_json`,
      [
        task.id,
        task.activityId,
        task.title,
        JSON.stringify(task.requiredSkills),
        task.requiredClearance,
        task.assignedSeatId ?? null,
        task.groupId ?? null,
        task.status,
        task.output ? JSON.stringify(task.output) : null,
      ],
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
        [
          workflow.id,
          workflow.groupId,
          workflow.activityId,
          workflow.template,
          workflow.status,
          workflow.createdAt,
          workflow.updatedAt,
        ],
      );

      await client.query(`DELETE FROM workflow_steps WHERE workflow_id=$1`, [workflow.id]);
      for (const [index, step] of workflow.steps.entries()) {
        await client.query(
          `INSERT INTO workflow_steps(id,workflow_id,step_order,step_key,name,actor_rule,status)
           VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [step.id, workflow.id, index, step.key, step.name, step.actorRule, step.status],
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

  async saveWorkflowProposal(p: WorkflowChangeProposal): Promise<void> {
    await this.db.query(
      `INSERT INTO workflow_change_proposals(
        id,workflow_id,proposed_by_seat_id,reason,change_json,status,created_at,decided_at,decided_by_seat_id
      ) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9)
      ON CONFLICT(id) DO UPDATE SET
        status=EXCLUDED.status,
        decided_at=EXCLUDED.decided_at,
        decided_by_seat_id=EXCLUDED.decided_by_seat_id`,
      [
        p.id,
        p.workflowId,
        p.proposedBySeatId,
        p.reason,
        JSON.stringify(p.change),
        p.status,
        p.createdAt,
        p.decidedAt ?? null,
        p.decidedBySeatId ?? null,
      ],
    );
  }

  async saveTemporaryGrant(g: TemporaryGrant): Promise<void> {
    await this.db.query(
      `INSERT INTO temporary_grants(
        id,user_id,seat_id,activity_id,action,resource_id,target_group_id,
        issued_by_seat_id,issued_at,expires_at,revoked_at,reason
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT(id) DO UPDATE SET revoked_at=EXCLUDED.revoked_at`,
      [
        g.id,
        g.userId,
        g.seatId,
        g.activityId,
        g.action,
        g.resourceId ?? null,
        g.targetGroupId ?? null,
        g.issuedBySeatId,
        g.issuedAt,
        g.expiresAt,
        g.revokedAt ?? null,
        g.reason,
      ],
    );
  }

  async savePlanVersion(v: VersionedPlan): Promise<void> {
    await this.db.query(
      `INSERT INTO plan_versions(
        id,logical_plan_id,activity_id,group_id,version,name,content,
        submitted_by_seat_id,parent_version_id,status,created_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status`,
      [
        v.id,
        v.logicalPlanId,
        v.activityId,
        v.groupId,
        v.version,
        v.name,
        v.content,
        v.submittedBySeatId,
        v.parentVersionId ?? null,
        v.status,
        v.createdAt,
      ],
    );
  }

  async saveEvaluationRun(run: EvaluationRun): Promise<void> {
    await this.db.query(
      `INSERT INTO evaluation_runs(
        id,activity_id,recommended_plan_version_id,selected_plan_version_id,
        created_at,confirmed_at,dispatched_at,selection_reason
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(id) DO UPDATE SET
        recommended_plan_version_id=EXCLUDED.recommended_plan_version_id,
        selected_plan_version_id=EXCLUDED.selected_plan_version_id,
        confirmed_at=EXCLUDED.confirmed_at,
        dispatched_at=EXCLUDED.dispatched_at,
        selection_reason=EXCLUDED.selection_reason`,
      [
        run.id,
        run.activityId,
        run.recommendedPlanVersionId ?? null,
        run.selectedPlanVersionId ?? null,
        run.createdAt,
        run.confirmedAt ?? null,
        run.dispatchedAt ?? null,
        run.selectionReason ?? null,
      ],
    );

    await this.db.query(`DELETE FROM evaluation_run_plans WHERE evaluation_run_id=$1`, [run.id]);
    for (const versionId of run.planVersionIds) {
      await this.db.query(
        `INSERT INTO evaluation_run_plans(evaluation_run_id,plan_version_id)
         VALUES($1,$2)`,
        [run.id, versionId],
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
      [
        r.id,
        r.at,
        r.sequence,
        r.prevHash,
        r.hash,
        r.activityId ?? null,
        r.userId ?? null,
        r.seatId ?? null,
        r.actorType,
        r.action,
        r.targetType ?? null,
        r.targetId ?? null,
        r.result,
        r.reason ?? null,
        r.metadata ? JSON.stringify(r.metadata) : null,
      ],
    );
  }
}
