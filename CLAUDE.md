# CLAUDE.md — Telegram Mini App: бьюти-мастер

## Структура проекта

```
tg_beauty_app/
├── tg-app/
│   ├── index.html        # Точка входа — HTML-оболочка
│   ├── css/
│   │   └── app.css       # Вся стилизация
│   └── js/
│       ├── data.js       # Данные, слоты, хранилище записей
│       └── app.js        # Логика, роутер, рендеринг экранов
├── brief.md              # Детальный план разработки (экраны, действия)
├── research.md           # Маркетинговое исследование + экспертная оценка
└── CLAUDE.md             # Этот файл
```

---

## Файлы и их роли

### `tg-app/index.html`
HTML-каркас без контента. Содержит:
- `<div id="screen-container">` — сюда роутер вставляет HTML каждого экрана
- `<nav id="bottom-nav">` — нижняя навигация (4 таба)
- `<div id="lightbox">` — оверлей для просмотра фото
- Подключает Telegram SDK, `app.css`, `data.js`, `app.js` (в таком порядке)

### `tg-app/js/data.js`
Единственный источник данных. Структура:

```
APP_DATA.master          — профиль мастера (имя, опыт, контакты, gradient-аватар)
APP_DATA.categories      — чипы фильтрации в каталоге
APP_DATA.services[]      — список услуг (id, title, price, duration, photos, …)
APP_DATA.reviews{}       — отзывы по id услуги: APP_DATA.reviews[serviceId]
```

Вспомогательные функции (не трогать без нужды):
- `seededRandom(seed)` — детерминированный PRNG для генерации слотов
- `generateAllSlots()` — строит `ALL_SLOTS[dateKey][time] = bool` на 45 дней
- `BookingStorage` — CRUD для записей в localStorage

### `tg-app/js/app.js`
Вся бизнес-логика. Разделена на секции с комментариями:

| Секция | Строки | Назначение |
|--------|--------|------------|
| 1. Telegram SDK | ~1–50 | `tg.ready()`, `tg.expand()`, применение themeParams |
| 2. State | ~52–90 | Глобальное состояние (таб, история, выбор услуги/даты/времени) |
| 3. Router | ~92–180 | `Router.go()`, `Router.back()`, `Router.goTab()` |
| 4. Utils | ~182–250 | `haptic()`, `stars()`, `initials()` |
| 5. Screens | ~253–1328 | Функции рендеринга каждого экрана |
| 6. Events | ~1330–1500 | Единый делегированный `click`-обработчик |
| 7. Touch/Swipe | ~1502–1560 | Свайп для галереи и лайтбокса |
| 8. Init | ~1562–1580 | `init()` → `Router.go('home')` |

### `tg-app/css/app.css`
CSS-переменные, темизация и все компоненты:

| Блок | Что стилизует |
|------|---------------|
| `:root` / `@media dark` | CSS-переменные (`--tg-bg`, `--tg-btn`, `--tg-hint`, …) |
| App shell | `#app`, `#screen-container`, `#bottom-nav`, `.nav-tab` |
| Transitions | `.screen`, `.screen-enter`, `.screen-exit-left`, `.screen-exit-right` |
| Buttons | `.btn-primary`, `.btn-outline`, `.btn-sm.accent/.outline/.danger` |
| Chips | `.chip`, `.chip.active`, `.chips-row` |
| Service card | `.service-card`, `.svc-thumb`, `.svc-body`, `.svc-rating` |
| Booking card | `.booking-card`, `.booking-status.confirmed/.cancelled/.soon` |
| Hero | `.hero`, `.hero-overlay`, `.hero-content` |
| Gallery | `.gallery-wrap`, `.gallery-slide`, `.gallery-dots` |
| Calendar | `.calendar-grid`, `.cal-day`, `.cal-day.available/.selected/.today` |
| Time slots | `.time-slot`, `.time-slot.active/.disabled` |
| Master screen | `.master-hero`, `.master-gallery`, `.master-grid-item` |
| Lightbox | `#lightbox`, `.lightbox-photo`, `.lightbox-prev/.next` |
| Animations | `fadeIn`, `popIn`, `slideUp`, `shimmer` |

---

## Экраны и навигация

```
[home] ──────────────────────────────────────────────────────────┐
  ├─ tap service card     → [service]                            │
  ├─ tap category chip    → [catalog] (с фильтром)               │
  ├─ tap "Записаться"     → [service] → [calendar]               │
  └─ tap "Смотреть все"   → [catalog]                            │
                                                                  │
[catalog] ───────────────────────────────────────────────────────┤
  ├─ tap service card     → [service]                            │
  └─ filters: chip, search → (в рамках экрана, без перехода)     │
                                                                  │
[service] ───────────────────────────────────────────────────────┤
  ├─ tap gallery photo    → lightbox                             │
  ├─ MainButton / "Записаться" → [calendar]                      │
  └─ Back                 → предыдущий экран                     │
                                                                  │
[calendar] ──────────────────────────────────────────────────────┤
  ├─ select date + time                                          │
  ├─ MainButton / "Продолжить" → [summary]                       │
  └─ Back                 → [service]                            │
                                                                  │
[summary] ───────────────────────────────────────────────────────┤
  ├─ "Изменить услугу"    → [service]                            │
  ├─ "Изменить дату"      → [calendar]                           │
  ├─ MainButton / "Подтвердить запись" → [success]               │
  └─ Back                 → [calendar]                           │
                                                                  │
[success] ───────────────────────────────────────────────────────┤
  ├─ "Перейти к записям"  → [bookings] (goTab)                   │
  └─ "На главную"         → [home] (goTab)                       │
                                                                  │
[bookings] ──────────────────────────────────────────────────────┤
  ├─ "Записаться снова"   → [service]                            │
  └─ "Отменить запись"    → showConfirm → отмена в localStorage  │
                                                                  │
[master] ────────────────────────────────────────────────────────┘
  ├─ "Написать в Telegram" → openTelegramLink
  ├─ "Instagram"           → openLink
  ├─ tap gallery photo     → lightbox
  └─ "Поделиться"          → switchInlineQuery
```

