import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';

export interface McpClientOptions {
  command: string;
  args: string[];
  timeoutMs?: number;
}

// 最小 MCP 客户端：JSON-RPC 2.0 over stdio
export class McpClient {
  private child!: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private readonly timeoutMs: number;

  constructor(private readonly opts: McpClientOptions) {
    this.timeoutMs = opts.timeoutMs ?? 5000;
  }

  async connect(): Promise<void> {
    this.child = spawn(this.opts.command, this.opts.args, { stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.on('error', (err) => {
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
    });
    const rl = createInterface({ input: this.child.stdout });
    rl.on('line', (line) => this.handleLine(line));

    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'wargaming-platform', version: '0.1.0' },
    });
    this.notify('notifications/initialized', {});
  }

  private handleLine(line: string): void {
    const l = line.trim();
    if (!l) return;
    let msg: { id?: number; result?: unknown; error?: { message?: string } };
    try {
      msg = JSON.parse(l);
    } catch {
      return;
    }
    if (msg.id != null && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message ?? 'MCP 错误'));
      else p.resolve(msg.result);
    }
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP 请求超时: ${method}`));
        }
      }, this.timeoutMs);
      timer.unref?.();
    });
  }

  private notify(method: string, params: unknown): void {
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const result = (await this.request('tools/call', { name, arguments: args })) as {
      content?: { type: string; text?: string }[];
    };
    if (Array.isArray(result?.content)) {
      const text = result.content.find((c) => c.type === 'text')?.text;
      if (text) {
        return JSON.parse(text);
      }
    }
    return result;
  }

  dispose(): void {
    try {
      this.child?.kill();
    } catch {
      /* 忽略清理异常 */
    }
  }
}
