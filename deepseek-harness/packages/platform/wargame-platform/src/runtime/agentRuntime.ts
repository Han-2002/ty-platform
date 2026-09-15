import type { Seat } from '../org/organization.ts';
import type { KnowledgeBase } from '../knowledge/knowledgeBase.ts';
import type { SkillRegistry, ResolvedSkill, SkillRoleView } from '../skills/skillRegistry.ts';
import { Memory } from './memory.ts';
import type { LLMProvider } from './llm.ts';
import type { MessageType } from '../types.ts';

export interface ProactiveMessage {
  from: string;
  content: string;
  type: MessageType;
}

export interface RuntimeOptions {
  seat: Seat;
  persona: string;
  registry: SkillRegistry;
  kb: KnowledgeBase;
  llm: LLMProvider;
  onProactive?: (msg: ProactiveMessage) => void;
}

export class AgentRuntime {
  readonly seat: Seat;
  readonly persona: string;
  readonly memory = new Memory();
  private readonly registry: SkillRegistry;
  private readonly kb: KnowledgeBase;
  private readonly llm: LLMProvider;
  private readonly onProactive?: (msg: ProactiveMessage) => void;
  private busy = false;

  constructor(opts: RuntimeOptions) {
    this.seat = opts.seat;
    this.persona = opts.persona;
    this.registry = opts.registry;
    this.kb = opts.kb;
    this.llm = opts.llm;
    this.onProactive = opts.onProactive;
  }

  get roleId(): string {
    return this.seat.role.id;
  }

  private roleView(): SkillRoleView {
    return {
      id: this.roleId,
      clearance: this.seat.clearance,
      packs: this.seat.packs,
      skill_allow: this.seat.skill_allow,
    };
  }

  // 可用技能（越权/未授权不可见）
  availableSkills(): ResolvedSkill[] {
    return this.registry.availableSkills(this.roleView());
  }

  // 查询知识：越权明确拒绝，不编造
  async answer(question: string): Promise<string> {
    const view = { id: this.roleId, clearance: this.seat.clearance };
    const hits = this.kb.search(view, question);
    if (hits.length > 0) {
      return hits.map((d) => d.content).join('\n');
    }
    if (this.kb.hasBlockedMatch(view, question)) {
      return '无法获取：该内容超出当前席位的密级或权限范围。';
    }
    return await this.llm.complete(question);
  }

  // 接收指示 → 自主执行 → 汇总汇报（mock LLM 模拟）
  async run(instruction: string): Promise<string> {
    this.busy = true;
    try {
      const result = await this.llm.complete(instruction);
      this.memory.add('working', `执行：${instruction} → ${result}`);
      this.memory.add('episodic', `完成任务：${instruction}`);
      return result;
    } finally {
      this.busy = false;
    }
  }

  get isBusy(): boolean {
    return this.busy;
  }

  // 空闲主动推送重要提示
  idleTick(): ProactiveMessage | null {
    if (this.busy) return null;
    const msg: ProactiveMessage = {
      from: this.seat.id,
      content: `主动提示：${this.seat.name} 当前无任务，已整理到的重点信息请关注。`,
      type: 'proactive',
    };
    this.onProactive?.(msg);
    return msg;
  }
}
