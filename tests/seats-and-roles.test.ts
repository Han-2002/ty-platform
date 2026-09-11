import { describe, it, expect } from 'vitest';
import { Organization } from '../src/org/organization.js';
import { STANDARD_PHASES } from '../src/types.js';
import { role, seat, seatsConfig, scaledSeatsConfig } from './helpers.js';

describe('seats-and-roles', () => {
  it('席位从 100 扩容至 200 无需改码（无硬编码上限）', () => {
    const org100 = new Organization(scaledSeatsConfig(100));
    const org200 = new Organization(scaledSeatsConfig(200));
    expect(org100.seats.size).toBe(100);
    expect(org200.seats.size).toBe(200);
    expect(new Set(org200.allSeats().map((s) => s.id)).size).toBe(200);
  });

  it('席位继承角色权限属性（can_dispatch=false、clearance=2）', () => {
    const org = new Organization(
      seatsConfig(
        [role({ id: 'r', can_dispatch: false, clearance: 2 })],
        [seat({ id: 's1', role: 'r' })],
      ),
    );
    const s = org.getSeat('s1');
    expect(s.can_dispatch).toBe(false);
    expect(s.clearance).toBe(2);
  });

  it('修改角色定义影响全部归属席位', () => {
    const org = new Organization(
      seatsConfig(
        [role({ id: 'r', can_approve: false })],
        [seat({ id: 's1', role: 'r' }), seat({ id: 's2', role: 'r' }), seat({ id: 's3', role: 'r' })],
      ),
    );
    expect(org.getSeat('s1').can_approve).toBe(false);
    org.getRole('r').can_approve = true;
    expect(org.getSeat('s1').can_approve).toBe(true);
    expect(org.getSeat('s2').can_approve).toBe(true);
    expect(org.getSeat('s3').can_approve).toBe(true);
  });

  it('指挥链通过 parent 构成树状层级并支持子树遍历', () => {
    const org = new Organization(
      seatsConfig(
        [role({ id: 'r' })],
        [
          seat({ id: 'root', role: 'r', parent: null }),
          seat({ id: 'a', role: 'r', parent: 'root' }),
          seat({ id: 'b', role: 'r', parent: 'root' }),
          seat({ id: 'a1', role: 'r', parent: 'a' }),
          seat({ id: 'b1', role: 'r', parent: 'b' }),
        ],
      ),
    );
    // root 的后代 = a, b, a1, b1
    expect(new Set(org.descendants('root'))).toEqual(new Set(['a', 'b', 'a1', 'b1']));
    // a 的后代 = a1 仅自身子树
    expect(new Set(org.descendants('a'))).toEqual(new Set(['a1']));
    // a1 的祖先 = a, root
    expect(org.ancestors('a1')).toEqual(['a', 'root']);
  });

  it('活动阶段可完整枚举五个标准阶段', () => {
    const org = new Organization(
      seatsConfig([role({ id: 'r' })], [seat({ id: 's1', role: 'r' })]),
    );
    expect(org.getActivity('act-a').phases).toEqual([...STANDARD_PHASES]);
    expect(STANDARD_PHASES).toEqual(['准备', '方案拟制', '推演验证', '执行', '复盘']);
  });
});