Переход вызывается через `Router.go(screenName, params)`:
- `'forward'` — анимация вправо→влево (по умолчанию)
- `'back'` — анимация влево→вправо (BackButton или `Router.back()`)
- `'tab'` — без анимации сдвига (переключение табов)

---

## Как изменить данные мастера

Открой `tg-app/js/data.js`, объект `APP_DATA.master`:

```js
master: {
  name: 'Марина Козлова',          // ← имя
  specializations: 'Маникюр · …', // ← подпись под именем
  bio: '…',                        // ← полное описание (экран Мастер)
  bioShort: '…',                   // ← короткое описание (главная)
  experience: 5,                   // ← лет опыта
  worksCount: 500,                 // ← кол-во работ
  rating: 4.9,
  reviewsCount: 127,
  gradient: 'linear-gradient(…)',  // ← аватар (можно заменить на img)
  initials: 'МК',
  instagram: '@marina_nails_msk',  // ← username без @, используется в ссылке
  telegram: 'marina_master',       // ← username без @
  address: 'Москва, м. Таганская',
  workHours: 'Пн–Сб, 10:00–20:00',
}
```

---

## Как добавить новую услугу

В `APP_DATA.services` добавь объект:

```js
{
  id: 6,                   // уникальный числовой id
  title: 'Название',
  categoryId: 'manicure',  // id из APP_DATA.categories
  price: 1200,             // в рублях
  duration: 60,            // в минутах
  rating: 4.8,
  reviewsCount: 12,
  description: 'Текст описания…',
  emoji: '💅',
  photos: [
    { gradient: 'linear-gradient(135deg, #…, #…)', label: 'Подпись', emoji: '💅' },
    // или: { url: 'https://…', label: 'Подпись', emoji: '💅' }
  ],
}
```

Отзывы для новой услуги добавь в `APP_DATA.reviews[6] = [{ name, rating, text, date }]`.

---

## Как добавить категорию

В `APP_DATA.categories`:

```js
{ id: 'eyebrows', label: 'Брови', emoji: '🪄' }
```

Затем используй этот `id` в поле `categoryId` у нужных услуг.

---

## Как заменить градиенты на реальные фото

В `photos[]` каждой услуги поменяй `gradient` на `url`:

```js
{ url: 'https://example.com/photo.jpg', label: 'Результат', emoji: '💅' }
```

В `app.js` функция `serviceCardHTML` и рендеринг галереи (функция `renderService`) уже обрабатывают оба варианта:
```js
const bg = photo.url ? `url(${photo.url}) center/cover` : photo.gradient;
```

---

## Записи (localStorage)

Ключ хранилища: `beauty_app_bookings` (задаётся в `BookingStorage.KEY`).

Формат одной записи:
```js
{
  id: 'booking_1716123600000',
  serviceId: 2,
  date: '2026-05-20',
  time: '11:00',
  status: 'confirmed',   // 'confirmed' | 'cancelled'
  createdAt: 1716123600000
}
```

---

## Telegram SDK — используемые функции

| Функция | Где вызывается |
|---------|---------------|
| `tg.ready()` | Старт приложения |
| `tg.expand()` | Старт — раскрываем на весь экран |
| `tg.themeParams` | Применение цветов темы к CSS-переменным |
| `tg.onEvent('themeChanged', …)` | Реакция на смену темы |
| `tg.BackButton.show/hide/onClick` | Router — управление кнопкой "Назад" |
| `tg.MainButton.show/hide/setText/onClick` | Router + экраны service/calendar/summary |
| `tg.HapticFeedback.impactOccurred` | Клики по кнопкам, выбор даты/времени |
| `tg.showConfirm(text, cb)` | Подтверждение отмены записи |
| `tg.openTelegramLink(url)` | Кнопка "Написать мастеру" |
| `tg.openLink(url)` | Кнопка "Instagram" |
| `tg.switchInlineQuery(text)` | Кнопка "Поделиться" |
| `tg.initDataUnsafe.user` | Имя пользователя для приветствия |

Все вызовы защищены optional chaining (`tg?.BackButton?.show()`), поэтому приложение работает и в обычном браузере (для разработки).

---

## Разработка без Telegram

Открой `tg-app/index.html` в браузере напрямую (Live Server / Python http.server).
- Имя пользователя будет "Гость"
- Кнопки MainButton/BackButton не будут видны (они рендерятся Telegram)
- Навигация работает через нижние табы и inline-кнопки внутри экранов
- Тема — из `@media (prefers-color-scheme: dark)` системы

```bash
# Быстрый старт локального сервера
cd tg-app
python -m http.server 8080
# Открыть: http://localhost:8080
```

---

## Что НЕ входит в v1

- Реальная база данных (записи только в localStorage)
- Авторизация / проверка initData на сервере
- Push-уведомления о записи
- Онлайн-оплата
- Мультимастерность
- Настройки мастера (admin-панель)
- Отзывы от пользователей (только статичные)
- Реальные фотографии работ (только CSS-градиенты)
