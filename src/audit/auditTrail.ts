import { createHash, randomUUID } from 'node:crypto';

export type AuditActorType = 'human' | 'agent' | 'system';

export interface AuditEventInput {
  activityId?: string;
  userId?: string;
  seatId?: string;
  actorType: AuditActorType;
  action: string;
  targetType?: string;
  targetId?: string;
  result: 'allowed' | 'denied' | 'success' | 'failure' | 'info';
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditRecord extends AuditEventInput {
  id: string;
  at: number;
  sequence: number;
  prevHash: string;
  hash: string;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stable(obj[k])}`).join(',')}}`;
}

function hashRecord(record: Omit<AuditRecord, 'hash'>): string {
  return createHash('sha256').update(stable(record)).digest('hex');
}

export class AuditTrail {
  private readonly records: AuditRecord[] = [];

  append(input: AuditEventInput): AuditRecord {
    const prevHash = this.records.at(-1)?.hash ?? 'GENESIS';
    const base: Omit<AuditRecord, 'hash'> = {
      ...input,
      metadata: input.metadata ? { ...input.metadata } : undefined,
      id: randomUUID(),
      at: Date.now(),
      sequence: this.records.length + 1,
      prevHash,
    };
    const record: AuditRecord = { ...base, hash: hashRecord(base) };
    this.records.push(record);
    return { ...record, metadata: record.metadata ? { ...record.metadata } : undefined };
  }

  all(): AuditRecord[] {
    return this.records.map((r) => ({
      ...r,
      metadata: r.metadata ? { ...r.metadata } : undefined,
    }));
  }

  restoreRecords(records: AuditRecord[]): void {
    const sorted = [...records].sort((a, b) => a.sequence - b.sequence);
    this.records.length = 0;
    for (const record of sorted) {
      this.records.push({
        ...record,
        metadata: record.metadata ? { ...record.metadata } : undefined,
      });
    }
    if (!this.verifyIntegrity()) {
      this.records.length = 0;
      throw new Error('数据库中的审计 hash 链完整性校验失败');
    }
  }

  clearForRestore(): void {
    this.records.length = 0;
  }

  query(filter: {
    activityId?: string;
    userId?: string;
    seatId?: string;
    action?: string;
    result?: AuditRecord['result'];
  }): AuditRecord[] {
    return this.all().filter((r) => {
      if (filter.activityId && r.activityId !== filter.activityId) return false;
      if (filter.userId && r.userId !== filter.userId) return false;
      if (filter.seatId && r.seatId !== filter.seatId) return false;
      if (filter.action && r.action !== filter.action) return false;
      if (filter.result && r.result !== filter.result) return false;
      return true;
    });
  }

  verifyIntegrity(): boolean {
    let prevHash = 'GENESIS';
    for (let i = 0; i < this.records.length; i += 1) {
      const record = this.records[i];
      if (record.sequence !== i + 1) return false;
      if (record.prevHash !== prevHash) return false;
      const { hash, ...base } = record;
      if (hashRecord(base) !== hash) return false;
      prevHash = hash;
    }
    return true;
  }

  count(): number {
    return this.records.length;
  }
}
