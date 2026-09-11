import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { parseSkillMarkdown } from '../src/skills/parseSkill.js';
import { SkillRegistry } from '../src/skills/skillRegistry.js';
import { ZipInstaller } from '../src/skills/zipInstaller.js';
import { SkillInstallError } from '../src/errors.js';
import { tmpDir, cleanup, parsedSkill } from './helpers.js';
import type { SkillsConfig } from '../src/types.js';

function skillMd(name: string, clearance = 1, allowed: string[] = []): string {
  return `---\nname: ${name}\ndescription: 描述\nmetadata:\n  clearance: ${clearance}\n  allowed_roles: [${allowed.join(', ')}]\n---\n\n# ${name}\n\n## 步骤\n1. 步骤一\n\n## 禁止事项\n- 不涉及敏感内容\n`;
}

function makeZip(files: Record<string, string>): Uint8Array {
  const data: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(files)) data[k] = strToU8(v);
  return zipSync(data);
}

function writeSkill(dir: string, name: string, content: string): string {
  const d = join(dir, name);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'SKILL.md'), content, 'utf8');
  return d;
}

const emptyConfig: SkillsConfig = { skills: [], packs: {} };

describe('skill-system', () => {
  it('合法 SKILL.md 可被解析登记', () => {
    const p = parseSkillMarkdown(skillMd('sk-a', 3, ['r1']), 'x');
    expect(p.name).toBe('sk-a');
    expect(p.clearance).toBe(3);
    expect(p.allowed_roles).toEqual(['r1']);
  });

  it('技能可用需同时满足引用与授权（两条件 + 反例）', () => {
    const registry = new SkillRegistry(
      [parsedSkill('sk-a', 1, ['r1']), parsedSkill('sk-b', 1, ['r2'])],
      { skills: [], packs: { p: ['sk-a', 'sk-b'] } },
    );
    // r1 引用 p（含 sk-a, sk-b），但 sk-b 授权给 r2 → 仅 sk-a 可用
    expect(registry.availableSkills({ id: 'r1', clearance: 3, packs: ['p'], skill_allow: [] }).map((s) => s.name)).toEqual(['sk-a']);
    // r2 引用 p，但 sk-a 授权给 r1 → 仅 sk-b 可用
    expect(registry.availableSkills({ id: 'r2', clearance: 3, packs: ['p'], skill_allow: [] }).map((s) => s.name)).toEqual(['sk-b']);
    // r3 已授权（sk-a 允许 r1 不含 r3）且未引用 → 空
    expect(registry.availableSkills({ id: 'r3', clearance: 3, packs: [], skill_allow: [] })).toEqual([]);
    // r1 已授权 sk-a 且引用 → 可用
    const sk = new SkillRegistry([parsedSkill('sk-a', 1, ['r1'])], { skills: [], packs: {} });
    expect(sk.availableSkills({ id: 'r1', clearance: 3, packs: [], skill_allow: ['sk-a'] }).map((s) => s.name)).toEqual(['sk-a']);
  });

  it('enabled=false 时技能不可用且文件保留', () => {
    const dir = tmpDir();
    try {
      writeSkill(dir, 'sk-a', skillMd('sk-a', 1, ['r1']));
      const registry = SkillRegistry.fromSkillsDir(dir, {
        skills: [{ name: 'sk-a', enabled: false, allowed_roles: ['r1'] }],
        packs: { p: ['sk-a'] },
      });
      expect(registry.getSkill('sk-a')!.enabled).toBe(false);
      expect(registry.availableSkills({ id: 'r1', clearance: 3, packs: ['p'], skill_allow: [] })).toEqual([]);
      expect(existsSync(join(dir, 'sk-a', 'SKILL.md'))).toBe(true);
    } finally {
      cleanup(dir);
    }
  });

  it('管理员编排配置优先于 SKILL.md 内嵌 metadata，且不修改 SKILL.md 本体', () => {
    const dir = tmpDir();
    try {
      const fileContent = skillMd('sk-a', 1, ['参谋']);
      writeSkill(dir, 'sk-a', fileContent);
      const registry = SkillRegistry.fromSkillsDir(dir, {
        skills: [{ name: 'sk-a', allowed_roles: ['总导演'] }],
        packs: {},
      });
      expect(registry.getSkill('sk-a')!.allowed_roles).toEqual(['总导演']);
      expect(readFileSync(join(dir, 'sk-a', 'SKILL.md'), 'utf8')).toBe(fileContent);
    } finally {
      cleanup(dir);
    }
  });

  it('上传 zip 安装单技能包', () => {
    const dir = tmpDir();
    try {
      const installer = new ZipInstaller(dir);
      const zip = makeZip({ 'SKILL.md': skillMd('solo', 1, ['r1']) });
      const result = installer.install(zip);
      expect(result.installed).toEqual(['solo']);
      expect(existsSync(join(dir, 'solo', 'SKILL.md'))).toBe(true);
    } finally {
      cleanup(dir);
    }
  });

  it('上传 zip 安装多技能批量包', () => {
    const dir = tmpDir();
    try {
      const installer = new ZipInstaller(dir);
      const zip = makeZip({
        'a/SKILL.md': skillMd('sk-a', 1),
        'b/SKILL.md': skillMd('sk-b', 2),
      });
      const result = installer.install(zip);
      expect(result.installed.sort()).toEqual(['sk-a', 'sk-b']);
      expect(existsSync(join(dir, 'sk-a', 'SKILL.md'))).toBe(true);
      expect(existsSync(join(dir, 'sk-b', 'SKILL.md'))).toBe(true);
    } finally {
      cleanup(dir);
    }
  });

  it('拒绝 zip slip 路径穿越包', () => {
    const dir = tmpDir();
    try {
      const installer = new ZipInstaller(dir);
      const zip = makeZip({ '../evil.md': 'x', 'SKILL.md': skillMd('ok') });
      expect(() => installer.install(zip)).toThrow(SkillInstallError);
      expect(() => installer.install(zip)).toThrow(/路径穿越/);
      expect(existsSync(join(dir, '..', 'evil.md'))).toBe(false);
    } finally {
      cleanup(dir);
    }
  });

  it('拒绝可执行文件', () => {
    const dir = tmpDir();
    try {
      const installer = new ZipInstaller(dir);
      const zip = makeZip({ 'SKILL.md': skillMd('ok'), 'evil.exe': 'MZ' });
      expect(() => installer.install(zip)).toThrow(/可执行文件/);
    } finally {
      cleanup(dir);
    }
  });

  it('拒绝超出体积上限的包', () => {
    const dir = tmpDir();
    try {
      const installer = new ZipInstaller(dir);
      const big = new Uint8Array(20 * 1024 * 1024 + 1);
      const zip = zipSync({ 'SKILL.md': strToU8(skillMd('ok')), 'big.txt': big });
      expect(() => installer.install(zip)).toThrow(/体积/);
    } finally {
      cleanup(dir);
    }
  });

  it('拒绝超出文件数上限的包', () => {
    const dir = tmpDir();
    try {
      const installer = new ZipInstaller(dir);
      const files: Record<string, string> = { 'SKILL.md': skillMd('ok') };
      for (let i = 0; i < 500; i++) files[`f${i}.md`] = 'x';
      const zip = makeZip(files);
      expect(() => installer.install(zip)).toThrow(/数量/);
    } finally {
      cleanup(dir);
    }
  });

  it('拒绝无 SKILL.md 的无效包', () => {
    const dir = tmpDir();
    try {
      const installer = new ZipInstaller(dir);
      const zip = makeZip({ 'readme.md': '无技能' });
      expect(() => installer.install(zip)).toThrow(/SKILL\.md/);
    } finally {
      cleanup(dir);
    }
  });

  it('净化技能名防目录穿越', () => {
    const dir = tmpDir();
    try {
      const installer = new ZipInstaller(dir);
      const zip = makeZip({ 'SKILL.md': skillMd('../evil') });
      const result = installer.install(zip);
      expect(result.installed).toEqual(['evil']);
      expect(existsSync(join(dir, 'evil', 'SKILL.md'))).toBe(true);
    } finally {
      cleanup(dir);
    }
  });
});
