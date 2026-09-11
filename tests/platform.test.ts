import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import { Platform } from '../src/platform.js';
import { tmpDir, cleanup, writeMinimalConfig } from './helpers.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = join(here, '..');

describe('platform', () => {
  it('从示例配置加载并创建全部席位运行时，空闲主动推送', () => {
    const platform = new Platform({
      configDir: join(root, 'config'),
      skillsDir: join(root, 'skills'),
      runtimeDir: tmpDir(),
    });
    expect(platform.org.seats.size).toBe(4);
    expect(platform.runtimes.size).toBe(4);
    const proactive = platform.idleTickAll();
    expect(proactive.length).toBe(4);
    expect(proactive.every((m) => m.type === 'proactive')).toBe(true);
  });

  it('上传技能 zip 后同步登记进注册表', () => {
    const dir = tmpDir();
    try {
      const configDir = join(dir, 'config');
      const skillsDir = join(dir, 'skills');
      writeMinimalConfig(configDir, skillsDir);
      const platform = new Platform({ configDir, skillsDir, runtimeDir: join(dir, 'runtime') });
      expect(platform.registry.allSkills().length).toBe(0);
      const zip = zipSync({
        'SKILL.md': strToU8(
          '---\nname: fresh\ndescription: d\nmetadata:\n  clearance: 1\n  allowed_roles: [r]\n---\n\n# fresh\n',
        ),
      });
      const result = platform.installSkillZip(zip);
      expect(result.installed).toEqual(['fresh']);
      expect(platform.registry.hasSkill('fresh')).toBe(true);
    } finally {
      cleanup(dir);
    }
  });

  it('自进化只变更规程，不触碰权限配置', () => {
    const dir = tmpDir();
    try {
      const configDir = join(dir, 'config');
      const skillsDir = join(dir, 'skills');
      writeMinimalConfig(configDir, skillsDir);
      const seatsPath = join(configDir, 'seats.yaml');
      const skillsPath = join(configDir, 'skills.yaml');
      const beforeSeats = readFileSync(seatsPath, 'utf8');
      const beforeSkills = readFileSync(skillsPath, 'utf8');

      const platform = new Platform({ configDir, skillsDir, runtimeDir: join(dir, 'runtime') });
      const candidate = platform.evolution.extract('任务', 'evolved', '1. 步骤', 4);
      expect(platform.evolution.validate(candidate)).toBe(true);
      platform.evolution.solidify(candidate);

      expect(readFileSync(seatsPath, 'utf8')).toBe(beforeSeats);
      expect(readFileSync(skillsPath, 'utf8')).toBe(beforeSkills);
      expect(platform.org.getRole('r').clearance).toBe(3);
      expect(platform.org.getRole('r').can_dispatch).toBe(true);
    } finally {
      cleanup(dir);
    }
  });
});
