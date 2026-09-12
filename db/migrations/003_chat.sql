BEGIN;

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('activity','group','direct')),
  created_by_seat_id TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  seat_id TEXT NOT NULL,
  PRIMARY KEY (conversation_id, seat_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  activity_id TEXT NOT NULL,
  sender_user_id TEXT NOT NULL REFERENCES users(id),
  sender_seat_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_time
ON chat_messages(conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_conversations_activity
ON conversations(activity_id, created_at);

COMMIT;
