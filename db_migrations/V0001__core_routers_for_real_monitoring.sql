CREATE TABLE IF NOT EXISTS core_routers (
    id SERIAL PRIMARY KEY,
    router_id VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    vendor VARCHAR(64) DEFAULT 'MikroTik',
    model VARCHAR(128),
    serial VARCHAR(128),
    firmware VARCHAR(64),
    location VARCHAR(255),
    role VARCHAR(255),
    photo TEXT,
    mgmt_ip VARCHAR(64),
    api_token VARCHAR(128) UNIQUE NOT NULL,
    last_seen TIMESTAMP,
    is_real BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core_router_metrics (
    id BIGSERIAL PRIMARY KEY,
    router_id VARCHAR(64) NOT NULL,
    ts TIMESTAMP DEFAULT NOW(),
    cpu_load INT,
    cpu_temperature INT,
    board_temperature INT,
    memory_total_kb BIGINT,
    memory_used_kb BIGINT,
    memory_pct NUMERIC(5,2),
    storage_pct NUMERIC(5,2),
    voltage_mv INT,
    uptime_seconds BIGINT,
    bgp_peers INT,
    ospf_neighbors INT,
    routes_ipv4 INT,
    routes_ipv6 INT,
    raw JSONB
);

CREATE INDEX IF NOT EXISTS idx_core_metrics_router_ts ON core_router_metrics(router_id, ts DESC);

CREATE TABLE IF NOT EXISTS core_router_ports (
    id SERIAL PRIMARY KEY,
    router_id VARCHAR(64) NOT NULL,
    port_index INT NOT NULL,
    name VARCHAR(64) NOT NULL,
    type VARCHAR(32),
    speed_mbps INT,
    status VARCHAR(16),
    description TEXT,
    is_uplink BOOLEAN DEFAULT FALSE,
    mac VARCHAR(64),
    last_traffic_in BIGINT DEFAULT 0,
    last_traffic_out BIGINT DEFAULT 0,
    last_errors_in BIGINT DEFAULT 0,
    last_errors_out BIGINT DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(router_id, port_index)
);

CREATE TABLE IF NOT EXISTS core_router_traffic_history (
    id BIGSERIAL PRIMARY KEY,
    router_id VARCHAR(64) NOT NULL,
    port_index INT,
    ts TIMESTAMP DEFAULT NOW(),
    bytes_in BIGINT,
    bytes_out BIGINT,
    bps_in BIGINT,
    bps_out BIGINT
);

CREATE INDEX IF NOT EXISTS idx_traffic_router_ts ON core_router_traffic_history(router_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_traffic_port ON core_router_traffic_history(router_id, port_index, ts DESC);

INSERT INTO core_routers (router_id, name, vendor, model, location, role, photo, mgmt_ip, api_token, is_real)
VALUES (
    'r4-arttelecom',
    'R4 ArtTelecom',
    'MikroTik',
    'CCR (определится автоматически)',
    'ArtTelecom Core',
    'Магистральный маршрутизатор · BGP/OSPF',
    'https://cdn.poehali.dev/projects/4e28f997-118c-46af-9ba3-05afe46c8699/files/63330f23-43fd-46d3-89b1-914eaa853751.jpg',
    '83.239.227.75',
    'rt_a8f5d2c91e7b4f8a3e6d9c2b1a8f5d2c',
    TRUE
)
ON CONFLICT (router_id) DO NOTHING;