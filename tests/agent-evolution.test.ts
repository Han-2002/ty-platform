import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { EvolutionEngine } from '../src/evolution/evolution.js';
import { parseSkillMarkdown } from '../src/skills/parseSkill.js';
import { tmpDir, cleanup } from './helpers.js';
import type { FeedbackRecord } from '../src/task/taskManager.js';

describe('agent-evolution', () => {
  it('反思→提炼闭环：任务复盘后产出候选技能', () => {
    const dir = tmpDir();
    try {
      const engine = new EvolutionEngine(dir);
      const feedback: FeedbackRecord[] = [{ outputId: 'o1', seatId: 's1', rating: 'good', at: 1 }];
      const conclusion = engine.reflect('任务X', feedback);
      expect(conclusion).toContain('复盘');
      const candidate = engine.extract('任务X', 'new-skill', '1. 步骤一', 4);
      expect(engine.getCandidates().length).toBe(1);
      expect(engine.getLog().map((l) => l.action)).toContain('reflect');
      expect(engine.getLog().map((l) => l.action)).toContain('extract');
    } finally {
      cleanup(dir);
    }
  });

  it('高密级任务产出的新技能仍为最低密级（禁止自动提权）', () => {
    const engine = new EvolutionEngine(tmpDir());
    const candidate = engine.extract('密级4任务', 'sk', '1. 步骤', 4);
    expect(candidate.clearance).toBe(1);
    expect(candidate.sourceClearance).toBe(4);
    expect(parseSkillMarkdown(candidate.content, 'x').clearance).toBe(1);
  });

  it('含危险指令的产物被拒绝固化', () => {
    const dir = tmpDir();
    try {
      const engine = new EvolutionEngine(dir);
      const candidate = engine.extract('任务', 'bad', '1. 执行 rm -rf / 清理', 2);
      expect(engine.validate(candidate)).toBe(false);
      expect(candidate.dangerHits.length).toBeGreaterThan(0);
      expect(() => engine.solidify(candidate)).toThrow(/危险指令/);
      expect(engine.getLog().some((l) => l.action === 'validate' && l.detail.includes('拒绝固化'))).toBe(true);
    } finally {
      cleanup(dir);
    }
  });

  it('固化产物写入独立 runtime 目录、留痕且可回滚', () => {
    const dir = tmpDir();
    try {
      const runtimeDir = join(dir, 'runtime');
      const engine = new EvolutionEngine(runtimeDir);
      const candidate = engine.extract('任务', 'rollback-me', '1. 步骤', 1);
      expect(engine.validate(candidate)).toBe(true);
      engine.solidify(candidate);
      const file = join(runtimeDir, 'skills', 'rollback-me', 'SKILL.md');
      expect(existsSync(file)).toBe(true);
      engine.rollback('rollback-me');
      expect(existsSync(file)).toBe(false);
      const actions = engine.getLog().map((l) => l.action);
      expect(actions).toContain('solidify');
      expect(actions).toContain('rollback');
    } finally {
      cleanup(dir);
    }
  });
});
