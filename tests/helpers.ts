import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { SeatsConfig, RoleDef, SeatDef } from '../src/types.js';
import type { ParsedSkill } from '../src/skills/parseSkill.js';

export function writeMinimalConfig(configDir: string, skillsDir: string): void {
  mkdirSync(configDir, { recursive: true });
  mkdirSync(skillsDir, { recursive: true });
  writeFileSync(
    join(configDir, 'seats.yaml'),
    'roles:\n  - {id: r, name: r, level: 1, clearance: 3, can_dispatch: true, can_approve: true, packs: []}\nseats:\n  - {id: s1, name: s1, role: r, parent: null}\nactivities:\n  - {id: a, name: a}\n',
  );
  writeFileSync(join(configDir, 'skills.yaml'), 'skills: []\npacks: {}\n');
  writeFileSync(join(configDir, 'simulators.yaml'), 'simulators: []\n');
  writeFileSync(join(configDir, 'knowledge.yaml'), 'documents: []\n');
}

export function tmpDir(prefix = 'wargame-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

export function role(def: Partial<RoleDef> & { id: string }): RoleDef {
  return {
    name: def.id,
    level: def.level ?? 1,
    clearance: def.clearance ?? 3,
    can_dispatch: def.can_dispatch ?? true,
    can_approve: def.can_approve ?? true,
    packs: def.packs ?? [],
    skill_allow: def.skill_allow ?? [],
    ...def,
  };
}

export function seat(def: { id: string; role: string; parent?: string | null }): SeatDef {
  return { name: def.id, parent: null, ...def };
}

export function seatsConfig(roles: RoleDef[], seats: SeatDef[]): SeatsConfig {
  return { roles, seats, activities: [{ id: 'act-a', name: '活动A' }] };
}

// 生成 count 个席位的配置（用于扩容断言）
export function scaledSeatsConfig(count: number): SeatsConfig {
  const roles: RoleDef[] = [role({ id: 'r', level: 1, clearance: 3 })];
  const seats: SeatDef[] = Array.from({ length: count }, (_, i) => ({
    id: `seat-${i}`,
    name: `席位${i}`,
    role: 'r',
    parent: i === 0 ? null : 'seat-0',
  }));
  return seatsConfig(roles, seats);
}

export function parsedSkill(
  name: string,
  clearance = 1,
  allowed_roles: string[] = [],
): ParsedSkill {
  return { name, description: `${name} 描述`, clearance, allowed_roles, body: `# ${name}` };
}
