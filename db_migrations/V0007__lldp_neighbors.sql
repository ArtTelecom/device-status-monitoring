-- LLDP/CDP-соседи, отправленные агентом
CREATE TABLE IF NOT EXISTS lldp_neighbors (
  id BIGSERIAL PRIMARY KEY,
  device_id INTEGER NOT NULL,
  local_if_index INTEGER DEFAULT 0,
  local_if_name VARCHAR(128) DEFAULT '',
  remote_chassis_id VARCHAR(64) DEFAULT '',
  remote_port_id VARCHAR(128) DEFAULT '',
  remote_port_descr VARCHAR(255) DEFAULT '',
  remote_sys_name VARCHAR(255) DEFAULT '',
  remote_mgmt_ip VARCHAR(45) DEFAULT '',
  protocol VARCHAR(16) DEFAULT 'lldp',
  ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(device_id, local_if_index, remote_chassis_id, remote_port_id)
);
CREATE INDEX IF NOT EXISTS idx_lldp_device ON lldp_neighbors(device_id);
CREATE INDEX IF NOT EXISTS idx_lldp_chassis ON lldp_neighbors(remote_chassis_id);
CREATE INDEX IF NOT EXISTS idx_lldp_mgmt ON lldp_neighbors(remote_mgmt_ip);