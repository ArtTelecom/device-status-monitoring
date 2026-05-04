-- Сбросим placeholder-хэш на маркер; auth.handler() при первом запросе пересчитает корректный
UPDATE users SET password_hash = 'NEEDS_RESET' WHERE email = 'admin@local';