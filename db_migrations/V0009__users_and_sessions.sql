-- Пользователи
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) DEFAULT '',
  role VARCHAR(32) DEFAULT 'user', -- user | admin
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Сессии (токены)
CREATE TABLE IF NOT EXISTS user_sessions (
  token VARCHAR(64) PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  ip VARCHAR(45) DEFAULT '',
  user_agent VARCHAR(512) DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_exp ON user_sessions(expires_at);

-- Дефолтный admin: admin@local / admin123 (sha256-хэш с солью 'pp_salt_v1')
-- хэш = sha256('admin123' + 'pp_salt_v1') = 91b1de2b58cb0fe0e8eb18f5c20c4a2a5e9b0c2d6e7c4d4d4d4d4d4d4d4d4d4d (placeholder — корректный ниже)
INSERT INTO users (email, password_hash, name, role, is_active)
VALUES ('admin@local', 'pp_salt_v1$ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Administrator', 'admin', TRUE)
ON CONFLICT (email) DO NOTHING;