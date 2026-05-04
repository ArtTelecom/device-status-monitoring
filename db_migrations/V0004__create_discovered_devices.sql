CREATE TABLE IF NOT EXISTS discovered_devices (
  id SERIAL PRIMARY KEY,
  ip VARCHAR(45) NOT NULL UNIQUE,
  mac VARCHAR(32) DEFAULT '',
  hostname VARCHAR(255) DEFAULT '',
  vendor VARCHAR(255) DEFAULT '',
  model VARCHAR(255) DEFAULT '',
  sys_descr TEXT DEFAULT '',
  uptime VARCHAR(64) DEFAULT '',
  status VARCHAR(20) DEFAULT 'online',
  agent_id VARCHAR(64) DEFAULT '',
  first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  on_map BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_discovered_status ON discovered_devices(status);
CREATE INDEX IF NOT EXISTS idx_discovered_lastseen ON discovered_devices(last_seen);