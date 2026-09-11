// 统一错误类型

export class PermissionDenied extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermissionDenied';
  }
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export class SkillInstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillInstallError';
  }
}

export class SimulationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SimulationError';
  }
}
