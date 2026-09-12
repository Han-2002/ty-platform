import { join } from 'node:path';
import { loadSeatsConfig } from '../src/config/load.js';
import { Organization } from '../src/org/organization.js';
import { UserSeatManager } from '../src/identity/userSeatManager.js';
import { PersistentIdentityService } from '../src/identity/persistentIdentityService.js';
import { PostgresDatabase } from '../src/persistence/postgres.js';
import { PostgresRepositories } from '../src/persistence/postgresRepositories.js';
import { PostgresAuthRepository } from '../src/auth/postgresAuthRepository.js';
import { AuthService } from '../src/auth/authService.js';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://ty_platform:ty_platform_dev@localhost:5432/ty_platform';

const password = process.env.TY_ADMIN_PASSWORD;
if (!password) {
  throw new Error(
    '请先设置 TY_ADMIN_PASSWORD，例如：$env:TY_ADMIN_PASSWORD="ChangeMe123!"',
  );
}

const seatsCfg = loadSeatsConfig(join(process.cwd(), 'config', 'seats.yaml'));
const org = new Organization(seatsCfg);
const approvalSeat = org.allSeats().find((s) => s.can_approve);
const activity = org.allActivities()[0];

if (!approvalSeat) throw new Error('配置中不存在 can_approve=true 的审批席位');
if (!activity) throw new Error('配置中不存在活动');

const db = new PostgresDatabase({ connectionString: databaseUrl });

try {
  const repos = new PostgresRepositories(db.pool);
  const identities = new UserSeatManager(org);
  const persistent = new PersistentIdentityService(identities, repos);
  await persistent.hydrate();

  const occupied = identities
    .assignmentsForActivity(activity.id)
    .find((a) => a.active && a.seatId === approvalSeat.id);

  let userId: string;

  if (occupied) {
    userId = occupied.userId;
  } else {
    userId = process.env.TY_ADMIN_USER ?? 'admin';
    if (!identities.allUsers().some((u) => u.id === userId)) {
      await persistent.createUser(userId, '系统管理员');
    }
    await persistent.assign(approvalSeat.id, userId, approvalSeat.id, activity.id);
  }

  const auth = new AuthService(new PostgresAuthRepository(db.pool));
  await auth.setPassword(userId, password);

  console.log('Bootstrap account ready.');
  console.log(`userId: ${userId}`);
  console.log(`seatId: ${approvalSeat.id}`);
  console.log(`activityId: ${activity.id}`);
  console.log('password: 已设置（不回显）');
} finally {
  await db.close();
}
