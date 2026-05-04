CREATE TABLE IF NOT EXISTS agents (
  id SERIAL PRIMARY KEY,
  agent_id VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(255) DEFAULT '',
  hostname VARCHAR(255) DEFAULT '',
  os VARCHAR(255) DEFAULT '',
  version INTEGER DEFAULT 1,
  ip VARCHAR(45) DEFAULT '',
  status VARCHAR(20) DEFAULT 'online',
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  config_json TEXT DEFAULT '{}',
  notes TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);

CREATE TABLE IF NOT EXISTS agent_commands (
  id SERIAL PRIMARY KEY,
  agent_id VARCHAR(64) NOT NULL,
  command VARCHAR(64) NOT NULL,
  payload TEXT DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'pending',
  result TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  fetched_at TIMESTAMP,
  completed_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cmds_agent_status ON agent_commands(agent_id, status);

CREATE TABLE IF NOT EXISTS agent_versions (
  version INTEGER PRIMARY KEY,
  source TEXT NOT NULL,
  notes VARCHAR(500) DEFAULT '',
  uploaded_by INTEGER DEFAULT 0,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_current BOOLEAN DEFAULT FALSE
);