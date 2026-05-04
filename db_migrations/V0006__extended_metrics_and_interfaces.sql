-- Расширяем discovered_devices метриками
ALTER TABLE discovered_devices ADD COLUMN IF NOT EXISTS cpu_load INTEGER DEFAULT 0;
ALTER TABLE discovered_devices ADD COLUMN IF NOT EXISTS mem_used INTEGER DEFAULT 0;
ALTER TABLE discovered_devices ADD COLUMN IF NOT EXISTS mem_total INTEGER DEFAULT 0;
ALTER TABLE discovered_devices ADD COLUMN IF NOT EXISTS ping_loss INTEGER DEFAULT 0;
ALTER TABLE discovered_devices ADD COLUMN IF NOT EXISTS ping_rtt_ms INTEGER DEFAULT 0;
ALTER TABLE discovered_devices ADD COLUMN IF NOT EXISTS contact VARCHAR(255) DEFAULT '';
ALTER TABLE discovered_devices ADD COLUMN IF NOT EXISTS location VARCHAR(255) DEFAULT '';
ALTER TABLE discovered_devices ADD COLUMN IF NOT EXISTS interfaces_json TEXT DEFAULT '[]';

-- История метрик для графиков
CREATE TABLE IF NOT EXISTS discovered_metrics (
  id BIGSERIAL PRIMARY KEY,
  device_id INTEGER NOT NULL,
  ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  cpu_load INTEGER DEFAULT 0,
  mem_pct INTEGER DEFAULT 0,
  ping_rtt_ms INTEGER DEFAULT 0,
  ping_loss INTEGER DEFAULT 0,
  total_in_bps BIGINT DEFAULT 0,
  total_out_bps BIGINT DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_metrics_device_ts ON discovered_metrics(device_id, ts DESC);

-- Снимок счётчиков для расчёта скорости (delta / time)
CREATE TABLE IF NOT EXISTS interface_counters (
  id BIGSERIAL PRIMARY KEY,
  device_id INTEGER NOT NULL,
  if_index INTEGER NOT NULL,
  if_name VARCHAR(128) DEFAULT '',
  in_octets BIGINT DEFAULT 0,
  out_octets BIGINT DEFAULT 0,
  in_bps BIGINT DEFAULT 0,
  out_bps BIGINT DEFAULT 0,
  speed_mbps INTEGER DEFAULT 0,
  oper_status VARCHAR(16) DEFAULT 'up',
  ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(device_id, if_index)
);
CREATE INDEX IF NOT EXISTS idx_counters_device ON interface_counters(device_id);

-- Привязка линий топологии к реальным устройствам discovered (для авто-пульсации)
ALTER TABLE map_links ADD COLUMN IF NOT EXISTS source_discovered_id INTEGER DEFAULT 0;
ALTER TABLE map_links ADD COLUMN IF NOT EXISTS target_discovered_id INTEGER DEFAULT 0;
ALTER TABLE map_links ADD COLUMN IF NOT EXISTS source_if_index INTEGER DEFAULT 0;
ALTER TABLE map_links ADD COLUMN IF NOT EXISTS target_if_index INTEGER DEFAULT 0;
ALTER TABLE map_links ADD COLUMN IF NOT EXISTS auto_traffic BOOLEAN DEFAULT FALSE;