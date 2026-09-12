import type { UserSeatManager, UserProfile, SeatAssignment } from './userSeatManager.js';
import type { PostgresRepositories } from '../persistence/postgresRepositories.js';

// Identity 持久化应用服务：
// - Domain Manager 继续负责同步业务规则。
// - Application Service 负责把成功命令可靠写入 PostgreSQL。
// - 启动时从 PostgreSQL hydrate 回内存。
// 后续 HTTP API 只调用此 Service，避免直接绕过持久化。
export class PersistentIdentityService {
  constructor(
    private readonly manager: UserSeatManager,
    private readonly repos: PostgresRepositories,
  ) {}

  async hydrate(): Promise<void> {
    const [users, assignments] = await Promise.all([
      this.repos.listUsers(),
      this.repos.listSeatAssignments(),
    ]);

    this.manager.clearForRestore();
    for (const user of users) this.manager.restoreUser(user);
    for (const assignment of assignments) this.manager.restoreAssignment(assignment);
  }

  async createUser(id: string, name: string): Promise<UserProfile> {
    const user = this.manager.createUser(id, name);
    try {
      await this.repos.saveUser(user);
      return user;
    } catch (error) {
      // DB 写入失败时，重新 hydrate，避免内存状态比数据库超前。
      await this.hydrate();
      throw error;
    }
  }

  async disableUser(userId: string): Promise<UserProfile> {
    const user = this.manager.disableUser(userId);
    try {
      await this.repos.saveUser(user);
      return user;
    } catch (error) {
      await this.hydrate();
      throw error;
    }
  }

  async assign(
    bySeatId: string,
    userId: string,
    seatId: string,
    activityId: string,
  ): Promise<SeatAssignment> {
    const assignment = this.manager.assign(bySeatId, userId, seatId, activityId);
    try {
      await this.repos.saveSeatAssignment(assignment);
      return assignment;
    } catch (error) {
      await this.hydrate();
      throw error;
    }
  }

  async release(bySeatId: string, assignmentId: string): Promise<SeatAssignment> {
    const assignment = this.manager.release(bySeatId, assignmentId);
    try {
      await this.repos.saveSeatAssignment(assignment);
      return assignment;
    } catch (error) {
      await this.hydrate();
      throw error;
    }
  }
}
