import type { Pool } from 'pg';

export interface AuthAccountRow {
  userId: string;
  passwordSalt: string;
  passwordHash: string;
  passwordParams: Record<string, unknown>;
  passwordUpdatedAt: number;
  failedAttempts: number;
  lockedUntil?: number;
}

export interface AuthSessionRow {
  id: string;
  userId: string;
  userName: string;
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
  revokedAt?: number;
  lastSeenAt: number;
  userAgent?: string;
  ipAddress?: string;
}

export class PostgresAuthRepository {
  constructor(private readonly db: Pool) {}

  async upsertAccount(input: {
    userId: string;
    passwordSalt: string;
    passwordHash: string;
    passwordParams: Record<string, unknown>;
    passwordUpdatedAt: number;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO auth_accounts(
        user_id,password_salt,password_hash,password_params,password_updated_at,
        failed_attempts,locked_until
      ) VALUES($1,$2,$3,$4::jsonb,$5,0,NULL)
      ON CONFLICT(user_id) DO UPDATE SET
        password_salt=EXCLUDED.password_salt,
        password_hash=EXCLUDED.password_hash,
        password_params=EXCLUDED.password_params,
        password_updated_at=EXCLUDED.password_updated_at,
        failed_attempts=0,
        locked_until=NULL`,
      [
        input.userId,
        input.passwordSalt,
        input.passwordHash,
        JSON.stringify(input.passwordParams),
        input.passwordUpdatedAt,
      ],
    );
  }

  async getAccount(userId: string): Promise<AuthAccountRow | undefined> {
    const { rows } = await this.db.query(
      `SELECT user_id,password_salt,password_hash,password_params,password_updated_at,
              failed_attempts,locked_until
       FROM auth_accounts
       WHERE user_id=$1`,
      [userId],
    );
    const r = rows[0];
    if (!r) return undefined;
    return {
      userId: r.user_id,
      passwordSalt: r.password_salt,
      passwordHash: r.password_hash,
      passwordParams: r.password_params ?? {},
      passwordUpdatedAt: Number(r.password_updated_at),
      failedAttempts: r.failed_attempts,
      lockedUntil: r.locked_until == null ? undefined : Number(r.locked_until),
    };
  }

  async registerFailedLogin(
    userId: string,
    maxAttempts = 5,
    lockMs = 15 * 60_000,
  ): Promise<void> {
    await this.db.query(
      `UPDATE auth_accounts
       SET failed_attempts=failed_attempts+1,
           locked_until=CASE
             WHEN failed_attempts+1 >= $2 THEN $3
             ELSE locked_until
           END
       WHERE user_id=$1`,
      [userId, maxAttempts, Date.now() + lockMs],
    );
  }

  async resetFailedLogin(userId: string): Promise<void> {
    await this.db.query(
      `UPDATE auth_accounts
       SET failed_attempts=0,locked_until=NULL
       WHERE user_id=$1`,
      [userId],
    );
  }

  async createSession(input: {
    id: string;
    userId: string;
    tokenHash: string;
    createdAt: number;
    expiresAt: number;
    lastSeenAt: number;
    userAgent?: string;
    ipAddress?: string;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO auth_sessions(
        id,user_id,token_hash,created_at,expires_at,revoked_at,last_seen_at,user_agent,ip_address
      ) VALUES($1,$2,$3,$4,$5,NULL,$6,$7,$8)`,
      [
        input.id,
        input.userId,
        input.tokenHash,
        input.createdAt,
        input.expiresAt,
        input.lastSeenAt,
        input.userAgent ?? null,
        input.ipAddress ?? null,
      ],
    );
  }

  async getActiveSessionByTokenHash(tokenHash: string): Promise<AuthSessionRow | undefined> {
    const { rows } = await this.db.query(
      `SELECT s.id,s.user_id,u.name AS user_name,s.token_hash,s.created_at,s.expires_at,
              s.revoked_at,s.last_seen_at,s.user_agent,s.ip_address
       FROM auth_sessions s
       JOIN users u ON u.id=s.user_id
       WHERE s.token_hash=$1
         AND s.revoked_at IS NULL
         AND s.expires_at>$2
         AND u.status='active'`,
      [tokenHash, Date.now()],
    );
    const r = rows[0];
    if (!r) return undefined;
    return {
      id: r.id,
      userId: r.user_id,
      userName: r.user_name,
      tokenHash: r.token_hash,
      createdAt: Number(r.created_at),
      expiresAt: Number(r.expires_at),
      revokedAt: r.revoked_at == null ? undefined : Number(r.revoked_at),
      lastSeenAt: Number(r.last_seen_at),
      userAgent: r.user_agent ?? undefined,
      ipAddress: r.ip_address ?? undefined,
    };
  }

  async touchSession(sessionId: string): Promise<void> {
    await this.db.query(
      `UPDATE auth_sessions SET last_seen_at=$2 WHERE id=$1`,
      [sessionId, Date.now()],
    );
  }

  async revokeSessionByTokenHash(tokenHash: string): Promise<void> {
    await this.db.query(
      `UPDATE auth_sessions
       SET revoked_at=COALESCE(revoked_at,$2)
       WHERE token_hash=$1`,
      [tokenHash, Date.now()],
    );
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.db.query(
      `UPDATE auth_sessions
       SET revoked_at=COALESCE(revoked_at,$2)
       WHERE user_id=$1`,
      [userId, Date.now()],
    );
  }

  async purgeExpiredSessions(): Promise<number> {
    const result = await this.db.query(
      `DELETE FROM auth_sessions
       WHERE expires_at<$1 OR (revoked_at IS NOT NULL AND revoked_at<$2)`,
      [Date.now() - 24 * 60 * 60_000, Date.now() - 7 * 24 * 60 * 60_000],
    );
    return result.rowCount ?? 0;
  }
}
