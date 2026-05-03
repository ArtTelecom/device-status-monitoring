-- Настройки портов: пользовательское имя, роль (uplink/downlink/lan/management/dmz/etc), описание
CREATE TABLE IF NOT EXISTS port_settings (
    id SERIAL PRIMARY KEY,
    router_id VARCHAR(64) NOT NULL,
    port_name VARCHAR(64) NOT NULL,
    custom_name VARCHAR(128),
    role VARCHAR(32) DEFAULT 'lan',
    description TEXT,
    color VARCHAR(16),
    is_uplink BOOLEAN DEFAULT FALSE,
    is_downlink BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(router_id, port_name)
);

-- История счётчиков по портам (для расчёта потребления за период)
CREATE TABLE IF NOT EXISTS port_traffic_samples (
    id BIGSERIAL PRIMARY KEY,
    router_id VARCHAR(64) NOT NULL,
    port_name VARCHAR(64) NOT NULL,
    ts TIMESTAMP DEFAULT NOW(),
    rx_bytes BIGINT NOT NULL,
    tx_bytes BIGINT NOT NULL,
    rx_bps BIGINT DEFAULT 0,
    tx_bps BIGINT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_port_samples_router_port_ts ON port_traffic_samples(router_id, port_name, ts DESC);
CREATE INDEX IF NOT EXISTS idx_port_samples_ts ON port_traffic_samples(ts DESC);

-- Пиковые скорости (rolling) — обновляются с каждым опросом
CREATE TABLE IF NOT EXISTS port_peak_speeds (
    id SERIAL PRIMARY KEY,
    router_id VARCHAR(64) NOT NULL,
    port_name VARCHAR(64) NOT NULL,
    period VARCHAR(16) NOT NULL,
    peak_rx_bps BIGINT DEFAULT 0,
    peak_tx_bps BIGINT DEFAULT 0,
    peak_rx_at TIMESTAMP,
    peak_tx_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(router_id, port_name, period)
);

-- Настройки роутера: пользовательское имя и роль
CREATE TABLE IF NOT EXISTS router_settings (
    id SERIAL PRIMARY KEY,
    router_id VARCHAR(64) UNIQUE NOT NULL,
    custom_name VARCHAR(128),
    role VARCHAR(255),
    location VARCHAR(255),
    photo_url TEXT,
    auto_photo BOOLEAN DEFAULT TRUE,
    notes TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Дефолтные строки для нашего реального R4
INSERT INTO router_settings (router_id, custom_name, role, location, auto_photo)
VALUES ('r4-arttelecom', 'R4 ArtTelecom', 'Магистральный маршрутизатор · BGP/OSPF', 'ArtTelecom Core', TRUE)
ON CONFLICT (router_id) DO NOTHING;

INSERT INTO port_settings (router_id, port_name, role, is_uplink, is_downlink, description) VALUES
    ('r4-arttelecom', 'ether1', 'uplink', TRUE, FALSE, 'Магистральный канал → провайдер 1 (RT-1)'),
    ('r4-arttelecom', 'ether2', 'downlink', FALSE, TRUE, 'Отдача абонентам → OLT GEPON 4 PON'),
    ('r4-arttelecom', 'ether3', 'uplink', TRUE, FALSE, 'Магистральный канал → провайдер 2 (RT-2)'),
    ('r4-arttelecom', 'ether7', 'downlink', FALSE, TRUE, 'Отдача абонентам')
ON CONFLICT (router_id, port_name) DO NOTHING;