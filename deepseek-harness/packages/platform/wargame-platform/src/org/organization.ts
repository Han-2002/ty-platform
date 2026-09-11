import { STANDARD_PHASES, type Phase, type RoleDef, type SeatDef, type SeatsConfig, type ActivityDef } from '../types.ts';

// 角色：权限属性可变，席位通过引用共享同一角色实例，故修改角色即作用于全部归属席位
export class Role {
  readonly id: string;
  readonly name: string;
  level: number;
  clearance: number;
  can_dispatch: boolean;
  can_approve: boolean;
  readonly packs: string[];
  readonly skill_allow: string[];
  readonly description: string;

  constructor(def: RoleDef) {
    this.id = def.id;
    this.name = def.name;
    this.level = def.level;
    this.clearance = def.clearance;
    this.can_dispatch = def.can_dispatch;
    this.can_approve = def.can_approve;
    this.packs = def.packs ?? [];
    this.skill_allow = def.skill_allow ?? [];
    this.description = def.description ?? '';
  }
}

// 席位：权限属性委托给角色，随角色变更即时生效
export class Seat {
  readonly id: string;
  readonly name: string;
  readonly role: Role;
  readonly parentId: string | null;

  constructor(def: SeatDef, role: Role) {
    this.id = def.id;
    this.name = def.name;
    this.role = role;
    this.parentId = def.parent ?? null;
  }

  get level(): number {
    return this.role.level;
  }
  get clearance(): number {
    return this.role.clearance;
  }
  get can_dispatch(): boolean {
    return this.role.can_dispatch;
  }
  get can_approve(): boolean {
    return this.role.can_approve;
  }
  get packs(): string[] {
    return this.role.packs;
  }
  get skill_allow(): string[] {
    return this.role.skill_allow;
  }
}

export class Activity {
  readonly id: string;
  readonly name: string;

  constructor(def: ActivityDef) {
    this.id = def.id;
    this.name = def.name;
  }

  get phases(): Phase[] {
    return [...STANDARD_PHASES];
  }
}

export class Organization {
  readonly roles: Map<string, Role>;
  readonly seats: Map<string, Seat>;
  readonly activities: Map<string, Activity>;
  private readonly childrenMap: Map<string, string[]>;

  constructor(cfg: SeatsConfig) {
    this.roles = new Map();
    for (const r of cfg.roles) {
      this.roles.set(r.id, new Role(r));
    }

    this.seats = new Map();
    for (const s of cfg.seats) {
      const role = this.roles.get(s.role);
      if (!role) {
        throw new Error(`席位 ${s.id} 引用了不存在的角色 ${s.role}`);
      }
      this.seats.set(s.id, new Seat(s, role));
    }

    this.activities = new Map();
    for (const a of cfg.activities) {
      this.activities.set(a.id, new Activity(a));
    }

    // 构建直接下级映射
    this.childrenMap = new Map();
    for (const seat of this.seats.values()) {
      if (seat.parentId) {
        const list = this.childrenMap.get(seat.parentId) ?? [];
        list.push(seat.id);
        this.childrenMap.set(seat.parentId, list);
      }
    }
  }

  getSeat(id: string): Seat {
    const s = this.seats.get(id);
    if (!s) throw new Error(`席位不存在: ${id}`);
    return s;
  }

  getRole(id: string): Role {
    const r = this.roles.get(id);
    if (!r) throw new Error(`角色不存在: ${id}`);
    return r;
  }

  getActivity(id: string): Activity {
    const a = this.activities.get(id);
    if (!a) throw new Error(`活动不存在: ${id}`);
    return a;
  }

  allSeats(): Seat[] {
    return [...this.seats.values()];
  }

  allActivities(): Activity[] {
    return [...this.activities.values()];
  }

  // 直接下级
  children(seatId: string): string[] {
    return [...(this.childrenMap.get(seatId) ?? [])];
  }

  // 向下：全部后代席位（不含自身）
  descendants(seatId: string): string[] {
    const result: string[] = [];
    const stack = this.children(seatId);
    while (stack.length > 0) {
      const id = stack.pop()!;
      result.push(id);
      stack.push(...this.children(id));
    }
    return result;
  }

  // 向上：全部祖先席位（不含自身）
  ancestors(seatId: string): string[] {
    const result: string[] = [];
    let cur = this.seats.get(seatId);
    while (cur && cur.parentId) {
      result.push(cur.parentId);
      cur = this.seats.get(cur.parentId);
    }
    return result;
  }

  // 某席位所在指挥链子树（含自身）
  subtree(seatId: string): string[] {
    return [seatId, ...this.descendants(seatId)];
  }
}
