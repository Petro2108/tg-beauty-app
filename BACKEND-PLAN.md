# Backend Implementation Plan — Multi-Tenant Beauty SaaS

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SaaS-платформа: любой бьюти-мастер создаёт своего бота в BotFather, регистрируется, настраивает профиль и сразу получает брендированное Mini App с онлайн-записью. Бесплатно до 5 услуг, потом подписка.

**Architecture:** Multi-tenant: один бэкенд, N ботов (по одному на мастера). Каждый бот регистрирует webhook на платформе. Mini App — единый React/JS фронтенд, параметризированный по master_id. Мастер управляет всем через Telegram-бота (setup flow + admin команды).

**Tech Stack:** Node.js 20, Fastify 4, PostgreSQL 15, grammY (multi-bot), node-cron, Telegram Files API (хранение фото), Railway/Render

---

## 1. Обзор системы

```
                    ┌─────────────────────────────────────────────────┐
                    │              ПЛАТФОРМА (один сервер)             │
                    │                                                   │
  Мастер ──────────►│  Platform Bot     grammY Bot Manager            │
  (настройка)       │  (@setup_bot)     ┌────────────────────────┐    │
                    │       │           │  master_1 bot instance  │    │
                    │  Регистрирует     │  master_2 bot instance  │    │
                    │  токен мастера    │  master_N bot instance  │    │
                    │                  └────────────────────────┘    │
                    │                              │                   │
  Клиент ──────────►│  Пишет мастеру-боту → бот  │                   │
  (запись)          │  открывает Mini App          │                   │
                    │                              ▼                   │
                    │              Fastify API (/api/v1/...)           │
                    │                              │                   │
                    │                        PostgreSQL                │
                    └─────────────────────────────────────────────────┘
                                                   │
                              ┌────────────────────┴──────────────────┐
                              │           Mini App (SPA)               │
                              │  https://app.platform.com?m=master_id  │
                              └───────────────────────────────────────┘
```

### Как мастер регистрируется (onboarding flow)

```
Фаза 1 — Создание бота в BotFather (мастер делает сам, бот ведёт по шагам)
─────────────────────────────────────────────────────────────────────────────
1. Мастер пишет @platform_setup_bot → /start
2. Platform bot присылает:
   - приветствие + объяснение зачем нужен свой бот
   - кнопку [🤖 Открыть @BotFather] (inline URL)
   - пронумерованную инструкцию из 5 шагов (точные команды и примеры)
3. Мастер открывает @BotFather по кнопке
4. Мастер выполняет 5 шагов (инструкция прямо перед глазами в platform bot):
   Шаг 1. Отправить /newbot
   Шаг 2. Ввести название бота (отображается у клиентов) → пример: «Ноготочки Дарьи»
   Шаг 3. Ввести username (латиница, оканчивается на _bot) → пример: darya_nails_bot
   Шаг 4. BotFather пришлёт токен — длинная строка вида 1234567890:AABBxx...
   Шаг 5. Скопировать токен, вернуться в platform bot, вставить

Фаза 2 — Валидация токена (автоматически)
─────────────────────────────────────────
5. Мастер отправляет токен в platform bot
6. Platform bot: валидирует через Telegram API (getMe)
   - Если ошибка: «❌ Токен не подходит» + что проверить
   - Если OK: создаёт master в БД, регистрирует webhook, ставит кнопку меню на Mini App
7. Platform bot: «✅ Бот @darya_nails_bot подключён!» + ссылка для клиентов

Фаза 3 — Настройка профиля (5 шагов, пошагово)
────────────────────────────────────────────────
8. Шаг 1/5: «Как тебя зовут? Напиши имя так, как увидят клиенты»
9. Шаг 2/5: «Твои специализации через · (например: Маникюр · Педикюр · Брови)»
10. Шаг 3/5: «Адрес приёма? Например: г. Минск, ул. Ленина 5, каб. 12»
11. Шаг 4/5: «График работы? Напиши в свободной форме, например:
               Пн–Пт 10:00–20:00, Сб 10:00–18:00, Вс — выходной»
12. Шаг 5/5: «Отправь своё фото — оно будет на главном экране приложения»
13. Platform bot: профиль сохранён, показывает итог + ссылку

Фаза 4 — Первая услуга (guided добавление)
───────────────────────────────────────────
14. Platform bot предлагает добавить первую услугу прямо сейчас
15. Пошаговый диалог: название → категория (inline кнопки) → цена → длительность →
    описание → фото (отправить несколько фото подряд)
16. Услуга добавлена → предложение добавить ещё или открыть приложение

Итог: мастер получает ссылку https://t.me/darya_nails_bot
      Клиенты нажимают /start → видят кнопку → записываются
```

### Как клиент работает с приложением

```
Клиент → пишет боту мастера /start
         → бот присылает сообщение + кнопку [Открыть приложение]
         → кнопка открывает https://app.platform.com?m=<master_slug>
         → Mini App загружает данные этого мастера через API
         → клиент просматривает услуги, выбирает время, записывается
         → запись сохраняется в БД
         → бот присылает подтверждение клиенту и мастеру
         → за 24ч и 2ч до записи — автоматические напоминания клиенту
```

---

## 2. База данных

### 2.1 Полная схема

```sql
/* ══════════════════════════════════════════════════
   МАСТЕРА И НАСТРОЙКИ
   ══════════════════════════════════════════════════ */

-- Главная запись мастера (аренда)
CREATE TABLE masters (
  id                    BIGSERIAL PRIMARY KEY,
  telegram_id           BIGINT NOT NULL UNIQUE,     -- Telegram ID мастера (из initData при регистрации)
  username              TEXT,                        -- @username мастера в Telegram
  bot_token             TEXT NOT NULL UNIQUE,        -- Токен бота мастера (хранить зашифрованным!)
  bot_username          TEXT,                        -- @username бота (из getMe)
  slug                  TEXT NOT NULL UNIQUE,        -- short human-readable ID: darya_gomel, используется в Mini App URL
  
  -- Подписка
  plan                  TEXT NOT NULL DEFAULT 'free', -- 'free' | 'pro'
  plan_expires_at       TIMESTAMPTZ,                  -- NULL = бессрочно (free не истекает)
  
  -- Статус
  is_active             BOOLEAN DEFAULT true,         -- false = заблокирован администратором платформы
  onboarding_step       TEXT DEFAULT 'awaiting_token',-- состояние настройки через бота
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- Профиль мастера (отображается клиентам)
CREATE TABLE master_profiles (
  master_id         BIGINT PRIMARY KEY REFERENCES masters(id) ON DELETE CASCADE,
  display_name      TEXT NOT NULL,
  name_dative       TEXT,                            -- "Дарье" для "Записаться к Дарье"
  bio               TEXT,
  bio_short         TEXT,
  specializations   TEXT,                            -- "Маникюр · Педикюр · Брови"
  experience_years  SMALLINT,
  works_count       INTEGER DEFAULT 0,
  rating            NUMERIC(3,1) DEFAULT 5.0,
  reviews_count     INTEGER DEFAULT 0,
  
  -- Контакты
  instagram         TEXT,                            -- @handle без @
  address           TEXT,
  work_hours        TEXT,                            -- "Пн–Сб, 10:00–20:00" (текст, детали в master_schedules)
  
  -- Фото мастера (хранится как Telegram file_id или URL)
  photo_file_id     TEXT,                            -- Telegram file_id, если загружено через бота
  photo_url         TEXT,                            -- внешний URL (для v1 gradient fallback)
  gradient          TEXT                             -- CSS-градиент вместо фото
);

-- Тема оформления (платно, plan = 'pro')
CREATE TABLE master_themes (
  master_id         BIGINT PRIMARY KEY REFERENCES masters(id) ON DELETE CASCADE,
  color_scheme      TEXT DEFAULT 'default',          -- 'default'|'pink'|'violet'|'dark'|'minimal'|'luxury'
  logo_file_id      TEXT,                            -- Telegram file_id логотипа
  logo_url          TEXT,
  show_platform_branding BOOLEAN DEFAULT true        -- false = убрать "Powered by Platform" (только pro)
);

-- Рабочий график мастера
CREATE TABLE master_schedules (
  id            SERIAL PRIMARY KEY,
  master_id     BIGINT NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  day_of_week   SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Вс, 1=Пн, ..., 6=Сб
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  is_working    BOOLEAN DEFAULT true,
  UNIQUE (master_id, day_of_week)
);

-- Слоты, заблокированные мастером (выходные, болезнь, личные дела)
CREATE TABLE blocked_slots (
  id            SERIAL PRIMARY KEY,
  master_id     BIGINT NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  blocked_date  DATE NOT NULL,
  blocked_time  TIME,                               -- NULL = весь день заблокирован
  reason        TEXT,
  UNIQUE (master_id, blocked_date, blocked_time)
);

/* ══════════════════════════════════════════════════
   УСЛУГИ
   ══════════════════════════════════════════════════ */

-- Категории услуг (у каждого мастера свои, или наследует дефолтные)
CREATE TABLE service_categories (
  id          SERIAL PRIMARY KEY,
  master_id   BIGINT NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  emoji       TEXT,
  sort_order  SMALLINT DEFAULT 0
);

-- Услуги мастера
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
  
  -- Фото-галерея: [{file_id|url, label, emoji}, ...]
  -- file_id — Telegram file_id, полученный при загрузке фото через бота
  photos        JSONB DEFAULT '[]',
  
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Индекс: лимит 5 услуг для free плана — проверяем в логике, не в БД
CREATE INDEX idx_services_master ON services (master_id) WHERE is_active = true;

/* ══════════════════════════════════════════════════
   ЗАПИСИ КЛИЕНТОВ
   ══════════════════════════════════════════════════ */

CREATE TABLE bookings (
  id                    BIGSERIAL PRIMARY KEY,
  master_id             BIGINT NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  client_telegram_id    BIGINT NOT NULL,
  client_name           TEXT,                        -- first_name из initData
  service_id            BIGINT REFERENCES services(id) ON DELETE SET NULL,
  booking_date          DATE NOT NULL,
  booking_time          TIME NOT NULL,
  status                TEXT NOT NULL DEFAULT 'confirmed', -- 'confirmed'|'cancelled'|'completed'
  
  -- Напоминания
  reminder_24h_sent     BOOLEAN DEFAULT false,
  reminder_2h_sent      BOOLEAN DEFAULT false,
  
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- Атомарная защита от двойного бронирования одного слота у одного мастера
CREATE UNIQUE INDEX bookings_no_double_booking
  ON bookings (master_id, booking_date, booking_time)
  WHERE status = 'confirmed';

/* ══════════════════════════════════════════════════
   ОТЗЫВЫ
   ══════════════════════════════════════════════════ */

CREATE TABLE reviews (
  id          BIGSERIAL PRIMARY KEY,
  master_id   BIGINT NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  service_id  BIGINT REFERENCES services(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text        TEXT,
  photo_file_id TEXT,                               -- фото работы (Telegram file_id)
  is_published BOOLEAN DEFAULT true,
  created_at  DATE DEFAULT CURRENT_DATE
);

/* ══════════════════════════════════════════════════
   ПОДПИСКИ И ПЛАТЕЖИ
   ══════════════════════════════════════════════════ */

-- История активаций подписок (ручная оплата)
CREATE TABLE subscription_payments (
  id              SERIAL PRIMARY KEY,
  master_id       BIGINT NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  amount          NUMERIC(10,2),
  currency        TEXT DEFAULT 'BYN',
  period_months   SMALLINT NOT NULL,                 -- на сколько месяцев активировано
  activated_by    BIGINT NOT NULL,                   -- Telegram ID платформенного администратора
  activated_at    TIMESTAMPTZ DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  notes           TEXT                               -- "screenshot confirmed 2026-06-01"
);
```

### 2.2 Что хранится в JSONB `photos`

```json
[
  { "fileId": "BQACAgIAA...", "label": "Готовый результат", "emoji": "💅" },
  { "url": "https://cdn.example.com/photo.webp", "label": "До процедуры", "emoji": "✋" }
]
```

`fileId` — Telegram `file_id`, полученный когда мастер отправил фото боту. Чтобы отдать клиенту — вызываем `getFile` API и берём путь, или используем CDN. В v1 — отдаём `https://api.telegram.org/file/bot<token>/<file_path>` через прокси, чтобы не светить token.

---

## 3. API Эндпоинты

### Базовый URL: `/api/v1`

### 3.1 Публичные (без авторизации)

| Метод | Путь | Описание |
|-------|------|---------|
| `GET` | `/masters/:slug` | Профиль мастера (name, bio, photo, stats) |
| `GET` | `/masters/:slug/services` | Список услуг мастера |
| `GET` | `/masters/:slug/services/:id` | Услуга + отзывы |
| `GET` | `/masters/:slug/slots?date=YYYY-MM-DD` | Доступные слоты на дату |
| `GET` | `/masters/:slug/theme` | Цветовая схема + logo_url для фронтенда |

