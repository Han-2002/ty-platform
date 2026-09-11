import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { ConfigError } from '../errors.ts';
import type {
  RoleDef,
  SeatDef,
  ActivityDef,
  SeatsConfig,
  SkillConfigEntry,
  SkillsConfig,
  SimulatorConfig,
  SimulatorsConfig,
  KnowledgeDocument,
} from '../types.ts';

function readYaml<T>(filePath: string): T {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (e) {
    throw new ConfigError(`无法读取配置文件 ${filePath}: ${(e as Error).message}`);
  }
  try {
    return parse(raw) as T;
  } catch (e) {
    throw new ConfigError(`配置文件 ${filePath} 不是合法 YAML: ${(e as Error).message}`);
  }
}

function fail(file: string, msg: string): never {
  throw new ConfigError(`[${file}] ${msg}`);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

// ---------- seats.yaml ----------

function validateRole(r: unknown, file: string): asserts r is RoleDef {
  const o = r as Record<string, unknown>;
  if (!isNonEmptyString(o?.id)) fail(file, '角色缺少 id');
  if (!isNonEmptyString(o?.name)) fail(file, `角色 ${o.id} 缺少 name`);
  if (typeof o.level !== 'number') fail(file, `角色 ${o.id} 缺少 level`);
  if (typeof o.clearance !== 'number') fail(file, `角色 ${o.id} 缺少 clearance`);
  if (typeof o.can_dispatch !== 'boolean') fail(file, `角色 ${o.id} 缺少 can_dispatch`);
  if (typeof o.can_approve !== 'boolean') fail(file, `角色 ${o.id} 缺少 can_approve`);
  if (o.packs !== undefined && !Array.isArray(o.packs)) fail(file, `角色 ${o.id} 的 packs 必须是数组`);
  if (o.skill_allow !== undefined && !Array.isArray(o.skill_allow)) fail(file, `角色 ${o.id} 的 skill_allow 必须是数组`);
}

function validateSeat(s: unknown, roleIds: Set<string>, file: string): asserts s is SeatDef {
  const o = s as Record<string, unknown>;
  if (!isNonEmptyString(o?.id)) fail(file, '席位缺少 id');
  if (!isNonEmptyString(o?.name)) fail(file, `席位 ${o.id} 缺少 name`);
  if (!isNonEmptyString(o?.role)) fail(file, `席位 ${o.id} 缺少 role`);
  if (!roleIds.has(o.role as string)) fail(file, `席位 ${o.id} 引用了不存在的角色 ${o.role}`);
  if (o.parent !== null && o.parent !== undefined && !isNonEmptyString(o.parent)) {
    fail(file, `席位 ${o.id} 的 parent 必须是字符串或 null`);
  }
}

function validateActivity(a: unknown, file: string): asserts a is ActivityDef {
  const o = a as Record<string, unknown>;
  if (!isNonEmptyString(o?.id)) fail(file, '活动缺少 id');
  if (!isNonEmptyString(o?.name)) fail(file, `活动 ${o.id} 缺少 name`);
}

export function loadSeatsConfig(filePath: string): SeatsConfig {
  const cfg = readYaml<Partial<SeatsConfig>>(filePath);
  if (!cfg || !Array.isArray(cfg.roles)) fail(filePath, '缺少 roles 数组');
  if (!Array.isArray(cfg.seats)) fail(filePath, '缺少 seats 数组');
  const roles = cfg.roles;
  const seats = cfg.seats;
  const activities = (cfg.activities ?? []) as ActivityDef[];
  if (!Array.isArray(activities)) fail(filePath, 'activities 必须是数组');

  const roleIds = new Set<string>();
  for (const r of roles) {
    validateRole(r, filePath);
    if (roleIds.has(r.id)) fail(filePath, `角色 id 重复: ${r.id}`);
    roleIds.add(r.id);
  }

  const seatIds = new Set<string>();
  for (const s of seats) {
    validateSeat(s, roleIds, filePath);
    if (seatIds.has(s.id)) fail(filePath, `席位 id 重复: ${s.id}`);
    seatIds.add(s.id);
  }

  // 校验 parent 引用存在的席位
  for (const s of seats) {
    if (s.parent != null && !seatIds.has(s.parent)) {
      fail(filePath, `席位 ${s.id} 的 parent 引用了不存在的席位 ${s.parent}`);
    }
  }

  // 校验活动 id 唯一
  const actIds = new Set<string>();
  for (const a of activities) {
    validateActivity(a, filePath);
    if (actIds.has(a.id)) fail(filePath, `活动 id 重复: ${a.id}`);
    actIds.add(a.id);
  }

  return { roles, seats, activities };
}

// ---------- skills.yaml ----------

function validateSkillEntry(s: unknown, file: string): asserts s is SkillConfigEntry {
  const o = s as Record<string, unknown>;
  if (!isNonEmptyString(o?.name)) fail(file, '技能条目缺少 name');
  if (o.enabled !== undefined && typeof o.enabled !== 'boolean') fail(file, `技能 ${o.name} 的 enabled 必须是布尔值`);
  if (o.allowed_roles !== undefined && !Array.isArray(o.allowed_roles)) {
    fail(file, `技能 ${o.name} 的 allowed_roles 必须是数组`);
  }
}

export function loadSkillsConfig(filePath: string): SkillsConfig {
  const cfg = readYaml<Partial<SkillsConfig>>(filePath);
  const skills = (cfg?.skills ?? []) as SkillConfigEntry[];
  if (!Array.isArray(skills)) fail(filePath, '缺少 skills 数组');
  const names = new Set<string>();
  for (const s of skills) {
    validateSkillEntry(s, filePath);
    if (names.has(s.name)) fail(filePath, `技能名重复: ${s.name}`);
    names.add(s.name);
  }
  const packs: Record<string, string[]> = {};
  if (cfg?.packs != null) {
    if (typeof cfg.packs !== 'object' || Array.isArray(cfg.packs)) fail(filePath, 'packs 必须是对象');
    for (const [packName, entries] of Object.entries(cfg.packs)) {
      if (!Array.isArray(entries)) fail(filePath, `技能包 ${packName} 必须是数组`);
      for (const e of entries) {
        if (!isNonEmptyString(e)) fail(filePath, `技能包 ${packName} 内含非法条目`);
      }
      packs[packName] = entries as string[];
    }
  }
  return { skills, packs };
}

// ---------- simulators.yaml ----------

function validateSimulator(s: unknown, file: string): asserts s is SimulatorConfig {
  const o = s as Record<string, unknown>;
  if (!isNonEmptyString(o?.id)) fail(file, '仿真系统缺少 id');
  if (!isNonEmptyString(o?.name)) fail(file, `仿真系统 ${o.id} 缺少 name`);
  if (!isNonEmptyString(o?.command)) fail(file, `仿真系统 ${o.id} 缺少 command`);
  if (!Array.isArray(o.args)) fail(file, `仿真系统 ${o.id} 的 args 必须是数组`);
  if (!isNonEmptyString(o?.tool)) fail(file, `仿真系统 ${o.id} 缺少 tool`);
  if (typeof o.weight !== 'number') fail(file, `仿真系统 ${o.id} 缺少 weight`);
}

export function loadSimulatorsConfig(filePath: string): SimulatorsConfig {
  const cfg = readYaml<Partial<SimulatorsConfig>>(filePath);
  const simulators = (cfg?.simulators ?? []) as SimulatorConfig[];
  if (!Array.isArray(simulators)) fail(filePath, '缺少 simulators 数组');
  const ids = new Set<string>();
  for (const s of simulators) {
    validateSimulator(s, filePath);
    if (ids.has(s.id)) fail(filePath, `仿真系统 id 重复: ${s.id}`);
    ids.add(s.id);
  }
  return { simulators };
}

// ---------- knowledge.yaml ----------

function validateDocument(d: unknown, file: string): asserts d is KnowledgeDocument {
  const o = d as Record<string, unknown>;
  if (!isNonEmptyString(o?.id)) fail(file, '文档缺少 id');
  if (!isNonEmptyString(o?.title)) fail(file, `文档 ${o.id} 缺少 title`);
  if (typeof o.content !== 'string') fail(file, `文档 ${o.id} 缺少 content`);
  if (typeof o.clearance !== 'number') fail(file, `文档 ${o.id} 缺少 clearance`);
  if (o.allow !== undefined && !Array.isArray(o.allow)) fail(file, `文档 ${o.id} 的 allow 必须是数组`);
  if (o.deny !== undefined && !Array.isArray(o.deny)) fail(file, `文档 ${o.id} 的 deny 必须是数组`);
}

export function loadKnowledgeDocuments(filePath: string): KnowledgeDocument[] {
  const cfg = readYaml<{ documents?: unknown }>(filePath);
  const documents = (cfg?.documents ?? []) as unknown[];
  if (!Array.isArray(documents)) fail(filePath, '缺少 documents 数组');
  const result: KnowledgeDocument[] = [];
  const ids = new Set<string>();
  for (const d of documents) {
    validateDocument(d, filePath);
    const doc = d as unknown as KnowledgeDocument;
    if (ids.has(doc.id)) fail(filePath, `文档 id 重复: ${doc.id}`);
    ids.add(doc.id);
    result.push({ ...doc, allow: doc.allow ?? [], deny: doc.deny ?? [] });
  }
  return result;
}
