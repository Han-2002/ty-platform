import { randomUUID } from 'node:crypto';
import { writeFileSync, readFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { FeedbackRecord } from '../task/taskManager.ts';

// 危险指令黑名单：命中即拒绝固化
const DANGEROUS_PATTERNS: RegExp[] = [
  /rm\s+-rf\s+\//i,
  /rm\s+-rf\s+~/i,
  /sudo\b/i,
  /chmod\s+777/i,
  /curl\s+.*\|\s*(ba)?sh/i,
  /wget\s+.*\|\s*(ba)?sh/i,
  /\beval\s*\(/i,
  /child_process/i,
  /\bexec\s*\(/i,
  /process\.env/i,
  /fs\.rmSync\s*\(\s*['"]\/['"]/i,
];

export interface EvolutionCandidate {
  id: string;
  name: string;
  content: string; // 生成的 SKILL.md 全文
  clearance: number;
  sourceClearance: number;
  dangerHits: string[];
}

export interface EvolutionLogEntry {
  at: number;
  action: 'reflect' | 'extract' | 'validate' | 'solidify' | 'rollback';
  detail: string;
}

function buildSkillMd(name: string, procedure: string, clearance: number): string {
  return `---\nname: ${name}\ndescription: 自进化提炼的可复用规程\nmetadata:\n  clearance: ${clearance}\n  allowed_roles: []\n---\n\n# ${name}\n\n## 步骤\n${procedure}\n\n## 禁止事项\n- 不涉及具体战术、武器操作或敏感内容\n`;
}

export class EvolutionEngine {
  private readonly log: EvolutionLogEntry[] = [];
  private readonly candidates: EvolutionCandidate[] = [];
  private readonly backups = new Map<string, string>();

  constructor(private readonly runtimeDir: string) {}

  // 反思：任务复盘 → 反思结论
  reflect(taskTitle: string, feedback: FeedbackRecord[]): string {
    const detail = feedback
      .map((f) => `${f.rating}:${f.note ?? '(无备注)'}`)
      .join('; ');
    const conclusion = `复盘「${taskTitle}」→ ${detail}`;
    this.log.push({ at: Date.now(), action: 'reflect', detail: conclusion });
    return conclusion;
  }

  // 提炼：反思结论 → 候选技能（强制 clearance=1，忽略来源任务密级）
  extract(taskTitle: string, name: string, procedure: string, sourceClearance: number): EvolutionCandidate {
    const candidate: EvolutionCandidate = {
      id: randomUUID(),
      name,
      content: buildSkillMd(name, procedure, 1),
      clearance: 1,
      sourceClearance,
      dangerHits: [],
    };
    this.candidates.push(candidate);
    this.log.push({ at: Date.now(), action: 'extract', detail: `由「${taskTitle}」提炼候选技能 ${name}` });
    return candidate;
  }

  // 验证：危险指令校验，命中即拒绝
  validate(candidate: EvolutionCandidate): boolean {
    const hits = DANGEROUS_PATTERNS.filter((p) => p.test(candidate.content)).map((p) => p.source);
    candidate.dangerHits = hits;
    if (hits.length > 0) {
      this.log.push({
        at: Date.now(),
        action: 'validate',
        detail: `拒绝固化 ${candidate.name}: 命中危险指令 [${hits.join(', ')}]`,
      });
      return false;
    }
    this.log.push({ at: Date.now(), action: 'validate', detail: `${candidate.name} 校验通过` });
    return true;
  }

  // 固化：写入 runtime/skills/<name>/SKILL.md，与手写 skills/ 隔离
  solidify(candidate: EvolutionCandidate): void {
    if (candidate.dangerHits.length > 0) {
      throw new Error(`危险指令未通过校验，拒绝固化: ${candidate.name}`);
    }
    const dir = join(this.runtimeDir, 'skills', candidate.name);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'SKILL.md');
    if (existsSync(file)) {
      this.backups.set(candidate.name, readFileSync(file, 'utf8'));
    }
    writeFileSync(file, candidate.content, 'utf8');
    this.log.push({ at: Date.now(), action: 'solidify', detail: `固化技能 ${candidate.name} → ${file}` });
  }

  // 回滚：恢复到固化前状态
  rollback(name: string): void {
    const dir = join(this.runtimeDir, 'skills', name);
    const file = join(dir, 'SKILL.md');
    const prev = this.backups.get(name);
    if (prev != null) {
      writeFileSync(file, prev, 'utf8');
    } else {
      rmSync(dir, { recursive: true, force: true });
    }
    this.log.push({ at: Date.now(), action: 'rollback', detail: `回滚技能 ${name}` });
  }

  getLog(): EvolutionLogEntry[] {
    return [...this.log];
  }

  getCandidates(): EvolutionCandidate[] {
    return [...this.candidates];
  }
}