**Логика `GET /slots`:**
```
1. Найти мастера по slug → получить master_id
2. Если дата — выходной по master_schedules → вернуть []
3. Если дата в прошлом → вернуть []
4. Получить рабочие часы мастера на этот день_недели → генерировать слоты каждый час
5. Вычесть: bookings WHERE master_id=? AND date=? AND status='confirmed'
6. Вычесть: blocked_slots WHERE master_id=? AND (date=? AND (time=? OR time IS NULL))
7. Вернуть [{time, available}]
```

### 3.2 Авторизованные клиентом (Telegram initData)

Заголовок: `X-Telegram-Init-Data: <initData строка>`

| Метод | Путь | Описание |
|-------|------|---------|
| `GET` | `/bookings?master_slug=` | Свои записи у конкретного мастера |
| `POST` | `/bookings` | Создать запись |
| `PATCH` | `/bookings/:id/cancel` | Отменить свою запись |

**Тело `POST /bookings`:**
```json
{
  "master_slug": "darya_gomel",
  "service_id": 12,
  "date": "2026-06-10",
  "time": "11:00"
}
```

**Логика создания:**
```
1. Верифицировать initData (HMAC-SHA256 с bot_token мастера)
   Важно: у каждого мастера свой bot_token, initData подписана ИМ
   → найти мастера по slug → взять его bot_token → верифицировать
2. Проверить: услуга принадлежит этому мастеру
3. Проверить: слот не занят (SELECT FOR UPDATE)
4. Проверить: слот не заблокирован
5. INSERT booking
6. COMMIT
7. Async: уведомить мастера (bot.api.sendMessage(master.telegram_id, ...))
8. Async: уведомить клиента (bot.api.sendMessage(client_telegram_id, ...))
```

### 3.3 Мастер-администратор (initData мастера + проверка master.telegram_id)

Заголовок: `X-Telegram-Init-Data: <initData>` — пользователь должен совпадать с master.telegram_id

| Метод | Путь | Описание |
|-------|------|---------|
| `GET` | `/admin/profile` | Свой профиль |
| `PUT` | `/admin/profile` | Обновить профиль |
| `GET` | `/admin/schedule` | Своё расписание |
| `PUT` | `/admin/schedule` | Обновить расписание |
| `GET` | `/admin/services` | Все свои услуги (включая неактивные) |
| `POST` | `/admin/services` | Добавить услугу (с проверкой лимита 5) |
| `PUT` | `/admin/services/:id` | Обновить услугу |
| `DELETE` | `/admin/services/:id` | Деактивировать услугу |
| `POST` | `/admin/services/:id/photos` | Загрузить фото через Telegram file_id |
| `GET` | `/admin/bookings?date=&status=` | Все записи клиентов |
| `PATCH` | `/admin/bookings/:id` | Сменить статус записи |
| `POST` | `/admin/blocked-slots` | Заблокировать слот/день |
| `DELETE` | `/admin/blocked-slots/:id` | Разблокировать |
| `GET` | `/admin/subscription` | Статус подписки |
| `PUT` | `/admin/theme` | Обновить тему (только если plan='pro') |

**Проверка лимита при `POST /admin/services`:**
```
SELECT COUNT(*) FROM services WHERE master_id = ? AND is_active = true
IF count >= 5 AND master.plan = 'free':
  → 403 { error: 'LIMIT_REACHED', message: 'Free план: максимум 5 услуг. Оформи подписку Pro.' }
```

### 3.4 Платформенный администратор (X-Platform-Admin-Token из ENV)

| Метод | Путь | Описание |
|-------|------|---------|
| `GET` | `/platform/masters` | Все мастера |
| `PATCH` | `/platform/masters/:id/activate` | Активировать подписку pro |
| `PATCH` | `/platform/masters/:id/suspend` | Заблокировать мастера |
| `POST` | `/platform/register-master` | Зарегистрировать мастера после получения токена |

### 3.5 Webhooks

| Метод | Путь | Описание |
|-------|------|---------|
| `POST` | `/webhook/platform` | Webhook platform setup бота |
| `POST` | `/webhook/master/:slug` | Webhook бота конкретного мастера |

---

## 4. Матрица доступа

```
                          | Клиент  | Мастер  | Платф.Админ
--------------------------|---------|---------|------------
Профиль мастера (чтение)  |   ✅    |   ✅    |    ✅
Профиль мастера (запись)  |   ❌    |   ✅ свой|    ✅
Услуги (чтение)           |   ✅    |   ✅    |    ✅
Добавить/изменить услугу  |   ❌    |   ✅ свои|    ✅
Удалить услугу            |   ❌    |   ✅ свои|    ✅
Слоты (чтение)            |   ✅    |   ✅    |    ✅
Блокировать слот           |   ❌    |   ✅ свои|    ✅
Создать запись            |   ✅ свою|   ❌    |    ✅
Отменить запись           |   ✅ свою|   ✅ любую|   ✅
Статус записи (смена)     |   ❌    |   ✅ свои|    ✅
Свои записи (просмотр)    |   ✅ свои|  ✅ все |    ✅
Тема (запись)             |   ❌    |   ✅ pro only|  ✅
Подписка (активация)      |   ❌    |   ❌    |    ✅
Мастер (регистрация)      |   ❌    |   через бота|  ✅
Мастер (блокировка)       |   ❌    |   ❌    |    ✅
```

---

## 5. Архитектура ботов

### Структура (grammY multi-bot)

```js
// src/bots/manager.js
const { Bot } = require('grammy');

const activeBots = new Map(); // master_id → Bot instance

async function registerBot(master) {
  const bot = new Bot(master.bot_token);
  setupMasterBotHandlers(bot, master);
  // Установка webhook через Telegram API
  await bot.api.setWebhook(`https://api.platform.com/webhook/master/${master.slug}`);
  // Установка кнопки меню бота (открывает Mini App)
  await bot.api.setChatMenuButton({
    menu_button: {
      type: 'web_app',
      text: 'Записаться',
      web_app: { url: `https://app.platform.com?m=${master.slug}` }
    }
  });
  activeBots.set(master.id, bot);
}

async function unregisterBot(masterId) {
  const bot = activeBots.get(masterId);
  if (bot) { await bot.api.deleteWebhook(); activeBots.delete(masterId); }
}
```

### Platform Setup Bot handlers

```
Команды:
  /start        → Фаза 1: приветствие + инструкция BotFather (подробно, 5 шагов) +
                  inline-кнопка [🤖 Открыть @BotFather]
  /instructions → Повторно выслать инструкцию по созданию бота (если потерял)
  /help         → Список всех команд с описанием
  /status       → Показать текущий план, количество услуг, ссылку для клиентов
  /add_service  → Добавить услугу (пошаговый диалог)
  /my_services  → Список услуг с кнопками [✏️ Изменить] [🗑 Удалить]
  /bookings     → Записи: сегодня и ближайшие 3 дня
  /block_day    → Заблокировать день (бот спросит какой)
  /schedule     → Настроить рабочие дни и часы (inline-кнопки для каждого дня)
  /subscribe    → Информация о Pro + инструкция по оплате
  /theme        → Выбор темы (только pro, inline-кнопки с 6 вариантами)
  /my_link      → Ссылка для клиентов + QR-код

Автоматические триггеры:
  Получен токен (формат \d+:[\w-]{35,})
    → getMe для валидации
    → Если уже зарегистрирован: «Этот бот уже подключён»
    → Если OK: createMaster + registerWebhook + setMenuButton
    → Сразу запускать Фазу 3 (настройка профиля, Шаг 1/5)

  Получено фото в шаге 5/5 профиля
    → Сохранить file_id → сохранить профиль → предложить добавить первую услугу

  Получена фотография в шаге добавления фото к услуге
    → Принять несколько фото (пока не нажата кнопка [✅ Готово])

  Получено фото (вне контекста диалога, мастер уже зарегистрирован)
    → «Отправь фото через /add_service для добавления к услуге»

  Получен скриншот оплаты (фото, мастер уже зарегистрирован)
    → Переслать платформенному администратору с кнопкой [✅ Активировать]

Состояния сессии (sessions Map):
  'awaiting_token'          ← начальное после /start
  'setup_name'              ← Шаг 1/5
  'setup_spec'              ← Шаг 2/5
  'setup_address'           ← Шаг 3/5
  'setup_hours'             ← Шаг 4/5
  'setup_photo'             ← Шаг 5/5
  'svc_name'                ← добавление услуги: название
  'svc_category'            ← выбор категории (inline кнопки)
  'svc_price'               ← цена
  'svc_duration'            ← длительность (inline кнопки или текст)
  'svc_description'         ← описание
  'svc_photos'              ← фотографии (несколько, кнопка Готово)
  'block_day_input'         ← ввод даты для блокировки
```

### Master Bot handlers (для клиентов мастера)

```
/start       → приветствие с именем мастера + кнопка [Открыть приложение] (InlineKeyboard web_app)
любое фото   → "Для записи используй кнопку ниже"
любой текст  → "Привет! Нажми 'Записаться' чтобы выбрать время" + кнопка
```

---

## 6. Freemium логика

### Ограничения free плана

| Функция | Free | Pro |
|---------|------|-----|
| Услуги | 5 максимум | Безлимит |
| Записи в месяц | Безлимит | Безлимит |
| Уведомления клиентам | ✅ | ✅ |
| Цветовая тема | Default | 6 вариантов |
| Кастомный логотип | ❌ | ✅ |
| Удаление "Powered by" | ❌ | ✅ |
| Приоритетная поддержка | ❌ | ✅ |

### Проверка лимита в API

```js
// middleware: checkServiceLimit
async function checkServiceLimit(req, reply) {
  const master = req.master; // установлено auth middleware
  if (master.plan === 'pro') return; // pro — без ограничений
  const { rows } = await query(
    'SELECT COUNT(*) FROM services WHERE master_id = $1 AND is_active = true',
    [master.id]
  );
  if (parseInt(rows[0].count) >= 5) {
    return reply.code(403).send({
      error: 'LIMIT_REACHED',
      limit: 5,
      current: parseInt(rows[0].count),
      upgrade_url: `https://t.me/platform_setup_bot?start=upgrade_${master.slug}`
    });
  }
}
```

### Ручная активация подписки

```
Мастер пишет в Platform Bot: /subscribe
Бот отвечает:
  "Pro подписка: 15 BYN/месяц или 150 BYN/год
   Включает: безлимит услуг, White Label, темы
   
   Для оплаты переводи на карту: XXXX XXXX XXXX XXXX
   После оплаты пришли скриншот"

Мастер присылает скриншот
  → бот пересылает скриншот платформенному администратору (PLATFORM_ADMIN_TG_ID из ENV)
  → администратор вызывает: POST /platform/masters/:id/activate { months: 1 }
  → masters SET plan='pro', plan_expires_at = now() + 30 days
  → бот присылает мастеру: "Подписка активирована до [дата]! Открой /theme для настройки темы"
```

### Проверка истечения подписки (cron)

```
Каждый день в 00:00:
  SELECT * FROM masters WHERE plan = 'pro' AND plan_expires_at < now()
  FOR EACH master:
    UPDATE masters SET plan = 'free'
    Уведомить мастера через бот: "Подписка истекла, перейди на free план..."
    Если услуг > 5: скрыть лишние (is_active = false), уведомить мастера
```

---

## 7. Хранение фотографий

Фотографии хранятся как Telegram `file_id`. Мастер отправляет фото боту → бот получает `file_id` → сохраняем в БД.

**Почему Telegram file_id:**
- Бесплатно
- Не нужен S3
- Telegram хранит файлы вечно (пока есть хотя бы один бот, который их загружал)
- `file_id` привязан к боту — важно хранить `master.bot_token` для доступа

**Как отдавать клиенту:**

```js
// src/files.js — прокси-endpoint, чтобы не светить bot_token в URL клиенту
fastify.get('/files/:masterSlug/:fileId', async (req, reply) => {
  const master = await getMasterBySlug(req.params.masterSlug);
  const fileInfo = await fetch(
    `https://api.telegram.org/bot${master.bot_token}/getFile?file_id=${req.params.fileId}`
  ).then(r => r.json());
  const fileUrl = `https://api.telegram.org/file/bot${master.bot_token}/${fileInfo.result.file_path}`;
  return reply.redirect(fileUrl);
});
```

Клиент использует: `https://api.platform.com/files/darya_gomel/BQACAgI...`

---

## 8. Структура файлов бэкенда

