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

/**
 * Canonicalize values before hashing/persisting:
 * - object properties whose value is undefined are omitted;
 * - undefined inside arrays becomes null (same semantics as JSON);
 * - nested metadata is normalized recursively.
 *
 * This makes an AuditRecord hash stable across:
 * TypeScript object -> JSON/JSONB -> PostgreSQL -> TypeScript object.
 */
function canonicalize(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((item) => {
      const normalized = canonicalize(item);
      return normalized === undefined ? null : normalized;
    });
  }

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(input)) {
    const normalized = canonicalize(input[key]);
    if (normalized !== undefined) output[key] = normalized;
  }
  return output;
}

function stable(value: unknown): string {
  const normalized = canonicalize(value);

  if (normalized === null) return 'null';
  if (normalized === undefined) return 'null';
  if (typeof normalized !== 'object') return JSON.stringify(normalized);

  if (Array.isArray(normalized)) {
    return `[${normalized.map(stable).join(',')}]`;
  }

  const obj = normalized as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stable(obj[k])}`).join(',')}}`;
}

function canonicalRecord<T extends object>(value: T): T {
  return canonicalize(value) as T;
}

function hashRecord(record: Omit<AuditRecord, 'hash'>): string {
  return createHash('sha256').update(stable(record)).digest('hex');
}

export class AuditTrail {
  private readonly records: AuditRecord[] = [];

  append(input: AuditEventInput): AuditRecord {
    const prevHash = this.records.at(-1)?.hash ?? 'GENESIS';

    const base = canonicalRecord({
      ...input,
      id: randomUUID(),
      at: Date.now(),
      sequence: this.records.length + 1,
      prevHash,
    }) as Omit<AuditRecord, 'hash'>;

    const record = canonicalRecord({
      ...base,
      hash: hashRecord(base),
    }) as AuditRecord;

    this.records.push(record);
    return canonicalRecord(record);
  }

  all(): AuditRecord[] {
    return this.records.map((record) => canonicalRecord(record));
  }

  restoreRecords(records: AuditRecord[]): void {
    const sorted = records
      .map((record) => canonicalRecord(record))
      .sort((a, b) => a.sequence - b.sequence);

    this.records.length = 0;
    this.records.push(...sorted);

    if (!this.verifyIntegrity()) {
      this.records.length = 0;
      throw new Error(
        '数据库中的审计 hash 链完整性校验失败。'
        + '如果这是升级前的本地开发数据库，请先运行 scripts/repair-audit-chain.ts 备份并重置旧链。',
      );
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
      const record = canonicalRecord(this.records[i]);

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
