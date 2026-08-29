ALTER TABLE users ADD COLUMN qq_id TEXT;
ALTER TABLE users ADD COLUMN qq_nickname TEXT;
ALTER TABLE users ADD COLUMN qq_bound_at TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_qq_id ON users(qq_id) WHERE qq_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS qq_login_challenges (
  session_id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK (purpose IN ('login', 'bind')),
  requester_user_id INTEGER,
  qq_id TEXT,
  qq_nickname TEXT,
  avatar_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  verified_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_qq_login_challenges_code ON qq_login_challenges(code);
CREATE INDEX IF NOT EXISTS idx_qq_login_challenges_expires ON qq_login_challenges(expires_at);