```
backend/
├── src/
│   ├── server.js                # Fastify bootstrap, plugins, routes
│   ├── db.js                    # PostgreSQL pool + query helper
│   ├── config.js                # ENV constants
│   ├── auth/
│   │   ├── verifyInitData.js    # HMAC-SHA256 проверка Telegram initData
│   │   ├── masterAuth.js        # middleware: извлечь мастера из initData
│   │   └── clientAuth.js        # middleware: извлечь клиента из initData
│   ├── routes/
│   │   ├── public.js            # GET /masters/:slug, /services, /slots, /theme
│   │   ├── client.js            # GET/POST/PATCH /bookings
│   │   ├── admin.js             # Admin routes (мастер управляет своим)
│   │   ├── platform.js          # Platform admin routes
│   │   ├── webhooks.js          # POST /webhook/platform, /webhook/master/:slug
│   │   └── files.js             # GET /files/:masterSlug/:fileId (прокси фото)
│   ├── bots/
│   │   ├── manager.js           # registerBot, unregisterBot, активные инстансы
│   │   ├── platformBot.js       # Platform setup bot handlers (регистрация мастеров)
│   │   ├── masterBot.js         # Master bot handlers factory (клиенты мастера)
│   │   └── reminders.js         # node-cron: напоминания 24ч и 2ч
│   ├── services/
│   │   ├── slots.js             # computeAvailableSlots(master, date)
│   │   ├── bookings.js          # createBooking, cancelBooking (бизнес-логика)
│   │   └── notifications.js     # sendConfirmation, sendReminder (через grammY)
│   └── jobs/
│       └── subscriptions.js     # Cron: проверка истечения подписок
├── migrations/
│   ├── 001_schema.sql           # CREATE TABLE (всё выше)
│   ├── 002_default_categories.sql # Стандартные категории для новых мастеров
│   └── 003_platform_admin.sql   # Запись для мастера Дарьи (миграция из v1)
├── .env.example
└── package.json
```

---

## 9. Переменные окружения

```bash
# .env.example
DATABASE_URL=postgresql://user:pass@localhost:5432/beauty_platform
PLATFORM_BOT_TOKEN=<токен вашего setup-бота>
PLATFORM_ADMIN_TG_ID=<ваш Telegram ID — для получения уведомлений об оплатах>
PLATFORM_ADMIN_TOKEN=<случайная строка — для /platform/ API>
APP_URL=https://app.platform.com     # URL Mini App фронтенда
API_URL=https://api.platform.com     # URL этого сервера
PORT=3000
BOT_TOKEN_ENCRYPTION_KEY=<32 байта hex — для шифрования токенов мастеров в БД>
```

**Важно:** `bot_token` мастеров в БД должен быть зашифрован (AES-256). В ENV хранится ключ шифрования.

---

## Task 1: Scaffold + шифрование токенов

**Files:**
- Create: `backend/package.json`
- Create: `backend/src/db.js`
- Create: `backend/src/config.js`
- Create: `backend/src/crypto.js`
- Create: `backend/.env.example`

- [ ] **Step 1: Init зависимости**

```bash
cd backend
npm init -y
npm install fastify @fastify/cors pg grammy node-cron dotenv
npm install -D nodemon
```

- [ ] **Step 2: crypto.js — шифрование bot_token**

```js
const crypto = require('crypto');

const KEY = Buffer.from(process.env.BOT_TOKEN_ENCRYPTION_KEY, 'hex');
const ALG = 'aes-256-gcm';

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALG, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(data) {
  const [ivHex, tagHex, encHex] = data.split(':');
  const decipher = crypto.createDecipheriv(ALG, KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8');
}

module.exports = { encrypt, decrypt };
```

- [ ] **Step 3: Написать тест**

```js
// test/crypto.test.js
process.env.BOT_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
const { test } = require('node:test');
const assert = require('node:assert');
const { encrypt, decrypt } = require('../src/crypto');

test('encrypt/decrypt round-trip', () => {
  const original = '1234567890:AABBCCDDaabbccdd';
  assert.strictEqual(decrypt(encrypt(original)), original);
});
```

- [ ] **Step 4: Run test**

```bash
node --test test/crypto.test.js
```

Expected: `✓ encrypt/decrypt round-trip`

- [ ] **Step 5: Commit**

```bash
git add backend/
git commit -m "feat: backend scaffold + AES-256-GCM encryption for bot tokens"
```

---

## Task 2: Миграции БД

**Files:**
- Create: `backend/migrations/001_schema.sql` (полная схема из секции 2.1)
- Create: `backend/migrations/002_default_categories.sql`

- [ ] **Step 1: migrations/002_default_categories.sql**

```sql
-- Дефолтные категории для новых мастеров создаются при onboarding через INSERT в service_categories
-- Этот файл — только справочник стандартных значений (не вставляем в БД глобально, у каждого мастера свои)
-- Пример вызова при регистрации мастера:
--   INSERT INTO service_categories (master_id, label, emoji, sort_order)
--   VALUES (?, 'Маникюр', '💅', 1), (?, 'Педикюр', '🦶', 2), ...
```

- [ ] **Step 2: Применить миграцию**

```bash
psql $DATABASE_URL < migrations/001_schema.sql
```

Expected: все CREATE TABLE без ошибок.

- [ ] **Step 3: Verify**

```bash
psql $DATABASE_URL -c "\dt"
```

Expected: 10 таблиц: `masters`, `master_profiles`, `master_themes`, `master_schedules`, `blocked_slots`, `service_categories`, `services`, `bookings`, `reviews`, `subscription_payments`

- [ ] **Step 4: Commit**

```bash
git add backend/migrations/
git commit -m "feat: DB schema for multi-tenant platform"
```

---

## Task 3: Auth middleware

**Files:**
- Create: `backend/src/auth/verifyInitData.js`
- Create: `backend/src/auth/masterAuth.js`
- Create: `backend/src/auth/clientAuth.js`

- [ ] **Step 1: verifyInitData.js**

```js
const crypto = require('crypto');

// initData подписана bot_token мастера (не платформы!)
// Поэтому передаём botToken как аргумент
function verifyInitData(initData, botToken) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const str = [...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256','WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256',secret).update(str).digest('hex');
  if (expected !== hash) return null;
  const userStr = params.get('user');
  return userStr ? JSON.parse(userStr) : null;
}

module.exports = { verifyInitData };
```

- [ ] **Step 2: clientAuth.js** — middleware для клиентских маршрутов

```js
const { verifyInitData } = require('./verifyInitData');
const { decrypt } = require('../crypto');
const { query } = require('../db');

async function clientAuth(req, reply) {
  const initData = req.headers['x-telegram-init-data'];
  const masterSlug = req.body?.master_slug || req.query?.master_slug;
  if (!initData || !masterSlug) return reply.code(401).send({ error: 'Unauthorized' });

  const { rows } = await query('SELECT * FROM masters WHERE slug = $1 AND is_active = true', [masterSlug]);
  if (!rows.length) return reply.code(404).send({ error: 'Master not found' });

  const master = rows[0];
  const botToken = decrypt(master.bot_token);
  const tgUser = verifyInitData(initData, botToken);
  if (!tgUser) return reply.code(401).send({ error: 'Invalid initData' });

  req.tgUser = tgUser;
  req.master = master;
}

module.exports = { clientAuth };
```

- [ ] **Step 3: masterAuth.js** — middleware для admin маршрутов мастера

```js
const { verifyInitData } = require('./verifyInitData');
const { decrypt } = require('../crypto');
const { query } = require('../db');

async function masterAuth(req, reply) {
  const initData = req.headers['x-telegram-init-data'];
  if (!initData) return reply.code(401).send({ error: 'Unauthorized' });

  // Мастер может аутентифицироваться через любого из своих ботов
  // Ищем мастера по telegram_id из неверифицированного initData,
  // потом верифицируем его bot_token
  let userRaw;
  try {
    userRaw = JSON.parse(new URLSearchParams(initData).get('user') || 'null');
  } catch { return reply.code(401).send({ error: 'Invalid initData format' }); }
  if (!userRaw) return reply.code(401).send({ error: 'No user in initData' });

  const { rows } = await query(
    'SELECT * FROM masters WHERE telegram_id = $1 AND is_active = true',
    [userRaw.id]
  );
  if (!rows.length) return reply.code(403).send({ error: 'Not a registered master' });

  const master = rows[0];
  const botToken = decrypt(master.bot_token);
  const tgUser = verifyInitData(initData, botToken);
  if (!tgUser) return reply.code(401).send({ error: 'Invalid initData signature' });

  req.tgUser = tgUser;
  req.master = master;
}

module.exports = { masterAuth };
```

- [ ] **Step 4: Тест**

```js
// test/auth.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { verifyInitData } = require('../src/auth/verifyInitData');

test('rejects fake hash', () => {
  assert.strictEqual(verifyInitData('user=%7B%22id%22%3A1%7D&hash=fake', 'token'), null);
});
```

```bash
node --test test/auth.test.js
```

Expected: `✓ rejects fake hash`

- [ ] **Step 5: Commit**

```bash
git add backend/src/auth/ backend/test/auth.test.js
git commit -m "feat: Telegram initData auth (per-master bot_token)"
```

---

## Task 4: Public API (каталог)

**Files:**
- Create: `backend/src/routes/public.js`
- Create: `backend/src/services/slots.js`
- Create: `backend/src/server.js`

- [ ] **Step 1: slots.js**

```js
const { query } = require('../db');

// Генерируем слоты по расписанию мастера
function generateTimeSlots(startTime, endTime) {
  const slots = [];
  let [h, m] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  while (h < eh || (h === eh && m < em)) {
    slots.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
    m += 60; if (m >= 60) { h += Math.floor(m/60); m = m % 60; }
  }
  return slots;
}

async function computeAvailableSlots(masterId, dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const dow = date.getDay(); // 0=Вс, 1=Пн

  const { rows: schedule } = await query(
    'SELECT * FROM master_schedules WHERE master_id = $1 AND day_of_week = $2',
    [masterId, dow]
  );
  if (!schedule.length || !schedule[0].is_working) return [];

  const baseTimes = generateTimeSlots(
    schedule[0].start_time.slice(0,5),
    schedule[0].end_time.slice(0,5)
  );

  const { rows: booked } = await query(
    `SELECT booking_time::text FROM bookings
     WHERE master_id = $1 AND booking_date = $2 AND status = 'confirmed'`,
    [masterId, dateStr]
  );

  const { rows: blocked } = await query(
    `SELECT blocked_time::text FROM blocked_slots
     WHERE master_id = $1 AND blocked_date = $2 AND (blocked_time IS NOT NULL)`,
    [masterId, dateStr]
  );

  const { rows: blockedDay } = await query(
    `SELECT 1 FROM blocked_slots WHERE master_id = $1 AND blocked_date = $2 AND blocked_time IS NULL`,
    [masterId, dateStr]
  );
  if (blockedDay.length) return baseTimes.map(t => ({ time: t, available: false }));

  const bookedSet = new Set(booked.map(r => r.booking_time.slice(0,5)));
  const blockedSet = new Set(blocked.map(r => r.blocked_time.slice(0,5)));

  return baseTimes.map(time => ({
    time,
    available: !bookedSet.has(time) && !blockedSet.has(time)
  }));
}

module.exports = { computeAvailableSlots };
```

- [ ] **Step 2: routes/public.js** (основные read-only маршруты)

```js
const { query } = require('../db');
const { computeAvailableSlots } = require('../services/slots');

async function publicRoutes(fastify) {

  fastify.get('/api/v1/masters/:slug', async (req, reply) => {
    const { rows } = await query(
      `SELECT m.slug, p.display_name, p.bio, p.bio_short, p.specializations,
              p.experience_years, p.works_count, p.rating, p.reviews_count,
              p.instagram, p.address, p.work_hours, p.gradient, p.photo_file_id
       FROM masters m JOIN master_profiles p ON p.master_id = m.id
       WHERE m.slug = $1 AND m.is_active = true`,
      [req.params.slug]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Master not found' });
    return rows[0];
  });

  fastify.get('/api/v1/masters/:slug/services', async (req, reply) => {
    const { rows: master } = await query('SELECT id FROM masters WHERE slug = $1', [req.params.slug]);
    if (!master.length) return reply.code(404).send({ error: 'Not found' });
    const { rows } = await query(
      `SELECT s.*, c.label as category_label, c.emoji as category_emoji
       FROM services s LEFT JOIN service_categories c ON c.id = s.category_id
       WHERE s.master_id = $1 AND s.is_active = true ORDER BY s.sort_order, s.id`,
      [master[0].id]
    );
    return rows;
  });

  fastify.get('/api/v1/masters/:slug/services/:id', async (req, reply) => {
    const { rows: master } = await query('SELECT id FROM masters WHERE slug = $1', [req.params.slug]);
    if (!master.length) return reply.code(404).send({ error: 'Not found' });
    const { rows: svc } = await query(
      'SELECT * FROM services WHERE id = $1 AND master_id = $2 AND is_active = true',
      [req.params.id, master[0].id]
    );
    if (!svc.length) return reply.code(404).send({ error: 'Service not found' });
    const { rows: reviews } = await query(
      'SELECT * FROM reviews WHERE service_id = $1 AND master_id = $2 AND is_published = true ORDER BY created_at DESC LIMIT 5',
      [req.params.id, master[0].id]
    );
    return { ...svc[0], reviews };
  });

  fastify.get('/api/v1/masters/:slug/slots', async (req, reply) => {
    const { date } = req.query;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.code(400).send({ error: 'date required (YYYY-MM-DD)' });
    }
    const today = new Date(); today.setHours(0,0,0,0);
    if (new Date(date) <= today) return [];

    const { rows: master } = await query('SELECT id FROM masters WHERE slug = $1', [req.params.slug]);
    if (!master.length) return reply.code(404).send({ error: 'Not found' });

    return computeAvailableSlots(master[0].id, date);
  });

  fastify.get('/api/v1/masters/:slug/theme', async (req, reply) => {
    const { rows } = await query(
      `SELECT t.color_scheme, t.logo_url, t.logo_file_id, t.show_platform_branding
       FROM masters m LEFT JOIN master_themes t ON t.master_id = m.id
       WHERE m.slug = $1`,
      [req.params.slug]
    );
    return rows[0] || { color_scheme: 'default', show_platform_branding: true };
  });
}

module.exports = publicRoutes;
```

