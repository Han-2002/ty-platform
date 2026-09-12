import type { AuditTrail, AuditRecord } from './auditTrail.js';
import type { PostgresRepositories } from '../persistence/postgresRepositories.js';

export class PersistentAuditService {
  private persistedIds = new Set<string>();

  constructor(
    private readonly audit: AuditTrail,
    private readonly repos: PostgresRepositories,
  ) {}

  async hydrate(): Promise<void> {
    const records = await this.repos.listAuditRecords();
    this.audit.restoreRecords(records);
    this.persistedIds = new Set(records.map((r) => r.id));
  }

  async flush(): Promise<number> {
    let count = 0;
    for (const record of this.audit.all()) {
      if (this.persistedIds.has(record.id)) continue;
      await this.repos.saveAuditRecord(record);
      this.persistedIds.add(record.id);
      count += 1;
    }
    return count;
  }

  async appendAndFlush(record: AuditRecord): Promise<void> {
    if (!this.persistedIds.has(record.id)) {
      await this.repos.saveAuditRecord(record);
      this.persistedIds.add(record.id);
    }
  }
}
