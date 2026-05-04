-- ONU привязаны к OLT (parent_id ссылается на discovered_devices.id)
ALTER TABLE discovered_devices ADD COLUMN IF NOT EXISTS parent_id INTEGER DEFAULT 0;
ALTER TABLE discovered_devices ADD COLUMN IF NOT EXISTS onu_index INTEGER DEFAULT 0;
ALTER TABLE discovered_devices ADD COLUMN IF NOT EXISTS olt_port VARCHAR(32) DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_discovered_parent ON discovered_devices(parent_id);

-- Сигналы оптики для ONU
CREATE TABLE IF NOT EXISTS onu_signals (
  device_id INTEGER PRIMARY KEY,
  rx_power_dbm DOUBLE PRECISION DEFAULT 0,
  tx_power_dbm DOUBLE PRECISION DEFAULT 0,
  olt_rx_dbm DOUBLE PRECISION DEFAULT 0,
  temp_c DOUBLE PRECISION DEFAULT 0,
  voltage DOUBLE PRECISION DEFAULT 0,
  distance_m INTEGER DEFAULT 0,
  online_status VARCHAR(16) DEFAULT 'online',
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);