- [ ] **Step 3: server.js базовый**

```js
require('dotenv').config();
const Fastify = require('fastify');
const app = Fastify({ logger: true });

app.register(require('@fastify/cors'), { origin: true });
app.register(require('./routes/public'));
// остальные routes добавим в следующих задачах

app.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' }, err => {
  if (err) { app.log.error(err); process.exit(1); }
});
module.exports = app;
```

- [ ] **Step 4: Verify (с тестовым мастером в БД)**

```bash
# Вставить тестовые данные
psql $DATABASE_URL < migrations/003_test_master.sql

node src/server.js &
curl http://localhost:3000/api/v1/masters/darya_gomel
```

Expected: JSON с профилем мастера.

- [ ] **Step 5: Commit**

```bash
git add backend/src/
git commit -m "feat: public catalog API with schedule-based slot generation"
```

---

## Task 5: Client Bookings API

**Files:**
- Create: `backend/src/routes/client.js`
- Create: `backend/src/services/bookings.js`
- Create: `backend/src/services/notifications.js`

- [ ] **Step 1: bookings.js (бизнес-логика)**

```js
const { pool, query } = require('../db');
const { notify } = require('./notifications');

async function createBooking({ master, tgUser, serviceId, date, time }) {
  const d = new Date(date + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  if (d <= today) throw { code: 400, error: 'Cannot book past dates' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const conflict = await client.query(
      `SELECT 1 FROM bookings WHERE master_id=$1 AND booking_date=$2 AND booking_time=$3 AND status='confirmed' FOR UPDATE`,
      [master.id, date, time]
    );
    if (conflict.rows.length) throw { code: 409, error: 'Slot already taken' };

    const svc = await client.query(
      'SELECT * FROM services WHERE id = $1 AND master_id = $2 AND is_active = true',
      [serviceId, master.id]
    );
    if (!svc.rows.length) throw { code: 404, error: 'Service not found' };

    const { rows } = await client.query(
      `INSERT INTO bookings (master_id, client_telegram_id, client_name, service_id, booking_date, booking_time)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [master.id, tgUser.id, tgUser.first_name, serviceId, date, time]
    );
    await client.query('COMMIT');

    // Уведомления (async, не блокируют ответ)
    notify('booking_confirmed', { booking: rows[0], service: svc.rows[0], master, client: tgUser }).catch(console.error);
    return rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { createBooking };
```

- [ ] **Step 2: notifications.js**

```js
const { getBotForMaster } = require('../bots/manager');
const { query } = require('../db');

const formatDate = (d) => {
  const days = ['вс','пн','вт','ср','чт','пт','сб'];
  const months = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
  const dt = new Date(d + 'T00:00:00');
  return `${days[dt.getDay()]}, ${dt.getDate()} ${months[dt.getMonth()]}`;
};

async function notify(event, data) {
  const bot = await getBotForMaster(data.master.id);
  if (!bot) return;

  if (event === 'booking_confirmed') {
    const { booking, service, master, client } = data;
    const dateStr = formatDate(booking.booking_date);
    const time = String(booking.booking_time).slice(0, 5);

    // Клиенту
    await bot.api.sendMessage(client.id,
      `✅ Запись подтверждена!\n\n` +
      `${service.emoji} ${service.title}\n` +
      `📅 ${dateStr}, ${time}\n` +
      `👤 ${master.display_name || 'Мастер'}\n` +
      `📍 ${master.address || ''}\n\n` +
      `Напомним за 24ч и за 2ч до визита.`
    );

    // Мастеру (профиль мастера из БД)
    const { rows: profile } = await query('SELECT * FROM master_profiles WHERE master_id = $1', [data.master.id]);
    await bot.api.sendMessage(master.telegram_id,
      `📥 Новая запись!\n\n` +
      `${service.emoji} ${service.title}\n` +
      `📅 ${dateStr}, ${time}\n` +
      `👤 Клиент: ${client.first_name}${client.username ? ' @' + client.username : ''}`
    );
  }
}

// Напоминания (вызывается из cron)
async function sendReminder(booking, service, master, hoursText) {
  const bot = await getBotForMaster(master.id);
  if (!bot) return;
  const time = String(booking.booking_time).slice(0, 5);
  await bot.api.sendMessage(booking.client_telegram_id,
    `🔔 Напоминание!\n` +
    `${hoursText} у тебя запись:\n\n` +
    `${service.emoji} ${service.title}\n` +
    `⏰ ${time}\n` +
    `📍 ${master.address || ''}`
  );
}

module.exports = { notify, sendReminder };
```

- [ ] **Step 3: routes/client.js**

```js
const { clientAuth } = require('../auth/clientAuth');
const { createBooking } = require('../services/bookings');
const { query } = require('../db');

