import { join } from 'node:path';
import {
  loadSeatsConfig,
  loadSkillsConfig,
  loadSimulatorsConfig,
  loadKnowledgeDocuments,
} from './config/load.ts';
import { Organization } from './org/organization.ts';
import { SkillRegistry } from './skills/skillRegistry.ts';
import { ZipInstaller, type InstallResult } from './skills/zipInstaller.ts';
import { KnowledgeBase } from './knowledge/knowledgeBase.ts';
import { AgentRuntime, type ProactiveMessage } from './runtime/agentRuntime.ts';
import { resolvePersona } from './runtime/persona.ts';
import { MockLLMProvider, type LLMProvider } from './runtime/llm.ts';
import { MessageBus } from './collab/messageBus.ts';
import { TaskManager } from './task/taskManager.ts';
import { SimulationRunner, SimulationService } from './sim/simulation.ts';
import { EvolutionEngine } from './evolution/evolution.ts';
import type { Plan } from './types.ts';

export interface PlatformOptions {
  configDir: string;
  skillsDir: string;
  runtimeDir: string;
  personasDir?: string;
  llm?: LLMProvider;
}

export class Platform {
  readonly org: Organization;
  readonly registry: SkillRegistry;
  readonly kb: KnowledgeBase;
  readonly messageBus: MessageBus;
  readonly taskManager: TaskManager;
  readonly simulationService: SimulationService;
  readonly evolution: EvolutionEngine;
  readonly runtimes = new Map<string, AgentRuntime>();

  private readonly skillsDir: string;
  private readonly configDir: string;
  private readonly llm: LLMProvider;
  private readonly proactiveMessages: ProactiveMessage[] = [];

  constructor(opts: PlatformOptions) {
    this.skillsDir = opts.skillsDir;
    this.configDir = opts.configDir;
    this.llm = opts.llm ?? new MockLLMProvider();

    const seatsCfg = loadSeatsConfig(join(opts.configDir, 'seats.yaml'));
    const skillsCfg = loadSkillsConfig(join(opts.configDir, 'skills.yaml'));
    const simulatorsCfg = loadSimulatorsConfig(join(opts.configDir, 'simulators.yaml'));
    const documents = loadKnowledgeDocuments(join(opts.configDir, 'knowledge.yaml'));

    this.org = new Organization(seatsCfg);
    this.registry = SkillRegistry.fromSkillsDir(opts.skillsDir, skillsCfg);
    this.kb = new KnowledgeBase(documents);
    this.messageBus = new MessageBus(this.org);
    this.taskManager = new TaskManager(this.org, this.registry);
    const runner = new SimulationRunner(simulatorsCfg.simulators);
    this.simulationService = new SimulationService(runner);
    this.evolution = new EvolutionEngine(opts.runtimeDir);

    const personasDir = opts.personasDir ?? join(opts.configDir, 'personas');
    for (const seat of this.org.allSeats()) {
      const persona = resolvePersona(personasDir, seat.id, seat.role.id);
      const runtime = new AgentRuntime({
        seat,
        persona,
        registry: this.registry,
        kb: this.kb,
        llm: this.llm,
        onProactive: (msg) => this.proactiveMessages.push(msg),
      });
      this.runtimes.set(seat.id, runtime);
    }
  }

  runtimeFor(seatId: string): AgentRuntime {
    const rt = this.runtimes.get(seatId);
    if (!rt) throw new Error(`席位运行时不存在: ${seatId}`);
    return rt;
  }

  allRuntimes(): AgentRuntime[] {
    return [...this.runtimes.values()];
  }

  // 全部空闲席位主动推送，返回并记录提示
  idleTickAll(): ProactiveMessage[] {
    const result: ProactiveMessage[] = [];
    for (const rt of this.runtimes.values()) {
      const msg = rt.idleTick();
      if (msg) result.push(msg);
    }
    return result;
  }

  getProactiveMessages(): ProactiveMessage[] {
    return [...this.proactiveMessages];
  }

  // 上传技能 zip：安装后同步登记进注册表
  installSkillZip(buffer: Uint8Array): InstallResult {
    const installer = new ZipInstaller(this.skillsDir);
    const result = installer.install(buffer);
    const skillsCfg = loadSkillsConfig(join(this.configDir, 'skills.yaml'));
    this.registry.reloadFromDir(this.skillsDir, skillsCfg);
    return result;
  }

  // 多套候选方案由多个席位并发生成（总耗时≈最慢单席）
  async generatePlans(seatIds: string[], topic: string): Promise<Plan[]> {
    return Promise.all(
      seatIds.map(async (seatId, i) => {
        const rt = this.runtimeFor(seatId);
        const content = await rt.run(`拟制方案（${topic}）`);
        return {
          plan_id: `plan-${i + 1}`,
          plan_name: `${rt.seat.name}-方案`,
          plan_content: content,
          seatId,
        };
      }),
    );
  }
}
