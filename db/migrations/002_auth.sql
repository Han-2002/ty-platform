BEGIN;

CREATE TABLE IF NOT EXISTS auth_accounts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_params JSONB NOT NULL,
  password_updated_at BIGINT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until BIGINT
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  revoked_at BIGINT,
  last_seen_at BIGINT NOT NULL,
  user_agent TEXT,
  ip_address TEXT
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user
ON auth_sessions(user_id, expires_at);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_active
ON auth_sessions(token_hash, expires_at)
WHERE revoked_at IS NULL;

COMMIT;