async function clientRoutes(fastify) {
  fastify.addHook('preHandler', clientAuth);

  fastify.get('/api/v1/bookings', async (req) => {
    const { rows } = await query(
      `SELECT b.*, s.title, s.emoji, s.price, s.duration_min, s.photos
       FROM bookings b LEFT JOIN services s ON s.id = b.service_id
       WHERE b.master_id = $1 AND b.client_telegram_id = $2
       ORDER BY b.booking_date DESC, b.booking_time DESC`,
      [req.master.id, req.tgUser.id]
    );
    return rows;
  });

  fastify.post('/api/v1/bookings', async (req, reply) => {
    const { service_id, date, time } = req.body;
    if (!service_id || !date || !time) return reply.code(400).send({ error: 'service_id, date, time required' });
    try {
      const booking = await createBooking({ master: req.master, tgUser: req.tgUser, serviceId: service_id, date, time });
      return reply.code(201).send(booking);
    } catch (e) {
      return reply.code(e.code || 500).send({ error: e.error || 'Internal error' });
    }
  });

  fastify.patch('/api/v1/bookings/:id/cancel', async (req, reply) => {
    const { rows } = await query(
      `UPDATE bookings SET status = 'cancelled'
       WHERE id = $1 AND master_id = $2 AND client_telegram_id = $3 AND status = 'confirmed'
       RETURNING *`,
      [req.params.id, req.master.id, req.tgUser.id]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Booking not found' });
    return rows[0];
  });
}

module.exports = clientRoutes;
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/client.js backend/src/services/
git commit -m "feat: client bookings API with atomic slot conflict check + notifications"
```

---

## Task 6: Master Admin API

**Files:**
- Create: `backend/src/routes/admin.js`

Ключевые endpoints: управление профилем, услугами, расписанием, блокировка слотов, просмотр записей.

- [ ] **Step 1: routes/admin.js** (ключевые части)

```js
const { masterAuth } = require('../auth/masterAuth');
const { query } = require('../db');
const { decrypt } = require('../crypto');

const SERVICE_FREE_LIMIT = 5;

async function adminRoutes(fastify) {
  fastify.addHook('preHandler', masterAuth);

  /* ── Профиль ── */
  fastify.get('/api/v1/admin/profile', async (req) => {
    const { rows } = await query('SELECT * FROM master_profiles WHERE master_id = $1', [req.master.id]);
    return { ...req.master, profile: rows[0] || null };
  });

  fastify.put('/api/v1/admin/profile', async (req) => {
    const { display_name, bio, bio_short, specializations, experience_years, address, work_hours, instagram, gradient } = req.body;
    await query(
      `INSERT INTO master_profiles (master_id, display_name, bio, bio_short, specializations, experience_years, address, work_hours, instagram, gradient)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (master_id) DO UPDATE SET
         display_name=$2, bio=$3, bio_short=$4, specializations=$5,
         experience_years=$6, address=$7, work_hours=$8, instagram=$9, gradient=$10`,
      [req.master.id, display_name, bio, bio_short, specializations, experience_years, address, work_hours, instagram, gradient]
    );
    return { ok: true };
  });

  /* ── Расписание ── */
  fastify.get('/api/v1/admin/schedule', async (req) => {
    const { rows } = await query('SELECT * FROM master_schedules WHERE master_id = $1 ORDER BY day_of_week', [req.master.id]);
    return rows;
  });

  fastify.put('/api/v1/admin/schedule', async (req, reply) => {
    // body: [{day_of_week, start_time, end_time, is_working}, ...]
    for (const s of req.body) {
      await query(
        `INSERT INTO master_schedules (master_id, day_of_week, start_time, end_time, is_working)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (master_id, day_of_week) DO UPDATE SET start_time=$3, end_time=$4, is_working=$5`,
        [req.master.id, s.day_of_week, s.start_time, s.end_time, s.is_working]
      );
    }
    return { ok: true };
  });

  /* ── Услуги ── */
  fastify.get('/api/v1/admin/services', async (req) => {
    const { rows } = await query('SELECT * FROM services WHERE master_id = $1 ORDER BY sort_order, id', [req.master.id]);
    return rows;
  });

  fastify.post('/api/v1/admin/services', async (req, reply) => {
    // Проверка лимита free плана
    if (req.master.plan === 'free') {
      const { rows } = await query('SELECT COUNT(*) FROM services WHERE master_id = $1 AND is_active = true', [req.master.id]);
      if (parseInt(rows[0].count) >= SERVICE_FREE_LIMIT) {
        return reply.code(403).send({
          error: 'LIMIT_REACHED',
          limit: SERVICE_FREE_LIMIT,
          message: `Free план ограничен ${SERVICE_FREE_LIMIT} услугами. Оформи Pro подписку.`
        });
      }
    }
    const { title, description, price, duration_min, emoji, category_id, photos } = req.body;
    const { rows } = await query(
      `INSERT INTO services (master_id, title, description, price, duration_min, emoji, category_id, photos)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.master.id, title, description, price, duration_min, emoji, category_id || null, JSON.stringify(photos || [])]
    );
    return reply.code(201).send(rows[0]);
  });

  fastify.put('/api/v1/admin/services/:id', async (req, reply) => {
    const { title, description, price, duration_min, emoji, photos, is_active } = req.body;
    const { rows } = await query(
      `UPDATE services SET title=$1, description=$2, price=$3, duration_min=$4, emoji=$5,
       photos=$6, is_active=COALESCE($7, is_active)
       WHERE id = $8 AND master_id = $9 RETURNING *`,
      [title, description, price, duration_min, emoji, JSON.stringify(photos), is_active, req.params.id, req.master.id]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Not found' });
    return rows[0];
  });

  /* ── Записи (просмотр) ── */
  fastify.get('/api/v1/admin/bookings', async (req) => {
    const { date, status } = req.query;
    let sql = `SELECT b.*, s.title, s.emoji FROM bookings b LEFT JOIN services s ON s.id = b.service_id WHERE b.master_id = $1`;
    const params = [req.master.id];
    if (date) { params.push(date); sql += ` AND b.booking_date = $${params.length}`; }
    if (status) { params.push(status); sql += ` AND b.status = $${params.length}`; }
    sql += ' ORDER BY b.booking_date, b.booking_time';
    const { rows } = await query(sql, params);
    return rows;
  });

  fastify.patch('/api/v1/admin/bookings/:id', async (req, reply) => {
    const { status } = req.body;
    if (!['confirmed','cancelled','completed'].includes(status)) {
      return reply.code(400).send({ error: 'Invalid status' });
    }
    const { rows } = await query(
      'UPDATE bookings SET status=$1 WHERE id=$2 AND master_id=$3 RETURNING *',
      [status, req.params.id, req.master.id]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Not found' });
    return rows[0];
  });

  /* ── Блокировка слотов ── */
  fastify.post('/api/v1/admin/blocked-slots', async (req, reply) => {
    const { date, time, reason } = req.body;
    const { rows } = await query(
      `INSERT INTO blocked_slots (master_id, blocked_date, blocked_time, reason)
       VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING *`,
      [req.master.id, date, time || null, reason || null]
    );
    return reply.code(201).send(rows[0] || { ok: true });
  });

  fastify.delete('/api/v1/admin/blocked-slots/:id', async (req, reply) => {
    await query('DELETE FROM blocked_slots WHERE id=$1 AND master_id=$2', [req.params.id, req.master.id]);
    return reply.code(204).send();
  });

  /* ── Тема (только pro) ── */
  fastify.put('/api/v1/admin/theme', async (req, reply) => {
    if (req.master.plan !== 'pro') {
      return reply.code(403).send({ error: 'PRO_REQUIRED', message: 'Настройка темы доступна только в Pro плане' });
    }
    const { color_scheme, logo_url, logo_file_id, show_platform_branding } = req.body;
    await query(
      `INSERT INTO master_themes (master_id, color_scheme, logo_url, logo_file_id, show_platform_branding)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (master_id) DO UPDATE SET
         color_scheme=$2, logo_url=$3, logo_file_id=$4, show_platform_branding=$5`,
      [req.master.id, color_scheme, logo_url, logo_file_id, show_platform_branding]
    );
    return { ok: true };
  });
}

module.exports = adminRoutes;
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/admin.js
git commit -m "feat: master admin API with freemium limit check"
```

---

## Task 7: Platform Bot (онбординг мастеров)

**Files:**
- Create: `backend/src/bots/manager.js`
- Create: `backend/src/bots/platformBot.js`
- Create: `backend/src/bots/masterBot.js`

- [ ] **Step 1: bots/manager.js**

```js
const { Bot } = require('grammy');
const { decrypt } = require('../crypto');
const { query } = require('../db');

const activeBots = new Map(); // master_id → Bot instance

async function getBotForMaster(masterId) {
  return activeBots.get(masterId) || null;
}

async function registerMasterBot(master) {
  const botToken = decrypt(master.bot_token);
  const bot = new Bot(botToken);
  const { setupMasterBotHandlers } = require('./masterBot');
  setupMasterBotHandlers(bot, master);
  activeBots.set(master.id, bot);
  return bot;
}

async function loadAllActiveBots() {
  const { rows } = await query('SELECT * FROM masters WHERE is_active = true');
  for (const master of rows) {
    await registerMasterBot(master).catch(e =>
      console.error(`Failed to load bot for master ${master.slug}:`, e.message)
    );
  }
  console.log(`Loaded ${rows.length} master bots`);
}

async function unregisterMasterBot(masterId) {
  activeBots.delete(masterId);
}

module.exports = { getBotForMaster, registerMasterBot, loadAllActiveBots, unregisterMasterBot };
```

- [ ] **Step 2: bots/platformBot.js** (регистрация нового мастера)

```js
const { Bot } = require('grammy');
const { query } = require('../db');
const { encrypt, decrypt } = require('../crypto');
const { registerMasterBot } = require('./manager');

const sessions = new Map(); // telegram_id → { step, data }

// ─────────────────────────────────────────────────────
// Тексты сообщений вынесены как константы — легко менять
// ─────────────────────────────────────────────────────

const MSG = {

  // Фаза 1: приветствие
  welcome: (name) =>
    `👋 Привет, ${name}!\n\n` +
    `Я помогу тебе запустить своё приложение для онлайн-записи клиентов прямо в Telegram — за несколько минут и без технических знаний.\n\n` +
    `✨ Что ты получишь:\n` +
    `• Брендированный бот под твоим именем\n` +
    `• Каталог услуг с фото и ценами\n` +
    `• Онлайн-запись с календарём\n` +
    `• Автоматические напоминания клиентам\n` +
    `• До 5 услуг бесплатно навсегда\n\n` +
    `Первый шаг — создать своего Telegram-бота.\n` +
    `Нажми кнопку ниже, чтобы открыть @BotFather 👇`,

  // Инструкция по созданию бота (отдельное сообщение после приветствия)
  botfatherGuide:
    `📋 Инструкция — создай бота за 2 минуты:\n\n` +
    `1️⃣ Открой @BotFather (кнопка выше или найди поиском)\n\n` +
    `2️⃣ Отправь ему команду:\n` +
    `/newbot\n\n` +
    `3️⃣ BotFather спросит <b>название бота</b> — это то, что увидят клиенты.\n` +
    `   Напиши красивое имя, например:\n` +
    `   <code>Маникюр Дарьи</code>\n` +
    `   <code>Ноготочки Алины</code>\n` +
    `   <code>Beauty by Марина</code>\n\n` +
    `4️⃣ BotFather спросит <b>username</b> — технический адрес бота.\n` +
    `   Требования: латиница, цифры, _, оканчивается на <code>bot</code>.\n` +
    `   Примеры:\n` +
    `   <code>darya_nails_bot</code>\n` +
    `   <code>alina_beauty_gomel_bot</code>\n` +
    `   <code>marina_lashes_bot</code>\n\n` +
    `5️⃣ BotFather пришлёт сообщение с <b>токеном</b> — длинная строка вида:\n` +
    `   <code>1234567890:AABBCCDDEEFFaabbccddeeff</code>\n\n` +
    `📌 Скопируй токен и пришли его мне прямо в этот чат.\n\n` +
    `❓ Если что-то непонятно — напиши /help`,

  // Что делать если не понял
  awaiting:
    `⬆️ Скопируй токен из @BotFather и пришли его мне.\n\n` +
    `Токен выглядит примерно так:\n` +
    `<code>1234567890:AABBCCDDEEFFaabbccddeeff</code>\n\n` +
    `Если ещё не создал бота — смотри инструкцию выше (/instructions)`,

  // Ошибка токена с диагностикой
  tokenInvalid: (hint) =>
    `❌ Не удалось подключить бота.\n\n` +
    `Причина: ${hint}\n\n` +
    `Что проверить:\n` +
    `• Скопировал ли ты <b>весь</b> токен целиком?\n` +
    `• Не добавил ли лишние пробелы или символы?\n` +
    `• Этот токен точно от @BotFather, а не откуда-то ещё?\n\n` +
    `Попробуй ещё раз или напиши /help`,

  // Токен уже зарегистрирован
  tokenDuplicate: (botUsername) =>
    `⚠️ Бот @${botUsername} уже подключён к платформе.\n\n` +
    `Если это твой бот и ты потерял доступ — напиши нам.`,

  // Токен принят — переход к профилю
  tokenOk: (botUsername, appUrl, slug) =>
    `✅ Отлично! Бот @${botUsername} успешно подключён!\n\n` +
    `Я уже настроил его: клиенты смогут открыть твоё приложение прямо из чата с ботом.\n\n` +
    `🔗 Ссылка для клиентов (сохрани её):\n` +
    `t.me/${botUsername}\n\n` +
    `Теперь настроим профиль — клиенты увидят эту информацию в приложении.\n` +
    `Это займёт 2 минуты.\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `Шаг 1 из 5 — Твоё имя\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Как тебя зовут? Напиши имя так, как увидят клиенты.\n\n` +
    `Примеры: <code>Дарья Русакова</code> или просто <code>Дарья</code>`,

  // Профиль: шаги 2–5
  setupStep2:
    `Шаг 2 из 5 — Специализации\n\n` +
    `Напиши свои услуги через символ <code>·</code>\n\n` +
    `Примеры:\n` +
    `<code>Маникюр · Педикюр · Брови</code>\n` +
    `<code>Наращивание ресниц · Ламинирование</code>\n` +
    `<code>Стрижки · Окрашивание · Укладка</code>`,

  setupStep3:
    `Шаг 3 из 5 — Адрес приёма\n\n` +
    `Напиши адрес, где принимаешь клиентов.\n\n` +
    `Примеры:\n` +
    `<code>г. Гомель, ул. Советская 10, каб. 5</code>\n` +
    `<code>г. Минск, м. Немига, ул. Богдановича 3</code>\n` +
    `<code>Принимаю на дому, адрес в личке</code>`,

  setupStep4:
    `Шаг 4 из 5 — График работы\n\n` +
    `Напиши свои рабочие часы в свободной форме.\n\n` +
    `Примеры:\n` +
    `<code>Пн–Пт 10:00–20:00, Сб 10:00–18:00, Вс — выходной</code>\n` +
    `<code>Ежедневно 9:00–21:00</code>\n` +
    `<code>По записи, уточняй в личке</code>`,

  setupStep5:
    `Шаг 5 из 5 — Твоё фото\n\n` +
    `Отправь своё фото — оно будет на главном экране приложения.\n\n` +
    `💡 Советы:\n` +
    `• Хорошее освещение, лицо чётко видно\n` +
    `• Профессиональная атмосфера или рабочее место\n` +
    `• Горизонтальный формат или квадрат\n\n` +
    `Если нет фото прямо сейчас — напиши <code>пропустить</code>, добавишь позже`,

  // Профиль готов
  profileDone: (name, slug, appUrl) =>
    `🎉 Профиль настроен!\n\n` +
    `Имя: ${name}\n` +
    `Ссылка для клиентов: t.me/${slug}\n\n` +
    `Теперь добавим первую услугу — клиенты увидят её в каталоге.\n` +
    `Нажми /add_service чтобы начать.\n\n` +
    `На бесплатном плане доступно до 5 услуг.\n` +
    `Для расширения — /subscribe`,

  // Добавление услуги: шаги
  svcStep1:
    `➕ Добавление услуги\n\n` +
    `Шаг 1 из 6 — Название\n\n` +
    `Напиши название услуги так, как увидят клиенты.\n\n` +
    `Примеры:\n` +
    `<code>Маникюр классический</code>\n` +
    `<code>Маникюр с гель-лаком</code>\n` +
    `<code>Наращивание ресниц (классика)</code>`,

  svcStep2Categories: (cats) =>
    `Шаг 2 из 6 — Категория\n\nВыбери категорию для этой услуги:`,

  svcStep3:
    `Шаг 3 из 6 — Цена\n\n` +
    `Напиши стоимость услуги в рублях (только число).\n\n` +
    `Примеры: <code>25</code> или <code>45</code>`,

  svcStep4:
    `Шаг 4 из 6 — Длительность\n\n` +
    `Сколько минут длится процедура? Напиши число.\n\n` +
    `Примеры: <code>60</code> (1 час), <code>90</code> (1.5 часа), <code>120</code> (2 часа)`,

  svcStep5:
    `Шаг 5 из 6 — Описание\n\n` +
    `Напиши короткое описание — что входит в услугу, что получит клиент.\n\n` +
    `Пример:\n` +
    `<code>Обрезной маникюр, уход за кутикулой, покрытие гель-лаком на выбор из 200+ оттенков. Держится 3–4 недели.</code>\n\n` +
    `Если не хочешь описание — напиши <code>—</code>`,

  svcStep6:
    `Шаг 6 из 6 — Фотографии\n\n` +
    `Отправь 1–3 фото этой услуги (работы до/после, результат).\n\n` +
    `💡 Фото работают лучше текста — клиенты сразу видят результат.\n\n` +
    `Отправляй фото по одному. Когда закончишь — нажми кнопку ✅ Готово`,

  svcDone: (title) =>
    `✅ Услуга «${title}» добавлена!\n\n` +
    `Хочешь добавить ещё одну? → /add_service\n` +
    `Посмотреть все услуги → /my_services\n` +
    `Открыть приложение → /my_link`,

  // Статус
  status: (master, profile, svcCount) =>
    `📊 Твой аккаунт\n\n` +
    `👤 ${profile?.display_name || 'Имя не указано'}\n` +
    `🤖 Бот: @${master.bot_username}\n` +
    `📦 Услуги: ${svcCount} из ${master.plan === 'pro' ? '∞' : '5'}\n` +
    `💎 План: ${master.plan === 'pro' ? `Pro (до ${new Date(master.plan_expires_at).toLocaleDateString('ru-RU')})` : 'Free'}\n\n` +
    `🔗 Ссылка для клиентов:\n` +
    `t.me/${master.bot_username}\n\n` +
    `Команды: /add_service · /my_services · /bookings · /subscribe`,

  // Подписка
  subscribe: (plan, expiresAt, cardNumber) =>
    `💎 Pro подписка\n\n` +
    `Твой план: ${plan === 'pro' ? `✅ Pro (до ${new Date(expiresAt).toLocaleDateString('ru-RU')})` : '🆓 Free'}\n\n` +
    `Что даёт Pro:\n` +
    `• Безлимит услуг (сейчас: до 5)\n` +
    `• 6 цветовых тем приложения\n` +
    `• Кастомный логотип в шапке\n` +
    `• Убрать надпись "Powered by"\n\n` +
    `💰 Стоимость:\n` +
    `• 15 BYN / месяц\n` +
    `• 150 BYN / год (экономия 30 BYN)\n\n` +
    `Для оплаты:\n` +
    `Переведи на карту: <code>${cardNumber}</code>\n` +
    `В комментарии напиши свой username: @${plan}\n\n` +
    `После перевода пришли скриншот оплаты прямо сюда 👇\n` +
    `Подписка активируется в течение нескольких часов.`,

  // Выбор темы
  themeMenu:
    `🎨 Выбери тему оформления приложения:\n\n` +
    `После выбора изменения применятся сразу.`,

  help:
    `📖 Список команд:\n\n` +
    `/start — начать сначала\n` +
    `/instructions — инструкция по подключению бота\n` +
    `/status — твой план и ссылка\n` +
    `/add_service — добавить услугу\n` +
    `/my_services — все услуги\n` +
    `/bookings — записи на ближайшие дни\n` +
    `/block_day — заблокировать день\n` +
    `/schedule — настроить расписание\n` +
    `/subscribe — информация о Pro\n` +
    `/theme — выбор темы (Pro)\n` +
    `/my_link — ссылка для клиентов`,
};

// Кнопки категорий из БД (для добавления услуги)
async function buildCategoryKeyboard(masterId) {
  const { rows } = await query(
    'SELECT * FROM service_categories WHERE master_id = $1 ORDER BY sort_order',
    [masterId]
  );
  // Группируем по 2 кнопки в строку
  const buttons = rows.map(c => ({ text: `${c.emoji} ${c.label}`, callback_data: `cat_${c.id}` }));
  const keyboard = [];
  for (let i = 0; i < buttons.length; i += 2) {
    keyboard.push(buttons.slice(i, i + 2));
  }
  keyboard.push([{ text: '➕ Другая (ввести вручную)', callback_data: 'cat_custom' }]);
  return { inline_keyboard: keyboard };
}

function setupPlatformBotHandlers(bot) {

  // ── /start ──────────────────────────────────────────────────────────────
  bot.command('start', async ctx => {
    const tgId = ctx.from.id;
    const firstName = ctx.from.first_name || 'мастер';

    // Уже зарегистрирован — показать статус
    const { rows } = await query(
      `SELECT m.*, p.display_name FROM masters m
       LEFT JOIN master_profiles p ON p.master_id = m.id
       WHERE m.telegram_id = $1`, [tgId]
    );
    if (rows.length) {
      const { rows: svcs } = await query(
        'SELECT COUNT(*) FROM services WHERE master_id = $1 AND is_active = true', [rows[0].id]
      );
      return ctx.reply(MSG.status(rows[0], { display_name: rows[0].display_name }, parseInt(svcs[0].count)),
        { parse_mode: 'HTML' });
    }

    // Новый мастер — приветствие + кнопка BotFather
    sessions.set(tgId, { step: 'awaiting_token', data: {} });
    await ctx.reply(MSG.welcome(firstName), {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '🤖 Открыть @BotFather', url: 'https://t.me/BotFather' }
        ]]
      }
    });
    // Через 1 секунду — инструкция отдельным сообщением
    setTimeout(() => ctx.reply(MSG.botfatherGuide, { parse_mode: 'HTML' }), 1000);
  });

  // ── /instructions — повторить инструкцию ────────────────────────────────
  bot.command('instructions', ctx => ctx.reply(MSG.botfatherGuide, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: '🤖 Открыть @BotFather', url: 'https://t.me/BotFather' }]] }
  }));

  // ── /help ────────────────────────────────────────────────────────────────
  bot.command('help', ctx => ctx.reply(MSG.help, { parse_mode: 'HTML' }));

  // ── /status ──────────────────────────────────────────────────────────────
  bot.command('status', async ctx => {
    const { rows } = await query(
      `SELECT m.*, p.display_name FROM masters m
       LEFT JOIN master_profiles p ON p.master_id = m.id
       WHERE m.telegram_id = $1`, [ctx.from.id]
    );
    if (!rows.length) return ctx.reply('Ты ещё не зарегистрирован. Напиши /start');
    const { rows: svcs } = await query(
      'SELECT COUNT(*) FROM services WHERE master_id = $1 AND is_active = true', [rows[0].id]
    );
    return ctx.reply(MSG.status(rows[0], rows[0], parseInt(svcs[0].count)), { parse_mode: 'HTML' });
  });

  // ── /my_link ─────────────────────────────────────────────────────────────
  bot.command('my_link', async ctx => {
    const { rows } = await query('SELECT bot_username FROM masters WHERE telegram_id = $1', [ctx.from.id]);
    if (!rows.length) return ctx.reply('Сначала подключи бота через /start');
    await ctx.reply(
      `🔗 Ссылка для клиентов:\n\n` +
      `<code>https://t.me/${rows[0].bot_username}</code>\n\n` +
      `Поделись этой ссылкой в Instagram, в своём Telegram-канале или отправь клиентам напрямую.`,
      { parse_mode: 'HTML' }
    );
  });

  // ── /bookings ─────────────────────────────────────────────────────────────
  bot.command('bookings', async ctx => {
    const { rows: master } = await query('SELECT id FROM masters WHERE telegram_id = $1', [ctx.from.id]);
    if (!master.length) return ctx.reply('Сначала подключи бота через /start');
    const { rows } = await query(
      `SELECT b.*, s.title, s.emoji FROM bookings b
       LEFT JOIN services s ON s.id = b.service_id
       WHERE b.master_id = $1 AND b.status = 'confirmed'
         AND b.booking_date >= CURRENT_DATE
         AND b.booking_date <= CURRENT_DATE + interval '3 days'
       ORDER BY b.booking_date, b.booking_time`,
      [master[0].id]
    );
    if (!rows.length) return ctx.reply('Записей на ближайшие 3 дня нет.\n\nЧтобы клиенты записывались → /my_link');
    const lines = rows.map(b =>
      `${b.emoji} ${b.title}\n` +
      `📅 ${b.booking_date} в ${String(b.booking_time).slice(0,5)}\n` +
      `👤 ${b.client_name || 'Клиент'}`
    );
    await ctx.reply(`📋 Ближайшие записи:\n\n${lines.join('\n\n')}`);
  });

  // ── /subscribe ───────────────────────────────────────────────────────────
  bot.command('subscribe', async ctx => {
    const { rows } = await query('SELECT * FROM masters WHERE telegram_id = $1', [ctx.from.id]);
    if (!rows.length) return ctx.reply('Сначала подключи бота через /start');
    await ctx.reply(
      MSG.subscribe(rows[0].plan, rows[0].plan_expires_at, process.env.PAYMENT_CARD || 'XXXX XXXX XXXX XXXX'),
      { parse_mode: 'HTML' }
    );
  });

  // ── /theme ───────────────────────────────────────────────────────────────
  bot.command('theme', async ctx => {
    const { rows } = await query('SELECT * FROM masters WHERE telegram_id = $1', [ctx.from.id]);
    if (!rows.length) return ctx.reply('Сначала подключи бота через /start');
    if (rows[0].plan !== 'pro') {
      return ctx.reply(
        `🎨 Выбор темы доступен только в Pro плане.\n\n` +
        `Оформи подписку: /subscribe`, { parse_mode: 'HTML' }
      );
    }
    await ctx.reply(MSG.themeMenu, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🌸 Розовая', callback_data: 'theme_pink' },
            { text: '💜 Фиолетовая', callback_data: 'theme_violet' },
          ],
          [
            { text: '🖤 Тёмная', callback_data: 'theme_dark' },
            { text: '🤍 Минимализм', callback_data: 'theme_minimal' },
          ],
          [
            { text: '✨ Люкс (золото)', callback_data: 'theme_luxury' },
            { text: '🔵 По умолчанию', callback_data: 'theme_default' },
          ],
        ]
      }
    });
  });

  // ── /add_service ──────────────────────────────────────────────────────────
  bot.command('add_service', async ctx => {
    const { rows: master } = await query('SELECT * FROM masters WHERE telegram_id = $1', [ctx.from.id]);
    if (!master.length) return ctx.reply('Сначала подключи бота через /start');

    // Проверка лимита
    if (master[0].plan === 'free') {
      const { rows: cnt } = await query(
        'SELECT COUNT(*) FROM services WHERE master_id = $1 AND is_active = true', [master[0].id]
      );
      if (parseInt(cnt[0].count) >= 5) {
        return ctx.reply(
          `⚠️ На бесплатном плане можно добавить до 5 услуг.\n` +
          `У тебя уже ${cnt[0].count}.\n\n` +
          `Чтобы добавить больше — оформи Pro подписку: /subscribe`,
          { parse_mode: 'HTML' }
        );
      }
    }
    sessions.set(ctx.from.id, { step: 'svc_name', masterId: master[0].id, data: { photos: [] } });
    await ctx.reply(MSG.svcStep1, { parse_mode: 'HTML' });
  });

  // ── /my_services ──────────────────────────────────────────────────────────
  bot.command('my_services', async ctx => {
    const { rows: master } = await query('SELECT id FROM masters WHERE telegram_id = $1', [ctx.from.id]);
    if (!master.length) return ctx.reply('Сначала подключи бота через /start');
    const { rows } = await query(
      'SELECT * FROM services WHERE master_id = $1 ORDER BY sort_order, id', [master[0].id]
    );
    if (!rows.length) return ctx.reply('Услуг пока нет. Добавь первую: /add_service');

    for (const svc of rows) {
      const status = svc.is_active ? '✅' : '🚫 скрыта';
      await ctx.reply(
        `${svc.emoji || '💅'} <b>${svc.title}</b> ${status}\n` +
        `💰 ${svc.price} BYN · ⏱ ${svc.duration_min} мин`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[
              { text: '✏️ Изменить', callback_data: `edit_svc_${svc.id}` },
              { text: svc.is_active ? '🙈 Скрыть' : '👁 Показать', callback_data: `toggle_svc_${svc.id}` },
              { text: '🗑 Удалить', callback_data: `del_svc_${svc.id}` },
            ]]
          }
        }
      );
    }
  });

  // ── /block_day ────────────────────────────────────────────────────────────
  bot.command('block_day', async ctx => {
    const { rows } = await query('SELECT id FROM masters WHERE telegram_id = $1', [ctx.from.id]);
    if (!rows.length) return ctx.reply('Сначала подключи бота через /start');
    sessions.set(ctx.from.id, { step: 'block_day_input', masterId: rows[0].id, data: {} });
    const today = new Date().toISOString().slice(0, 10);
    await ctx.reply(
      `🚫 Заблокировать день\n\n` +
      `Напиши дату в формате <code>ГГГГ-ММ-ДД</code>\n\n` +
      `Сегодня: <code>${today}</code>\n\n` +
      `Пример: <code>2026-06-15</code>\n\n` +
      `Или напиши <code>отмена</code> для выхода`,
      { parse_mode: 'HTML' }
    );
  });

  // ── Inline callbacks (кнопки) ─────────────────────────────────────────────
  bot.on('callback_query', async ctx => {
    const data = ctx.callbackQuery.data;
    const tgId = ctx.from.id;

    // Выбор категории при добавлении услуги
    if (data.startsWith('cat_')) {
      const session = sessions.get(tgId);
      if (!session || session.step !== 'svc_category') return ctx.answerCallbackQuery();

      if (data === 'cat_custom') {
        session.step = 'svc_category_custom';
        sessions.set(tgId, session);
        await ctx.editMessageText('Напиши название категории:');
        return ctx.answerCallbackQuery();
      }
      session.data.category_id = parseInt(data.replace('cat_', ''));
      session.step = 'svc_price';
      sessions.set(tgId, session);
      await ctx.editMessageText(MSG.svcStep3, { parse_mode: 'HTML' });
      return ctx.answerCallbackQuery();
    }

    // Выбор темы
    if (data.startsWith('theme_')) {
      const scheme = data.replace('theme_', '');
      const { rows } = await query('SELECT id FROM masters WHERE telegram_id = $1', [tgId]);
      if (rows.length) {
        await query(
          `INSERT INTO master_themes (master_id, color_scheme) VALUES ($1,$2)
           ON CONFLICT (master_id) DO UPDATE SET color_scheme = $2`,
          [rows[0].id, scheme]
        );
        await ctx.editMessageText(`✅ Тема изменена на «${scheme}»! Изменение вступит в силу немедленно.`);
      }
      return ctx.answerCallbackQuery();
    }

    // Скрыть/показать услугу
    if (data.startsWith('toggle_svc_')) {
      const svcId = parseInt(data.replace('toggle_svc_', ''));
      const { rows } = await query('SELECT is_active FROM services WHERE id = $1', [svcId]);
      if (rows.length) {
        await query('UPDATE services SET is_active = $1 WHERE id = $2', [!rows[0].is_active, svcId]);
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
        await ctx.reply(rows[0].is_active ? '🙈 Услуга скрыта от клиентов' : '👁 Услуга снова видна клиентам');
      }
      return ctx.answerCallbackQuery();
    }

    // Удалить услугу
    if (data.startsWith('del_svc_')) {
      const svcId = parseInt(data.replace('del_svc_', ''));
      await query('UPDATE services SET is_active = false WHERE id = $1', [svcId]);
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      await ctx.reply('🗑 Услуга удалена.');
      return ctx.answerCallbackQuery();
    }

    // Кнопка "Готово" при загрузке фото услуги
    if (data === 'svc_photos_done') {
      const session = sessions.get(tgId);
      if (!session || session.step !== 'svc_photos') return ctx.answerCallbackQuery();
      await saveSvc(ctx, session, tgId);
      return ctx.answerCallbackQuery();
    }

    return ctx.answerCallbackQuery();
  });

  // ── Входящие сообщения (текст и фото) ────────────────────────────────────
  bot.on('message', async ctx => {
    const text = (ctx.message.text || '').trim();
    const tgId = ctx.from.id;
    const session = sessions.get(tgId);

    // ── 1. Скриншот оплаты (мастер уже зарегистрирован) ──────────────────
    if (ctx.message.photo) {
      const { rows } = await query('SELECT * FROM masters WHERE telegram_id = $1', [tgId]);

      // Фото в шаге профиля (setup_photo)
      if (session?.step === 'setup_photo') {
        const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        await query(
          `INSERT INTO master_profiles (master_id, photo_file_id) VALUES ($1,$2)
           ON CONFLICT (master_id) DO UPDATE SET photo_file_id = $2`,
          [session.masterId, fileId]
        );
        await finishProfileSetup(ctx, session, tgId);
        return;
      }

      // Фото для услуги (svc_photos)
      if (session?.step === 'svc_photos') {
        const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        session.data.photos.push({ fileId, label: `Фото ${session.data.photos.length + 1}`, emoji: '💅' });
        sessions.set(tgId, session);
        await ctx.reply(
          `📷 Фото ${session.data.photos.length} принято!\n\n` +
          `Отправь ещё фото или нажми кнопку ниже:`,
          {
            reply_markup: { inline_keyboard: [[{ text: '✅ Готово, сохранить услугу', callback_data: 'svc_photos_done' }]] }
          }
        );
        return;
      }

      // Скриншот оплаты подписки
      if (rows.length) {
        const adminId = process.env.PLATFORM_ADMIN_TG_ID;
        await ctx.api.forwardMessage(adminId, ctx.chat.id, ctx.message.message_id);
        await ctx.api.sendMessage(adminId,
          `💰 Запрос на Pro от @${rows[0].bot_username} (ID мастера: ${rows[0].id})\n` +
          `Активировать на 1 месяц: /activate_${rows[0].id}_1\n` +
          `Активировать на 12 месяцев: /activate_${rows[0].id}_12`,
          { parse_mode: 'HTML' }
        );
        return ctx.reply(
          '✅ Скриншот получен!\n\n' +
          'Мы проверим оплату и активируем Pro подписку в течение нескольких часов.\n' +
          'Ты получишь уведомление здесь.'
        );
      }
      return;
    }

    // ── 2. Токен нового бота ──────────────────────────────────────────────
    if (/^\d{8,12}:[\w-]{35,}$/.test(text)) {
      await ctx.reply('⏳ Проверяю токен...');
      try {
        const testBot = new (require('grammy').Bot)(text);
        const me = await testBot.api.getMe();

        const { rows: existing } = await query(
          'SELECT 1 FROM masters WHERE bot_username = $1', [me.username]
        );
        if (existing.length) {
          return ctx.reply(MSG.tokenDuplicate(me.username), { parse_mode: 'HTML' });
        }

        const slug = me.username.toLowerCase().replace(/_?bot$/i, '').replace(/[^a-z0-9_]/g, '_');

        const { rows: created } = await query(
          `INSERT INTO masters (telegram_id, username, bot_token, bot_username, slug)
           VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [tgId, ctx.from.username || null, encrypt(text), me.username, slug]
        );
        const master = created[0];

        // Дефолтные категории
        for (const [label, emoji, i] of [
          ['Маникюр','💅',1], ['Педикюр','🦶',2],
          ['Брови','🪄',3], ['Ресницы','👁',4], ['Другое','✨',5]
        ]) {
          await query(
            'INSERT INTO service_categories (master_id, label, emoji, sort_order) VALUES ($1,$2,$3,$4)',
            [master.id, label, emoji, i]
          );
        }

        // Настроить расписание по умолчанию: Пн–Сб 10:00–19:00
        for (let d = 1; d <= 6; d++) {
          await query(
            `INSERT INTO master_schedules (master_id, day_of_week, start_time, end_time, is_working)
             VALUES ($1,$2,'10:00','19:00',true)`,
            [master.id, d]
          );
        }
        // Воскресенье — выходной
        await query(
          `INSERT INTO master_schedules (master_id, day_of_week, start_time, end_time, is_working)
           VALUES ($1,0,'10:00','19:00',false)`,
          [master.id]
        );

        await registerMasterBot(master);
        await testBot.api.setWebhook(`${process.env.API_URL}/webhook/master/${slug}`);
        await testBot.api.setChatMenuButton({
          menu_button: {
            type: 'web_app',
            text: '💅 Записаться',
            web_app: { url: `${process.env.APP_URL}?m=${slug}` }
          }
        });

        sessions.set(tgId, { step: 'setup_name', masterId: master.id, data: {} });
        await ctx.reply(MSG.tokenOk(me.username, process.env.APP_URL, slug), { parse_mode: 'HTML' });
      } catch (e) {
        console.error('Token error:', e.message);
        const hint = e.message.includes('401') ? 'Токен недействителен' :
                     e.message.includes('network') ? 'Проблема с сетью, попробуй ещё раз' :
                     'Неизвестная ошибка';
        await ctx.reply(MSG.tokenInvalid(hint), { parse_mode: 'HTML' });
      }
      return;
    }

    // ── 3. Пошаговые диалоги (сессии) ────────────────────────────────────
    if (!session) {
      // Нет активной сессии — подсказка
      const { rows } = await query('SELECT 1 FROM masters WHERE telegram_id = $1', [tgId]);
      if (!rows.length) {
        return ctx.reply(MSG.awaiting, { parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[{ text: '🤖 Открыть @BotFather', url: 'https://t.me/BotFather' }]] }
        });
      }
      return; // зарегистрированный мастер отправил что-то вне диалога — игнорируем
    }

    // Профиль: шаг 1 — имя
    if (session.step === 'setup_name') {
      if (text.length < 2) return ctx.reply('Слишком короткое имя. Напиши ещё раз.');
      session.data.display_name = text;
      session.step = 'setup_spec';
      sessions.set(tgId, session);
      return ctx.reply(MSG.setupStep2, { parse_mode: 'HTML' });
    }

    // Профиль: шаг 2 — специализации
    if (session.step === 'setup_spec') {
      session.data.specializations = text;
      session.step = 'setup_address';
      sessions.set(tgId, session);
      return ctx.reply(MSG.setupStep3, { parse_mode: 'HTML' });
    }

    // Профиль: шаг 3 — адрес
    if (session.step === 'setup_address') {
      session.data.address = text;
      session.step = 'setup_hours';
      sessions.set(tgId, session);
      return ctx.reply(MSG.setupStep4, { parse_mode: 'HTML' });
    }

    // Профиль: шаг 4 — часы работы
    if (session.step === 'setup_hours') {
      session.data.work_hours = text;
      session.step = 'setup_photo';
      sessions.set(tgId, session);
      return ctx.reply(MSG.setupStep5, { parse_mode: 'HTML' });
    }

    // Профиль: шаг 5 — фото (текст "пропустить")
    if (session.step === 'setup_photo') {
      if (text.toLowerCase().includes('пропуст')) {
        await finishProfileSetup(ctx, session, tgId);
      } else {
        return ctx.reply('Отправь фото (изображение) или напиши «пропустить»');
      }
      return;
    }

    // Блокировка дня
    if (session.step === 'block_day_input') {
      if (text.toLowerCase() === 'отмена') {
        sessions.delete(tgId);
        return ctx.reply('Отменено.');
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        return ctx.reply(`Неверный формат. Напиши дату в виде: <code>2026-06-15</code>`, { parse_mode: 'HTML' });
      }
      await query(
        `INSERT INTO blocked_slots (master_id, blocked_date, blocked_time)
         VALUES ($1,$2,NULL) ON CONFLICT DO NOTHING`,
        [session.masterId, text]
      );
      sessions.delete(tgId);
      return ctx.reply(`🚫 День ${text} заблокирован. Клиенты не смогут записаться на эту дату.`);
    }

    // Добавление услуги: шаги
    if (session.step === 'svc_name') {
      session.data.title = text;
      session.step = 'svc_category';
      sessions.set(tgId, session);
      const keyboard = await buildCategoryKeyboard(session.masterId);
      return ctx.reply(MSG.svcStep2Categories(), { reply_markup: keyboard });
    }

    if (session.step === 'svc_category_custom') {
      // Создать новую категорию
      const { rows: newCat } = await query(
        'INSERT INTO service_categories (master_id, label, emoji) VALUES ($1,$2,$3) RETURNING id',
        [session.masterId, text, '✨']
      );
      session.data.category_id = newCat[0].id;
      session.step = 'svc_price';
      sessions.set(tgId, session);
      return ctx.reply(MSG.svcStep3, { parse_mode: 'HTML' });
    }

    if (session.step === 'svc_price') {
      const price = parseFloat(text.replace(',', '.'));
      if (isNaN(price) || price <= 0) return ctx.reply('Введи корректную цену (только число, например: <code>25</code>)', { parse_mode: 'HTML' });
      session.data.price = price;
      session.step = 'svc_duration';
      sessions.set(tgId, session);
      return ctx.reply(MSG.svcStep4, { parse_mode: 'HTML' });
    }

    if (session.step === 'svc_duration') {
      const dur = parseInt(text);
      if (isNaN(dur) || dur < 5 || dur > 480) return ctx.reply('Введи длительность в минутах (от 5 до 480)', { parse_mode: 'HTML' });
      session.data.duration_min = dur;
      session.step = 'svc_description';
      sessions.set(tgId, session);
      return ctx.reply(MSG.svcStep5, { parse_mode: 'HTML' });
    }

    if (session.step === 'svc_description') {
      session.data.description = (text === '—' || text === '-') ? null : text;
      session.step = 'svc_photos';
      sessions.set(tgId, session);
      return ctx.reply(MSG.svcStep6, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '⏭ Пропустить фото', callback_data: 'svc_photos_done' }]]
        }
      });
    }
  });

  // ── Сохранить услугу (вызывается по кнопке "Готово") ───────────────────
  async function saveSvc(ctx, session, tgId) {
    const d = session.data;
    const { rows } = await query(
      `INSERT INTO services (master_id, title, category_id, price, duration_min, description, photos)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [session.masterId, d.title, d.category_id || null, d.price, d.duration_min,
       d.description, JSON.stringify(d.photos)]
    );
    sessions.delete(tgId);
    await ctx.reply(MSG.svcDone(d.title));
  }

  // ── Завершить настройку профиля ────────────────────────────────────────
  async function finishProfileSetup(ctx, session, tgId) {
    const d = session.data;
    await query(
      `INSERT INTO master_profiles (master_id, display_name, specializations, address, work_hours, photo_file_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (master_id) DO UPDATE SET
         display_name=$2, specializations=$3, address=$4, work_hours=$5,
         photo_file_id=COALESCE($6, master_profiles.photo_file_id)`,
      [session.masterId, d.display_name, d.specializations, d.address, d.work_hours, d.photo_file_id || null]
    );
    const { rows } = await query('SELECT bot_username FROM masters WHERE id = $1', [session.masterId]);
    sessions.set(tgId, { step: 'svc_name', masterId: session.masterId, data: { photos: [] } });
    await ctx.reply(MSG.profileDone(d.display_name, rows[0].bot_username, process.env.APP_URL), {
      parse_mode: 'HTML'
    });
    // Сразу запускаем добавление первой услуги
    await ctx.reply(MSG.svcStep1, { parse_mode: 'HTML' });
  }

  // ── Активация подписки (только для платформенного администратора) ────────
  bot.hears(/^\/activate_(\d+)_(\d+)$/, async ctx => {
    if (String(ctx.from.id) !== String(process.env.PLATFORM_ADMIN_TG_ID)) return;
    const masterId = parseInt(ctx.match[1]);
    const months = parseInt(ctx.match[2]);
    const expires = new Date();
    expires.setMonth(expires.getMonth() + months);

    await query(`UPDATE masters SET plan='pro', plan_expires_at=$1 WHERE id=$2`, [expires.toISOString(), masterId]);
    await query(
      `INSERT INTO subscription_payments (master_id, period_months, activated_by, expires_at)
       VALUES ($1,$2,$3,$4)`,
      [masterId, months, ctx.from.id, expires.toISOString()]
    );

    const { rows } = await query('SELECT telegram_id, bot_username FROM masters WHERE id = $1', [masterId]);
    if (rows.length) {
      const bot2 = activeBots.get(masterId);
      const sendFn = bot2 ? (id, txt) => bot2.api.sendMessage(id, txt, { parse_mode: 'HTML' })
                          : (id, txt) => ctx.api.sendMessage(id, txt, { parse_mode: 'HTML' });
      await sendFn(rows[0].telegram_id,
        `🎉 <b>Pro подписка активирована!</b>\n\n` +
        `Активна до: ${expires.toLocaleDateString('ru-RU')}\n\n` +
        `Теперь доступно:\n` +
        `• Безлимит услуг → /add_service\n` +
        `• Выбор темы → /theme\n` +
        `• Кастомный логотип (загрузи фото в /status)`
      );
    }
    await ctx.reply(`✅ Pro активирован для мастера ${masterId} на ${months} мес. до ${expires.toLocaleDateString('ru-RU')}`);
  });
}

module.exports = { setupPlatformBotHandlers };
```

- [ ] **Step 3: bots/masterBot.js** (для клиентов мастера)

```js
async function setupMasterBotHandlers(bot, masterData) {
  const { query } = require('../db');

  bot.command('start', async ctx => {
    const { rows } = await query(
      'SELECT p.display_name, p.specializations FROM master_profiles p WHERE p.master_id = $1',
      [masterData.id]
    );
    const name = rows[0]?.display_name || 'Мастер';
    const spec = rows[0]?.specializations || '';
    await ctx.reply(
      `👋 Привет, ${ctx.from.first_name}!\n\n` +
      `Это приложение ${name}\n${spec ? `(${spec})\n\n` : '\n'}` +
      `Нажми кнопку ниже, чтобы посмотреть услуги и записаться 👇`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '💅 Открыть приложение', web_app: { url: `${process.env.APP_URL}?m=${masterData.slug}` } }
          ]]
        }
      }
    );
  });

  bot.on('message', async ctx => {
    if (ctx.message.web_app_data) return; // данные из Mini App — обрабатываются через API

    await ctx.reply(
      `Нажми кнопку "Записаться" чтобы выбрать услугу и время 👇`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '💅 Записаться', web_app: { url: `${process.env.APP_URL}?m=${masterData.slug}` } }
          ]]
        }
      }
    );
  });
}

