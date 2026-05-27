-- Multi-tenant beauty platform schema

/* ══════════════════════════════════════════════════
   МАСТЕРА И НАСТРОЙКИ
   ══════════════════════════════════════════════════ */

CREATE TABLE masters (
  id                    BIGSERIAL PRIMARY KEY,
  telegram_id           BIGINT NOT NULL UNIQUE,
  username              TEXT,
  bot_token             TEXT NOT NULL UNIQUE,        -- AES-256-GCM encrypted
  bot_username          TEXT,
  slug                  TEXT NOT NULL UNIQUE,

  plan                  TEXT NOT NULL DEFAULT 'free', -- 'free' | 'pro'
  plan_expires_at       TIMESTAMPTZ,

  is_active             BOOLEAN DEFAULT true,
  onboarding_step       TEXT DEFAULT 'awaiting_token',
  created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE master_profiles (
  master_id         BIGINT PRIMARY KEY REFERENCES masters(id) ON DELETE CASCADE,
  display_name      TEXT NOT NULL,
  name_dative       TEXT,
  bio               TEXT,
  bio_short         TEXT,
  specializations   TEXT,
  experience_years  SMALLINT,
  works_count       INTEGER DEFAULT 0,
  rating            NUMERIC(3,1) DEFAULT 5.0,
  reviews_count     INTEGER DEFAULT 0,

  instagram         TEXT,
  address           TEXT,
  work_hours        TEXT,

  photo_file_id     TEXT,
  photo_url         TEXT,
  gradient          TEXT
);

CREATE TABLE master_themes (
  master_id              BIGINT PRIMARY KEY REFERENCES masters(id) ON DELETE CASCADE,
  color_scheme           TEXT DEFAULT 'default',
  logo_file_id           TEXT,
  logo_url               TEXT,
  show_platform_branding BOOLEAN DEFAULT true
);

CREATE TABLE master_schedules (
  id            SERIAL PRIMARY KEY,
  master_id     BIGINT NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  day_of_week   SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  is_working    BOOLEAN DEFAULT true,
  UNIQUE (master_id, day_of_week)
);

CREATE TABLE blocked_slots (
  id            SERIAL PRIMARY KEY,
  master_id     BIGINT NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  blocked_date  DATE NOT NULL,
  blocked_time  TIME,
  reason        TEXT,
  UNIQUE (master_id, blocked_date, blocked_time)
);

/* ══════════════════════════════════════════════════
   УСЛУГИ
   ══════════════════════════════════════════════════ */

CREATE TABLE service_categories (
  id          SERIAL PRIMARY KEY,
  master_id   BIGINT NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  emoji       TEXT,
  sort_order  SMALLINT DEFAULT 0
);

CREATE TABLE services (
  id            BIGSERIAL PRIMARY KEY,
  master_id     BIGINT NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  category_id   INTEGER REFERENCES service_categories(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  price         NUMERIC(10,2) NOT NULL,
  duration_min  SMALLINT NOT NULL,
  emoji         TEXT,
  sort_order    SMALLINT DEFAULT 0,
  is_active     BOOLEAN DEFAULT true,
  photos        JSONB DEFAULT '[]',
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_services_master ON services (master_id) WHERE is_active = true;

/* ══════════════════════════════════════════════════
   ЗАПИСИ КЛИЕНТОВ
   ══════════════════════════════════════════════════ */

CREATE TABLE bookings (
  id                    BIGSERIAL PRIMARY KEY,
  master_id             BIGINT NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  client_telegram_id    BIGINT NOT NULL,
  client_name           TEXT,
  service_id            BIGINT REFERENCES services(id) ON DELETE SET NULL,
  booking_date          DATE NOT NULL,
  booking_time          TIME NOT NULL,
  status                TEXT NOT NULL DEFAULT 'confirmed',
  reminder_24h_sent     BOOLEAN DEFAULT false,
  reminder_2h_sent      BOOLEAN DEFAULT false,
  created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX bookings_no_double_booking
  ON bookings (master_id, booking_date, booking_time)
  WHERE status = 'confirmed';

/* ══════════════════════════════════════════════════
   ОТЗЫВЫ
   ══════════════════════════════════════════════════ */

CREATE TABLE reviews (
  id            BIGSERIAL PRIMARY KEY,
  master_id     BIGINT NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  service_id    BIGINT REFERENCES services(id) ON DELETE SET NULL,
  author_name   TEXT NOT NULL,
  rating        SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text          TEXT,
  photo_file_id TEXT,
  is_published  BOOLEAN DEFAULT true,
  created_at    DATE DEFAULT CURRENT_DATE
);

/* ══════════════════════════════════════════════════
   ПОДПИСКИ И ПЛАТЕЖИ
   ══════════════════════════════════════════════════ */

CREATE TABLE subscription_payments (
  id              SERIAL PRIMARY KEY,
  master_id       BIGINT NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  amount          NUMERIC(10,2),
  currency        TEXT DEFAULT 'BYN',
  period_months   SMALLINT NOT NULL,
  activated_by    BIGINT NOT NULL,
  activated_at    TIMESTAMPTZ DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  notes           TEXT
);
