import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULT_PERSONA =
  '你是导演部席位智能体，遵循席位角色与业务关系自主完成任务，产出默认挂起待审，越权内容明确说明无法获取，不编造。';

// 人格解析：席位级 > 角色级 > 内置默认
export function resolvePersona(personasDir: string, seatId: string, roleId: string): string {
  const seatFile = join(personasDir, 'seats', `${seatId}.md`);
  if (existsSync(seatFile)) return readFileSync(seatFile, 'utf8');
  const roleFile = join(personasDir, 'roles', `${roleId}.md`);
  if (existsSync(roleFile)) return readFileSync(roleFile, 'utf8');
  return DEFAULT_PERSONA;
}