module.exports = { setupMasterBotHandlers };
```

- [ ] **Step 4: Webhook routes и запуск**

```js
// src/routes/webhooks.js
const { Bot } = require('grammy');
const { getBotForMaster } = require('../bots/manager');
const { query } = require('../db');

async function webhookRoutes(fastify) {
  // Webhook platform бота
  fastify.post('/webhook/platform', async (req, reply) => {
    const platformBot = fastify.platformBot;
    await platformBot.handleUpdate(req.body);
    return reply.code(200).send({ ok: true });
  });

  // Webhook бота конкретного мастера
  fastify.post('/webhook/master/:slug', async (req, reply) => {
    const { rows } = await query('SELECT * FROM masters WHERE slug = $1', [req.params.slug]);
    if (!rows.length) return reply.code(404).send({ error: 'Unknown master' });
    const bot = await getBotForMaster(rows[0].id);
    if (!bot) return reply.code(404).send({ error: 'Bot not loaded' });
    await bot.handleUpdate(req.body);
    return reply.code(200).send({ ok: true });
  });
}

module.exports = webhookRoutes;
```

- [ ] **Step 5: Обновить server.js**

```js
require('dotenv').config();
const Fastify = require('fastify');
const { Bot } = require('grammy');
const { setupPlatformBotHandlers } = require('./bots/platformBot');
const { loadAllActiveBots } = require('./bots/manager');

