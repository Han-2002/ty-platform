import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import type { PostgresAuthRepository } from './postgresAuthRepository.js';

const scrypt = promisify(scryptCallback);

export interface AuthPrincipal {
  sessionId: string;
  userId: string;
  userName: string;
  expiresAt: number;
}

export interface LoginResult extends AuthPrincipal {
  token: string;
}

export interface LoginMetadata {
  userAgent?: string;
  ipAddress?: string;
}

const PASSWORD_PARAMS = {
  algorithm: 'scrypt',
  N: 16384,
  r: 8,
  p: 1,
  keylen: 64,
} as const;

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function derivePassword(password: string, salt: string): Promise<Buffer> {
  return (await scrypt(password, salt, PASSWORD_PARAMS.keylen, {
    N: PASSWORD_PARAMS.N,
    r: PASSWORD_PARAMS.r,
    p: PASSWORD_PARAMS.p,
    maxmem: 64 * 1024 * 1024,
  })) as Buffer;
}

export class AuthenticationError extends Error {
  readonly code = 'AUTHENTICATION_FAILED';
}

export class AccountLockedError extends Error {
  readonly code = 'ACCOUNT_LOCKED';
}

export class AuthService {
  constructor(
    private readonly repo: PostgresAuthRepository,
    private readonly sessionTtlMs = 8 * 60 * 60_000,
  ) {}

  async setPassword(userId: string, password: string): Promise<void> {
    if (password.length < 10) {
      throw new Error('密码至少 10 个字符');
    }

    const salt = randomBytes(16).toString('hex');
    const derived = await derivePassword(password, salt);

    await this.repo.upsertAccount({
      userId,
      passwordSalt: salt,
      passwordHash: derived.toString('hex'),
      passwordParams: PASSWORD_PARAMS,
      passwordUpdatedAt: Date.now(),
    });

    // 改密码后旧 Session 全失效。
    await this.repo.revokeAllForUser(userId);
  }

  async login(
    userId: string,
    password: string,
    metadata: LoginMetadata = {},
  ): Promise<LoginResult> {
    const account = await this.repo.getAccount(userId);

    // 不区分“用户不存在”和“密码错误”，避免账号枚举。
    if (!account) {
      await this.fakePasswordWork(password);
      throw new AuthenticationError('用户名或密码错误');
    }

    if (account.lockedUntil && account.lockedUntil > Date.now()) {
      throw new AccountLockedError('登录失败次数过多，请稍后再试');
    }

    const actual = await derivePassword(password, account.passwordSalt);
    const expected = Buffer.from(account.passwordHash, 'hex');
    const matches =
      expected.length === actual.length && timingSafeEqual(expected, actual);

    if (!matches) {
      await this.repo.registerFailedLogin(userId);
      throw new AuthenticationError('用户名或密码错误');
    }

    await this.repo.resetFailedLogin(userId);

    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    const sessionId = randomUUID();
    const expiresAt = now + this.sessionTtlMs;

    await this.repo.createSession({
      id: sessionId,
      userId,
      tokenHash: tokenHash(token),
      createdAt: now,
      expiresAt,
      lastSeenAt: now,
      userAgent: metadata.userAgent,
      ipAddress: metadata.ipAddress,
    });

    const session = await this.repo.getActiveSessionByTokenHash(tokenHash(token));
    if (!session) throw new Error('Session 创建后无法读取');

    return {
      token,
      sessionId,
      userId: session.userId,
      userName: session.userName,
      expiresAt,
    };
  }


  /**
   * Local demo only: issue a normal server session for a real assigned user.
   */
  async demoLogin(
    userId: string,
    metadata: LoginMetadata = {},
  ): Promise<LoginResult> {
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    const sessionId = randomUUID();
    const expiresAt = now + this.sessionTtlMs;

    await this.repo.createSession({
      id: sessionId,
      userId,
      tokenHash: tokenHash(token),
      createdAt: now,
      expiresAt,
      lastSeenAt: now,
      userAgent: metadata.userAgent,
      ipAddress: metadata.ipAddress,
    });

    const session = await this.repo.getActiveSessionByTokenHash(tokenHash(token));
    if (!session) {
      throw new Error(`Demo Session 创建失败：用户 ${userId} 不存在或已停用`);
    }

    return {
      token,
      sessionId,
      userId: session.userId,
      userName: session.userName,
      expiresAt,
    };
  }

  async authenticate(token: string): Promise<AuthPrincipal> {
    if (!token) throw new AuthenticationError('缺少登录凭证');

    const session = await this.repo.getActiveSessionByTokenHash(tokenHash(token));
    if (!session) throw new AuthenticationError('Session 无效或已过期');

    await this.repo.touchSession(session.id);

    return {
      sessionId: session.id,
      userId: session.userId,
      userName: session.userName,
      expiresAt: session.expiresAt,
    };
  }

  async logout(token: string): Promise<void> {
    if (!token) return;
    await this.repo.revokeSessionByTokenHash(tokenHash(token));
  }

  async purgeExpiredSessions(): Promise<number> {
    return this.repo.purgeExpiredSessions();
  }

  private async fakePasswordWork(password: string): Promise<void> {
    const salt = '00000000000000000000000000000000';
    await derivePassword(password || 'invalid-password', salt);
  }
}
