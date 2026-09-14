import { describe, expect, it } from 'vitest';
import { AuditTrail } from '../src/audit/auditTrail.js';

describe('audit canonicalization', () => {
  it('survives JSON/JSONB style round-trip with undefined fields', () => {
    const audit1 = new AuditTrail();

    audit1.append({
      activityId: undefined,
      userId: undefined,
      seatId: 'seat-1',
      actorType: 'human',
      action: 'canonical.roundtrip',
      targetType: undefined,
      targetId: 'x',
      result: 'success',
      reason: undefined,
      metadata: {
        keep: 'yes',
        drop: undefined,
        nested: {
          keep: 1,
          drop: undefined,
        },
        array: [1, undefined, 3],
      },
    });

    // Simulate JSONB persistence: undefined object properties disappear;
    // undefined array elements become null.
    const persisted = JSON.parse(JSON.stringify(audit1.all()));

    const audit2 = new AuditTrail();
    audit2.restoreRecords(persisted);

    expect(audit2.verifyIntegrity()).toBe(true);
    expect(audit2.count()).toBe(1);
  });

  it('continues the chain after restore', () => {
    const audit1 = new AuditTrail();
    audit1.append({
      actorType: 'system',
      action: 'first',
      result: 'info',
    });

    const persisted = JSON.parse(JSON.stringify(audit1.all()));

    const audit2 = new AuditTrail();
    audit2.restoreRecords(persisted);
    audit2.append({
      actorType: 'system',
      action: 'second',
      result: 'success',
    });

    expect(audit2.verifyIntegrity()).toBe(true);
    expect(audit2.count()).toBe(2);
  });
});
