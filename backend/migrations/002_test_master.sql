-- Тестовый мастер для разработки (выполнять только в dev-среде!)
-- Токен "test" зашифрован: подставить реальный зашифрованный токен перед использованием

-- Пример тестовых данных (требует заменить bot_token на реально зашифрованный):
-- INSERT INTO masters (telegram_id, username, bot_token, bot_username, slug, plan)
-- VALUES (123456789, 'test_master', '<encrypted_token>', 'test_beauty_bot', 'test_master', 'free');

-- INSERT INTO master_profiles (master_id, display_name, specializations, address, work_hours, gradient)
-- VALUES (
--   (SELECT id FROM masters WHERE slug = 'test_master'),
--   'Тестовый Мастер',
--   'Маникюр · Педикюр',
--   'г. Гомель, ул. Тестовая 1',
--   'Пн–Сб 10:00–19:00',
--   'linear-gradient(135deg, #f9a8d4, #a78bfa)'
-- );

-- INSERT INTO master_schedules (master_id, day_of_week, start_time, end_time, is_working)
-- SELECT id, generate_series(1,6), '10:00', '19:00', true FROM masters WHERE slug = 'test_master';

-- INSERT INTO master_schedules (master_id, day_of_week, start_time, end_time, is_working)
-- SELECT id, 0, '10:00', '19:00', false FROM masters WHERE slug = 'test_master';

-- INSERT INTO service_categories (master_id, label, emoji, sort_order)
-- SELECT id, 'Маникюр', '💅', 1 FROM masters WHERE slug = 'test_master';

-- INSERT INTO services (master_id, title, description, price, duration_min, emoji, category_id)
-- SELECT m.id, 'Маникюр классический', 'Обрезной маникюр с покрытием', 25.00, 60, '💅',
--        (SELECT id FROM service_categories WHERE master_id = m.id LIMIT 1)
-- FROM masters m WHERE m.slug = 'test_master';