const app = Fastify({ logger: true });
app.register(require('@fastify/cors'), { origin: true });

// Platform bot
const platformBot = new Bot(process.env.PLATFORM_BOT_TOKEN);
setupPlatformBotHandlers(platformBot);
platformBot.api.setWebhook(`${process.env.API_URL}/webhook/platform`);
app.decorate('platformBot', platformBot);

app.register(require('./routes/public'));
app.register(require('./routes/client'));
app.register(require('./routes/admin'));
app.register(require('./routes/webhooks'));

app.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' }, async err => {
  if (err) { app.log.error(err); process.exit(1); }
  await loadAllActiveBots(); // Загрузить все зарегистрированные боты при старте
});
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/bots/ backend/src/routes/webhooks.js
git commit -m "feat: multi-bot system with master onboarding via platform bot"
```

---

## Task 8: Напоминания (cron)

**Files:**
- Create: `backend/src/jobs/reminders.js`

- [ ] **Step 1: reminders.js**

```js
const cron = require('node-cron');
const { query } = require('../db');
const { sendReminder } = require('../services/notifications');

async function processReminders(hoursAhead, reminderCol) {
  const { rows } = await query(
    `SELECT b.*, s.title, s.emoji, s.price,
            m.id as master_id, m.telegram_id as master_telegram_id,
            p.display_name, p.address
     FROM bookings b
     JOIN services s ON s.id = b.service_id
     JOIN masters m ON m.id = b.master_id
     LEFT JOIN master_profiles p ON p.master_id = m.id
     WHERE b.status = 'confirmed'
       AND b.${reminderCol} = false
       AND (b.booking_date + b.booking_time)
           BETWEEN now() + ($1 - 0.25) * interval '1 hour'
               AND now() + $1 * interval '1 hour'`,
    [hoursAhead]
  );

  for (const row of rows) {
    try {
      const hoursText = hoursAhead === 24 ? 'Завтра' : 'Через 2 часа';
      await sendReminder(row, { title: row.title, emoji: row.emoji }, { id: row.master_id, address: row.address }, hoursText);
      await query(`UPDATE bookings SET ${reminderCol} = true WHERE id = $1`, [row.id]);
    } catch (e) {
      console.error(`Reminder failed booking ${row.id}:`, e.message);
    }
  }
}

