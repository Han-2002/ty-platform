import { join } from 'node:path';
import { loadSeatsConfig, loadSkillsConfig, loadSimulatorsConfig } from '../config/load.js';
import { Organization } from '../org/organization.js';
import { SkillRegistry } from '../skills/skillRegistry.js';
import { TaskManager } from '../task/taskManager.js';
import { TaskGroupManager } from '../task/taskGroupManager.js';
import { PersistentTaskGroupService } from '../task/persistentTaskGroupService.js';
import { WorkflowManager } from '../workflow/workflowManager.js';
import { PersistentWorkflowService } from '../workflow/persistentWorkflowService.js';
import { UserSeatManager } from '../identity/userSeatManager.js';
import { PersistentIdentityService } from '../identity/persistentIdentityService.js';
import { AuditTrail } from '../audit/auditTrail.js';
import { PersistentAuditService } from '../audit/persistentAuditService.js';
import { PermissionEngine } from '../permission/permissionEngine.js';
import { PersistentPermissionService } from '../permission/persistentPermissionService.js';
import { SimulationRunner, SimulationService } from '../sim/simulation.js';
import { PlanLifecycleService } from '../plan/planLifecycle.js';
import { PersistentPlanLifecycleService } from '../plan/persistentPlanLifecycleService.js';
import { PostgresDatabase } from '../persistence/postgres.js';
import { PostgresRepositories } from '../persistence/postgresRepositories.js';
import { PostgresAuthRepository } from '../auth/postgresAuthRepository.js';
import { AuthService } from '../auth/authService.js';
import { PersistentChatService } from '../collab/persistentChatService.js';

export interface ServerContext {
  rootDir: string;
  db: PostgresDatabase;
  repos: PostgresRepositories;
  authRepo: PostgresAuthRepository;
  auth: AuthService;
  chat: PersistentChatService;
  org: Organization;
  registry: SkillRegistry;
  taskManager: TaskManager;
  taskGroups: TaskGroupManager;
  persistentTaskGroups: PersistentTaskGroupService;
  workflows: WorkflowManager;
  persistentWorkflows: PersistentWorkflowService;
  identities: UserSeatManager;
  persistentIdentities: PersistentIdentityService;
  audit: AuditTrail;
  persistentAudit: PersistentAuditService;
  permissions: PermissionEngine;
  persistentPermissions: PersistentPermissionService;
  simulation: SimulationService;
  plans: PlanLifecycleService;
  persistentPlans: PersistentPlanLifecycleService;
}

export interface BuildContextOptions {
  rootDir?: string;
  databaseUrl?: string;
}

export async function buildServerContext(
  options: BuildContextOptions = {},
): Promise<ServerContext> {
  const rootDir = options.rootDir ?? process.cwd();
  const databaseUrl =
    options.databaseUrl ??
    process.env.DATABASE_URL ??
    'postgres://ty_platform:ty_platform_dev@localhost:5432/ty_platform';

  const configDir = join(rootDir, 'config');
  const skillsDir = join(rootDir, 'skills');

  const seatsCfg = loadSeatsConfig(join(configDir, 'seats.yaml'));
  const skillsCfg = loadSkillsConfig(join(configDir, 'skills.yaml'));
  const simulatorsCfg = loadSimulatorsConfig(join(configDir, 'simulators.yaml'));

  const org = new Organization(seatsCfg);
  const registry = SkillRegistry.fromSkillsDir(skillsDir, skillsCfg);
  const taskManager = new TaskManager(org, registry);
  const taskGroups = new TaskGroupManager(org, taskManager);
  const workflows = new WorkflowManager(org, taskGroups);
  const identities = new UserSeatManager(org);
  const audit = new AuditTrail();
  const permissions = new PermissionEngine(org, identities, audit);
  const simulation = new SimulationService(new SimulationRunner(simulatorsCfg.simulators));
  const plans = new PlanLifecycleService(simulation, permissions, audit);

  const db = new PostgresDatabase({ connectionString: databaseUrl, max: 20 });
  await db.ping();

  const repos = new PostgresRepositories(db.pool);
  const authRepo = new PostgresAuthRepository(db.pool);
  const auth = new AuthService(authRepo);
  const chat = new PersistentChatService(db.pool, org);

  const persistentIdentities = new PersistentIdentityService(identities, repos);
  const persistentTaskGroups = new PersistentTaskGroupService(taskGroups, repos);
  const persistentWorkflows = new PersistentWorkflowService(workflows, repos);
  const persistentPermissions = new PersistentPermissionService(permissions, repos);
  const persistentPlans = new PersistentPlanLifecycleService(plans, repos);
  const persistentAudit = new PersistentAuditService(audit, repos);

  await persistentIdentities.hydrate();
  await persistentTaskGroups.hydrate();
  await persistentWorkflows.hydrate();
  await persistentPermissions.hydrate();
  await persistentPlans.hydrate();
  await persistentAudit.hydrate();

  return {
    rootDir,
    db,
    repos,
    authRepo,
    auth,
    chat,
    org,
    registry,
    taskManager,
    taskGroups,
    persistentTaskGroups,
    workflows,
    persistentWorkflows,
    identities,
    persistentIdentities,
    audit,
    persistentAudit,
    permissions,
    persistentPermissions,
    simulation,
    plans,
    persistentPlans,
  };
}
