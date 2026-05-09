-- Постановка команд агенту office-1 на самообновление до v6 и пересканирование
INSERT INTO agent_commands (agent_id, command, payload, status)
VALUES
  ('office-1', 'self_update', '{}', 'pending'),
  ('office-1', 'rescan_now', '{}', 'pending');
