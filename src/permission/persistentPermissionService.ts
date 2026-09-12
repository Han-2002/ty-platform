import type { PermissionEngine, TemporaryGrant } from './permissionEngine.js';
import type { PostgresRepositories } from '../persistence/postgresRepositories.js';

export class PersistentPermissionService {
  constructor(
    private readonly engine: PermissionEngine,
    private readonly repos: PostgresRepositories,
  ) {}

  async hydrate(activityId?: string): Promise<void> {
    const grants = await this.repos.listTemporaryGrants(activityId);
    this.engine.clearGrantsForRestore();
    for (const grant of grants) this.engine.restoreGrant(grant);
  }

  async issueTemporaryGrant(
    bySeatId: string,
    grant: Omit<TemporaryGrant, 'id' | 'issuedBySeatId' | 'issuedAt' | 'revokedAt'>,
  ): Promise<TemporaryGrant> {
    const created = this.engine.issueTemporaryGrant(bySeatId, grant);
    try {
      await this.repos.saveTemporaryGrant(created);
      return created;
    } catch (error) {
      await this.hydrate(grant.activityId);
      throw error;
    }
  }

  async revokeTemporaryGrant(bySeatId: string, grantId: string): Promise<TemporaryGrant> {
    const grant = this.engine.revokeTemporaryGrant(bySeatId, grantId);
    try {
      await this.repos.saveTemporaryGrant(grant);
      return grant;
    } catch (error) {
      await this.hydrate(grant.activityId);
      throw error;
    }
  }
}
