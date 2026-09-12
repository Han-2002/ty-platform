BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','disabled')),
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS seat_assignments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  seat_id TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  active BOOLEAN NOT NULL,
  assigned_at BIGINT NOT NULL,
  released_at BIGINT,
  assigned_by_seat_id TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_seat_assignment
ON seat_assignments(activity_id, seat_id)
WHERE active = TRUE;

CREATE TABLE IF NOT EXISTS activity_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phases JSONB NOT NULL,
  hierarchical_workflow JSONB NOT NULL,
  peer_workflow JSONB NOT NULL,
  require_final_human_approval BOOLEAN NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_template_bindings (
  activity_id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES activity_templates(id),
  current_phase TEXT NOT NULL,
  bound_at BIGINT NOT NULL,
  bound_by_seat_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_groups (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('hierarchical','peer')),
  leader_seat_id TEXT,
  peer_decision_mode TEXT,
  status TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_group_members (
  group_id TEXT NOT NULL REFERENCES task_groups(id) ON DELETE CASCADE,
  seat_id TEXT NOT NULL,
  PRIMARY KEY (group_id, seat_id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL,
  title TEXT NOT NULL,
  required_skills JSONB NOT NULL,
  required_clearance INTEGER NOT NULL,
  assigned_seat_id TEXT,
  group_id TEXT REFERENCES task_groups(id),
  status TEXT NOT NULL,
  output_json JSONB
);

CREATE TABLE IF NOT EXISTS workflow_instances (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES task_groups(id),
  activity_id TEXT NOT NULL,
  template TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_steps (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  step_key TEXT NOT NULL,
  name TEXT NOT NULL,
  actor_rule TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_workflow_step_order
ON workflow_steps(workflow_id, step_order);

CREATE TABLE IF NOT EXISTS workflow_change_proposals (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  proposed_by_seat_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  change_json JSONB NOT NULL,
  status TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  decided_at BIGINT,
  decided_by_seat_id TEXT
);

CREATE TABLE IF NOT EXISTS temporary_grants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  seat_id TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_id TEXT,
  target_group_id TEXT,
  issued_by_seat_id TEXT NOT NULL,
  issued_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  revoked_at BIGINT,
  reason TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_active_grants
ON temporary_grants(user_id, seat_id, activity_id, action, expires_at);

CREATE TABLE IF NOT EXISTS plan_versions (
  id TEXT PRIMARY KEY,
  logical_plan_id TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  submitted_by_seat_id TEXT NOT NULL,
  parent_version_id TEXT REFERENCES plan_versions(id),
  status TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE(logical_plan_id, version)
);

CREATE TABLE IF NOT EXISTS evaluation_runs (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL,
  recommended_plan_version_id TEXT REFERENCES plan_versions(id),
  selected_plan_version_id TEXT REFERENCES plan_versions(id),
  created_at BIGINT NOT NULL,
  confirmed_at BIGINT,
  dispatched_at BIGINT,
  selection_reason TEXT
);

CREATE TABLE IF NOT EXISTS evaluation_run_plans (
  evaluation_run_id TEXT NOT NULL REFERENCES evaluation_runs(id) ON DELETE CASCADE,
  plan_version_id TEXT NOT NULL REFERENCES plan_versions(id),
  weighted_score DOUBLE PRECISION,
  rank INTEGER,
  result_json JSONB,
  PRIMARY KEY (evaluation_run_id, plan_version_id)
);

CREATE TABLE IF NOT EXISTS audit_records (
  id TEXT PRIMARY KEY,
  at BIGINT NOT NULL,
  sequence BIGINT NOT NULL UNIQUE,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL,
  activity_id TEXT,
  user_id TEXT,
  seat_id TEXT,
  actor_type TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  result TEXT NOT NULL,
  reason TEXT,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_audit_activity_time
ON audit_records(activity_id, at);

CREATE INDEX IF NOT EXISTS idx_audit_actor_time
ON audit_records(user_id, seat_id, at);

COMMIT;
