import { describe, expect, it } from 'vitest';

describe('final-mvp-smoke', () => {
  it('final MVP files are wired by compile-time imports', async () => {
    const mod = await import('../src/collab/persistentChatService.js');
    expect(mod.PersistentChatService).toBeDefined();
    const auth = await import('../src/auth/authService.js');
    expect(auth.AuthService).toBeDefined();
  });
});
