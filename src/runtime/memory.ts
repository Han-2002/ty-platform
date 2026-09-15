import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { MemoryEntry, MemoryKind } from '../types.js';

// 三层记忆：工作记忆 / 长期记忆 / 情景记忆，支持落盘与恢复
export class Memory {
  private entries: MemoryEntry[] = [];

  add(kind: MemoryKind, content: string): string {
    const entry: MemoryEntry = { id: randomUUID(), kind, content, createdAt: Date.now() };
    this.entries.push(entry);
    return entry.id;
  }

  recall(kind?: MemoryKind): MemoryEntry[] {
    return kind ? this.entries.filter((e) => e.kind === kind) : [...this.entries];
  }

  get size(): number {
    return this.entries.length;
  }

  // 落盘到 <dir>/memory.json
  persist(dir: string): void {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'memory.json'), JSON.stringify(this.entries, null, 2), 'utf8');
  }

  // 从 <dir>/memory.json 恢复
  restore(dir: string): void {
    const file = join(dir, 'memory.json');
    if (!existsSync(file)) return;
    this.entries = JSON.parse(readFileSync(file, 'utf8')) as MemoryEntry[];
  }
}