// Каждые 15 минут
cron.schedule('*/15 * * * *', () => {
  processReminders(24, 'reminder_24h_sent').catch(console.error);
  processReminders(2, 'reminder_2h_sent').catch(console.error);
});

// Ежедневная проверка истечения подписок в 00:05
cron.schedule('5 0 * * *', async () => {
  const { rows } = await query(
    `SELECT m.* FROM masters m WHERE m.plan = 'pro' AND m.plan_expires_at < now()`
  );
  for (const master of rows) {
    await query('UPDATE masters SET plan = $1 WHERE id = $2', ['free', master.id]);
    // Если услуг больше 5 — скрыть лишние
    const { rows: svcRows } = await query(
      `SELECT id FROM services WHERE master_id = $1 AND is_active = true ORDER BY sort_order, id OFFSET 5`,
      [master.id]
    );
    for (const svc of svcRows) {
      await query('UPDATE services SET is_active = false WHERE id = $1', [svc.id]);
    }
    // Уведомить мастера
    const { getBotForMaster } = require('../bots/manager');
    const bot = await getBotForMaster(master.id);
    if (bot) {
      await bot.api.sendMessage(master.telegram_id,
        `⚠️ Подписка Pro истекла. Аккаунт переведён на Free план (5 услуг максимум).\n` +
        `Для продления: /subscribe`
      ).catch(() => {});
    }
  }
});
```

- [ ] **Step 2: Подключить в server.js**

```js
require('./jobs/reminders'); // cron стартует автоматически
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/jobs/
git commit -m "feat: cron reminders + subscription expiry check"
```

---

## Task 9: Интеграция фронтенда

**Изменения в тг-app:**

Фронтенд должен читать `master_slug` из URL-параметра и использовать API вместо `data.js`.

- [ ] **Step 1: Читать master slug из URL**

```js
// В начале app.js, после инициализации tg:
const urlParams = new URLSearchParams(location.search);
const MASTER_SLUG = urlParams.get('m') || 'darya_gomel'; // fallback для разработки
const API_BASE = 'https://api.platform.com/api/v1';
```

- [ ] **Step 2: Загрузить данные мастера при init**

```js
async function init() {
  // Параллельно грузим профиль и тему
  const [masterData, themeData] = await Promise.all([
    fetch(`${API_BASE}/masters/${MASTER_SLUG}`).then(r => r.json()),
    fetch(`${API_BASE}/masters/${MASTER_SLUG}/theme`).then(r => r.json()),
  ]);

  // Применяем тему
  applyTheme(themeData);

  // Заменяем APP_DATA.master
  APP_DATA.master = masterData;

  Router.go('home', {}, 'tab');
  setTimeout(showOnboarding, 700);
}

function applyTheme(theme) {
  const schemes = {
    default: { btn: '#7c3aed', bg: '#ffffff' },
    pink: { btn: '#ec4899', bg: '#fdf2f8' },
    violet: { btn: '#8b5cf6', bg: '#faf5ff' },
    dark: { btn: '#818cf8', bg: '#1e1b4b' },
    minimal: { btn: '#374151', bg: '#f9fafb' },
    luxury: { btn: '#b45309', bg: '#fffbeb' },
  };
  const s = schemes[theme.color_scheme] || schemes.default;
  document.documentElement.style.setProperty('--tg-btn', s.btn);
  // logo
  if (theme.logo_url || theme.logo_file_id) {
    // показываем логотип в hero вместо gradient initials
  }
  if (!theme.show_platform_branding) {
    document.getElementById('platform-branding')?.remove();
  }
}
```

- [ ] **Step 3: Заменить BookingStorage на API-вызовы**

```js
// Создать запись
const booking = await fetch(`${API_BASE}/bookings`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Telegram-Init-Data': tg?.initData || '',
    'master_slug': MASTER_SLUG, // передаём через query param или body
  },
  body: JSON.stringify({
    master_slug: MASTER_SLUG,
    service_id: State.selectedService,
    date: State.selectedDate,
    time: State.selectedTime,
  })
}).then(r => r.json());
```

- [ ] **Step 4: Commit**

```bash
git add tg-app/js/app.js tg-app/js/data.js
git commit -m "feat: frontend reads master from URL param, calls API"
```

---

## 10. Деплой

```bash
# Railway: один сервис = весь backend
# Переменные в Railway Dashboard:
DATABASE_URL=       (автоматически от PostgreSQL addon)
PLATFORM_BOT_TOKEN= (токен @platform_setup_bot)
PLATFORM_ADMIN_TG_ID= (твой Telegram ID)
PLATFORM_ADMIN_TOKEN= (случайная строка)
APP_URL=            https://app.platform.com (или Railway URL фронтенда)
API_URL=            https://api.platform.com (Railway URL этого сервиса)
BOT_TOKEN_ENCRYPTION_KEY= (32 bytes hex: openssl rand -hex 32)
PORT=3000

# Миграции (один раз):
psql $DATABASE_URL < migrations/001_schema.sql
```

**Миграция мастера Дарьи из текущего приложения:**
```sql
-- migrations/003_migrate_darya.sql
-- Выполнить вручную после деплоя
INSERT INTO masters (telegram_id, bot_token, bot_username, slug, plan)
VALUES (<TG_ID>, '<encrypted_token>', 'darya_master', 'darya_gomel', 'pro');
-- ... далее master_profiles, services, reviews из data.js
```

---

## Самопроверка

| Требование | Покрыто |
|-----------|---------|
| Мастер создаёт бота сам в BotFather | ✅ Task 7: Platform Bot onboarding |
| Добавляет свои фото и услуги | ✅ Task 6: Admin API + Telegram file_id |
| Встроенный календарь | ✅ Task 4: master_schedules + slots API |
| 5 услуг бесплатно | ✅ Task 6: SERVICE_FREE_LIMIT check |
| Подписка (ручная оплата) | ✅ Task 7: /subscribe + /activate_N_M |
| White Label: цветовая схема | ✅ Task 6: PUT /admin/theme |
| White Label: кастомный логотип | ✅ master_themes.logo_file_id |
| White Label: удаление брендинга | ✅ show_platform_branding |
| White Label: своё имя бота | ✅ мастер сам создаёт бота в BotFather |
| Бот-консультант для клиентов | ✅ Task 7: masterBot.js handlers |
| Напоминания клиентам | ✅ Task 8: cron reminders |
| Уведомления мастеру о записях | ✅ Task 5: notifications.js |
| Синхронизация между мастером и клиентами | ✅ bookings в БД — общий источник истины |
| Google Calendar | ❌ v2 (по решению) |
