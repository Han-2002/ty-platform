import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Organization } from '../src/org/organization.js';
import { KnowledgeBase } from '../src/knowledge/knowledgeBase.js';
import { SkillRegistry } from '../src/skills/skillRegistry.js';
import { AgentRuntime } from '../src/runtime/agentRuntime.js';
import { Memory } from '../src/runtime/memory.js';
import { resolvePersona, DEFAULT_PERSONA } from '../src/runtime/persona.js';
import { MockLLMProvider } from '../src/runtime/llm.js';
import { role, seat, seatsConfig, parsedSkill, tmpDir, cleanup } from './helpers.js';
import type { KnowledgeDocument } from '../src/types.js';

function org2() {
  return new Organization(
    seatsConfig(
      [role({ id: 'r1', clearance: 3 })],
      [seat({ id: 'A', role: 'r1' }), seat({ id: 'B', role: 'r1' })],
    ),
  );
}

describe('agent-runtime', () => {
  it('席位间运行时互不干扰（记忆与上下文隔离）', async () => {
    const org = org2();
    const registry = new SkillRegistry([], { skills: [], packs: {} });
    const kb = new KnowledgeBase([]);
    const rtA = new AgentRuntime({ seat: org.getSeat('A'), persona: 'p', registry, kb, llm: new MockLLMProvider() });
    const rtB = new AgentRuntime({ seat: org.getSeat('B'), persona: 'p', registry, kb, llm: new MockLLMProvider() });
    await rtA.run('任务X');
    expect(rtA.memory.size).toBeGreaterThan(0);
    expect(rtB.memory.size).toBe(0);
  });

  it('人格按 席位级 > 角色级 > 内置默认 解析', () => {
    const dir = tmpDir();
    try {
      mkdirSync(join(dir, 'seats'), { recursive: true });
      mkdirSync(join(dir, 'roles'), { recursive: true });
      writeFileSync(join(dir, 'seats', 's1.md'), '席位级人格');
      writeFileSync(join(dir, 'roles', 'r1.md'), '角色级人格');
      expect(resolvePersona(dir, 's1', 'r1')).toBe('席位级人格');
      // 缺失席位级 → 回退角色级
      expect(resolvePersona(dir, 's2', 'r1')).toBe('角色级人格');
      // 都缺失 → 内置默认
      expect(resolvePersona(dir, 's3', 'r9')).toBe(DEFAULT_PERSONA);
    } finally {
      cleanup(dir);
    }
  });

  it('三层记忆支持 persist / restore，集群重建后可召回', () => {
    const dir = tmpDir();
    try {
      const mem = new Memory();
      mem.add('working', 'w');
      mem.add('long_term', 'l');
      mem.add('episodic', 'e');
      mem.persist(dir);
      const mem2 = new Memory();
      mem2.restore(dir);
      expect(mem2.recall().length).toBe(3);
      expect(mem2.recall('working').map((e) => e.content)).toEqual(['w']);
      expect(mem2.recall('long_term').map((e) => e.content)).toEqual(['l']);
      expect(mem2.recall('episodic').map((e) => e.content)).toEqual(['e']);
    } finally {
      cleanup(dir);
    }
  });

  it('请求越权知识时明确拒绝而非编造', async () => {
    const org = org2();
    const kb = new KnowledgeBase([
      { id: 'd1', title: '绝密', content: '绝密预置态势', clearance: 5, allow: [], deny: [] },
    ] as KnowledgeDocument[]);
    const rt = new AgentRuntime({
      seat: org.getSeat('A'), // clearance 3
      persona: 'p',
      registry: new SkillRegistry([], { skills: [], packs: {} }),
      kb,
      llm: new MockLLMProvider(),
    });
    const answer = await rt.answer('绝密预置态势');
    expect(answer).toContain('无法获取');
  });

  it('未授权技能不可见', () => {
    const org = new Organization(
      seatsConfig(
        [role({ id: 'r1', packs: ['p'] })],
        [seat({ id: 'A', role: 'r1' })],
      ),
    );
    const registry = new SkillRegistry(
      [parsedSkill('sk-a', 1, ['r1']), parsedSkill('sk-b', 1, ['r2'])],
      { skills: [], packs: { p: ['sk-a', 'sk-b'] } },
    );
    const rt = new AgentRuntime({
      seat: org.getSeat('A'),
      persona: 'p',
      registry,
      kb: new KnowledgeBase([]),
      llm: new MockLLMProvider(),
    });
    expect(rt.availableSkills().map((s) => s.name)).toEqual(['sk-a']);
  });

  it('空闲席位主动推送重要提示（标记为主动提示）', () => {
    const org = org2();
    const rt = new AgentRuntime({
      seat: org.getSeat('A'),
      persona: 'p',
      registry: new SkillRegistry([], { skills: [], packs: {} }),
      kb: new KnowledgeBase([]),
      llm: new MockLLMProvider(),
    });
    const msg = rt.idleTick();
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe('proactive');
    expect(msg!.from).toBe('A');
  });
});
