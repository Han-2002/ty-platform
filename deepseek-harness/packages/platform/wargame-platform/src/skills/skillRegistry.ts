import type { SkillsConfig } from '../types.ts';
import { parseSkillMarkdown, scanSkillFiles, type ParsedSkill } from './parseSkill.ts';

export interface ResolvedSkill {
  name: string;
  description: string;
  body: string;
  clearance: number;
  enabled: boolean;
  allowed_roles: string[];
}

// 用于技能可用性判定的角色视图
export interface SkillRoleView {
  id: string;
  clearance: number;
  packs: string[];
  skill_allow: string[];
}

export class SkillRegistry {
  private readonly skills = new Map<string, ResolvedSkill>();
  packs: Record<string, string[]>;

  constructor(skills: ParsedSkill[], config: SkillsConfig) {
    this.packs = {};
    this.build(skills, config);
  }

  private build(skills: ParsedSkill[], config: SkillsConfig): void {
    this.skills.clear();
    this.packs = config.packs ?? {};
    const byName = new Map(config.skills.map((s) => [s.name, s]));
    for (const p of skills) {
      const entry = byName.get(p.name);
      // 管理员编排配置优先于 SKILL.md 内嵌 metadata
      const enabled = entry?.enabled ?? true;
      const allowed_roles = entry?.allowed_roles ?? p.allowed_roles;
      this.skills.set(p.name, {
        name: p.name,
        description: p.description,
        body: p.body,
        clearance: p.clearance,
        enabled,
        allowed_roles,
      });
    }
  }

  // 重新扫描 skills 目录（用于 zip 安装后同步登记）
  reloadFromDir(skillsDir: string, config: SkillsConfig): void {
    const parsed = scanSkillFiles(skillsDir).map((f) => parseSkillMarkdown(f.content, `${f.dir}/SKILL.md`));
    this.build(parsed, config);
  }

  static fromSkillsDir(skillsDir: string, config: SkillsConfig): SkillRegistry {
    const parsed = scanSkillFiles(skillsDir).map((f) => parseSkillMarkdown(f.content, `${f.dir}/SKILL.md`));
    return new SkillRegistry(parsed, config);
  }

  getSkill(name: string): ResolvedSkill | undefined {
    return this.skills.get(name);
  }

  hasSkill(name: string): boolean {
    return this.skills.has(name);
  }

  allSkills(): ResolvedSkill[] {
    return [...this.skills.values()];
  }

  // 角色展开后的技能引用集（packs 展开 + skill_allow）
  private referencedBy(role: SkillRoleView): Set<string> {
    const set = new Set<string>(role.skill_allow);
    for (const pack of role.packs) {
      for (const s of this.packs[pack] ?? []) {
        set.add(s);
      }
    }
    return set;
  }

  // 有效技能 = 引用(packs/skill_allow) ∩ 授权(allowed_roles) ∩ 启用(enabled) ∩ 密级门槛
  availableSkills(role: SkillRoleView): ResolvedSkill[] {
    const referenced = this.referencedBy(role);
    return this.allSkills().filter((s) => {
      if (!s.enabled) return false;
      if (!s.allowed_roles.includes(role.id)) return false;
      if (role.clearance < s.clearance) return false;
      if (!referenced.has(s.name)) return false;
      return true;
    });
  }
}
