import { unzipSync, strFromU8 } from 'fflate';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SkillInstallError } from '../errors.js';
import { parseSkillMarkdown } from './parseSkill.js';

const EXECUTABLE_EXT = new Set(['.exe', '.dll', '.so', '.dylib', '.bat', '.cmd']);
const ALLOWED_EXT = new Set(['.md', '.txt', '.yaml', '.yml', '.json']);
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 500;

function extensionOf(p: string): string {
  const base = p.split('/').pop() ?? '';
  const i = base.lastIndexOf('.');
  return i >= 0 ? base.slice(i).toLowerCase() : '';
}

// 防目录穿越：拒绝绝对路径、Windows 盘符与含 .. 的路径
function isSafePath(p: string): boolean {
  if (p.startsWith('/') || p.startsWith('\\')) return false;
  if (/^[a-zA-Z]:/.test(p)) return false;
  return !p.split(/[\\/]/).some((s) => s === '..');
}

// 技能名净化：仅保留字母数字与 - _，防止目录穿越
function sanitizeName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^[-_.]+|[-_.]+$/g, '');
  return cleaned || 'skill';
}

export interface InstallResult {
  installed: string[];
}

export class ZipInstaller {
  constructor(private readonly skillsDir: string) {}

  install(zipBuffer: Uint8Array): InstallResult {
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(zipBuffer);
    } catch (e) {
      throw new SkillInstallError(`无法解析 zip 包: ${(e as Error).message}`);
    }

    let totalBytes = 0;
    const fileEntries: { path: string; data: Uint8Array }[] = [];
    for (const [path, data] of Object.entries(files)) {
      if (path.endsWith('/')) continue; // 目录条目
      if (!isSafePath(path)) throw new SkillInstallError(`拒绝路径穿越包: ${path}`);
      const ext = extensionOf(path);
      if (EXECUTABLE_EXT.has(ext)) throw new SkillInstallError(`拒绝可执行文件: ${path}`);
      if (!ALLOWED_EXT.has(ext)) throw new SkillInstallError(`非法文件类型: ${path}`);
      totalBytes += data.length;
      fileEntries.push({ path, data });
    }

    if (fileEntries.length > MAX_FILES) {
      throw new SkillInstallError(`文件数量超限: ${fileEntries.length} > ${MAX_FILES}`);
    }
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new SkillInstallError(`总体积超限: ${totalBytes} > ${MAX_TOTAL_BYTES}`);
    }

    const skillMdEntries = fileEntries.filter(
      (e) => e.path === 'SKILL.md' || e.path.endsWith('/SKILL.md'),
    );
    if (skillMdEntries.length === 0) {
      throw new SkillInstallError('包内不含任何 SKILL.md');
    }

    const installed: string[] = [];
    for (const skillMd of skillMdEntries) {
      const content = strFromU8(skillMd.data);
      const parsed = parseSkillMarkdown(content, skillMd.path);
      const name = sanitizeName(parsed.name);
      const dir = join(this.skillsDir, name);
      mkdirSync(dir, { recursive: true });

      if (skillMd.path === 'SKILL.md') {
        // 单技能包：仅根级文件
        for (const f of fileEntries) {
          if (f.path !== 'SKILL.md' && !f.path.includes('/')) {
            writeFileSync(join(dir, f.path), f.data);
          }
        }
      } else {
        // 多技能批量包：每个子目录一个技能
        const prefix = skillMd.path.slice(0, -'SKILL.md'.length);
        for (const f of fileEntries) {
          if (f.path.startsWith(prefix) && f.path !== skillMd.path) {
            writeFileSync(join(dir, f.path.slice(prefix.length)), f.data);
          }
        }
      }
      writeFileSync(join(dir, 'SKILL.md'), skillMd.data);
      installed.push(name);
    }

    return { installed };
  }
}
