// LLM Provider 抽象：未绑定具体 provider 前用 mock 保证断言可复跑
export interface LLMProvider {
  complete(prompt: string): Promise<string>;
}

export class MockLLMProvider implements LLMProvider {
  private readonly latencyMs: number;

  constructor(latencyMs = 0) {
    this.latencyMs = latencyMs;
  }

  async complete(prompt: string): Promise<string> {
    if (this.latencyMs > 0) {
      await new Promise((r) => setTimeout(r, this.latencyMs));
    }
    return `[mock 执行] ${prompt.trim()}`;
  }
}
