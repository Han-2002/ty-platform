import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse as parseYaml } from 'yaml';

export interface ParsedSkill {
  name: string;
  description: string;
  clearance: number;
  allowed_roles: string[];
  body: string;
}

// 解析 SKILL.md：frontmatter(name/description/metadata) + 正文
export function parseSkillMarkdown(content: string, source: string): ParsedSkill {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) {
    throw new Error(`SKILL.md 缺少 frontmatter: ${source}`);
  }
  let fm: Record<string, unknown>;
  try {
    fm = (parseYaml(m[1]) ?? {}) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`SKILL.md frontmatter 解析失败: ${source}: ${(e as Error).message}`);
  }
  const name = fm.name;
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error(`SKILL.md 缺少 name: ${source}`);
  }
  const metadata = (fm.metadata ?? {}) as Record<string, unknown>;
  const clearance = typeof metadata.clearance === 'number' ? metadata.clearance : 1;
  const allowed_roles = Array.isArray(metadata.allowed_roles)
    ? (metadata.allowed_roles as string[])
    : [];
  return {
    name,
    description: typeof fm.description === 'string' ? fm.description : '',
    clearance,
    allowed_roles,
    body: m[2] ?? '',
  };
}

export interface SkillFile {
  name: string; // 目录名
  dir: string; // 绝对目录
  content: string; // SKILL.md 内容
}

// 扫描 skills 目录下所有 */SKILL.md
export function scanSkillFiles(skillsDir: string): SkillFile[] {
  if (!existsSync(skillsDir)) return [];
  const result: SkillFile[] = [];
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(skillsDir, entry.name);
    const skillMd = join(dir, 'SKILL.md');
    if (existsSync(skillMd) && statSync(skillMd).isFile()) {
      result.push({ name: entry.name, dir, content: readFileSync(skillMd, 'utf8') });
    }
  }
  return result;
}

export { relative };
