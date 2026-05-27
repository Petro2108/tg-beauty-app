/**
 * app.js — логика приложения
 *
 * Структура:
 *  1. Инициализация Telegram SDK
 *  2. Состояние приложения (State)
 *  3. Роутер (Router)
 *  4. Утилиты (haptic, рендер звёзд, инициалы)
 *  5. Экраны (renderHome, renderCatalog, renderService …)
 *  6. Обработчик событий (единый делегированный listener)
 *  7. Запуск (init)
 */

/* ══════════════════════════════════════════════════════════
   1. Инициализация Telegram SDK
   ══════════════════════════════════════════════════════════ */

// Telegram.WebApp может быть недоступен вне Telegram — graceful fallback
const tg = window.Telegram?.WebApp || null;

if (tg) {
  tg.ready();
  tg.expand(); // разворачиваем на весь экран

  // Применяем цвета Telegram к CSS-переменным
  const tp = tg.themeParams || {};
  const root = document.documentElement;
  if (tp.bg_color)           root.style.setProperty('--tg-bg',       tp.bg_color);
  if (tp.secondary_bg_color) root.style.setProperty('--tg-bg2',      tp.secondary_bg_color);
  if (tp.text_color)         root.style.setProperty('--tg-text',     tp.text_color);
  if (tp.hint_color)         root.style.setProperty('--tg-hint',     tp.hint_color);
  if (tp.link_color)         root.style.setProperty('--tg-link',     tp.link_color);
  if (tp.button_color)       root.style.setProperty('--tg-btn',      tp.button_color);
  if (tp.button_text_color)  root.style.setProperty('--tg-btn-text', tp.button_text_color);

  // Реагируем на смену темы (пользователь переключил тёмную тему)
  tg.onEvent('themeChanged', () => {
    const ntp = tg.themeParams || {};
    if (ntp.bg_color)           root.style.setProperty('--tg-bg',       ntp.bg_color);
    if (ntp.secondary_bg_color) root.style.setProperty('--tg-bg2',      ntp.secondary_bg_color);
    if (ntp.text_color)         root.style.setProperty('--tg-text',     ntp.text_color);
    if (ntp.hint_color)         root.style.setProperty('--tg-hint',     ntp.hint_color);
    if (ntp.button_color)       root.style.setProperty('--tg-btn',      ntp.button_color);
    if (ntp.button_text_color)  root.style.setProperty('--tg-btn-text', ntp.button_text_color);
  });
}

// Имя пользователя из Telegram (или "Гость" вне Telegram)
const tgUser = tg?.initDataUnsafe?.user || { first_name: 'Гость' };
const userName = tgUser.first_name || 'Гость';

// Multi-tenant: читаем slug мастера из URL (?m=darya_gomel)
const MASTER_SLUG = new URLSearchParams(location.search).get('m') || 'darya_gomel';
const API_BASE = (typeof window !== 'undefined' && window.API_BASE) || 'https://api.platform.com/api/v1';

/* ══════════════════════════════════════════════════════════
   2. Состояние приложения
   ══════════════════════════════════════════════════════════ */

const State = {
  activeTab:        'home',   // текущий активный таб
  history:          [],       // стек для кнопки "Назад": [{screen, params}]
  currentScreen:    '',
  currentParams:    {},

  // Booking flow
  selectedService:  null,     // id выбранной услуги
  selectedDate:     null,     // "2026-05-20"
  selectedTime:     null,     // "11:00"

  // Каталог
  activeCategory:   'all',
  searchQuery:      '',

  // Мои записи
  bookingsTab:      'upcoming',

  // Календарь
  calYear:          new Date().getFullYear(),
  calMonth:         new Date().getMonth(),

  // Галерея в карточке услуги
  galleryIndex:     0,

  // Lightbox
  lightboxPhotos:   [],
  lightboxIndex:    0,
};

const TABS = ['home', 'catalog', 'bookings', 'master'];

/* ══════════════════════════════════════════════════════════
   3. Роутер
   ══════════════════════════════════════════════════════════ */

const Router = {
  /**
   * Перейти на экран.
   * @param {string} screen — имя экрана
   * @param {object} params — параметры
   * @param {'forward'|'back'|'tab'} direction — направление анимации
   */
  go(screen, params = {}, direction = 'forward') {
    const container = document.getElementById('screen-container');
    const oldEl = container.querySelector('.screen');

    // Создаём DOM-элемент нового экрана
    const newEl = document.createElement('div');
    newEl.className = 'screen';
    newEl.dataset.screen = screen;
    newEl.innerHTML = renderScreen(screen, params);

    // Начальная позиция перед анимацией
    if (direction === 'forward') {
      newEl.style.transform = 'translateX(100%)';
    } else if (direction === 'back') {
      newEl.style.transform = 'translateX(-28%)';
      newEl.style.opacity = '0.6';
    }
    // direction === 'tab' — без начального сдвига (мгновенно)

    container.appendChild(newEl);

    // Запускаем анимацию через двойной rAF (чтобы браузер успел отрисовать начальное состояние)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Анимируем новый экран в позицию 0
        newEl.style.transition = 'transform .28s cubic-bezier(.25,.46,.45,.94), opacity .28s';
        newEl.style.transform  = 'translateX(0)';
        newEl.style.opacity    = '1';

        // Анимируем старый экран на выход
        if (oldEl) {
          if (direction === 'forward') {
            oldEl.style.transition = 'transform .28s cubic-bezier(.25,.46,.45,.94), opacity .28s';
            oldEl.style.transform  = 'translateX(-28%)';
            oldEl.style.opacity    = '0.6';
          } else if (direction === 'back') {
            oldEl.style.transition = 'transform .28s cubic-bezier(.25,.46,.45,.94)';
            oldEl.style.transform  = 'translateX(100%)';
          }
          // Удаляем старый после окончания перехода
          setTimeout(() => oldEl.remove(), 310);
        }
      });
    });

    // Обновляем историю
    if (direction === 'forward' && State.currentScreen && !TABS.includes(screen)) {
      State.history.push({ screen: State.currentScreen, params: State.currentParams });
    } else if (TABS.includes(screen)) {
      State.history = [];
    }

    State.currentScreen = screen;
    State.currentParams = params;

    // BackButton Telegram
    if (tg?.BackButton) {
      if (State.history.length > 0) {
        tg.BackButton.show();
      } else {
        tg.BackButton.hide();
      }
    }

    // MainButton Telegram
    this._updateMainButton(screen);
  },

  /** Вернуться на предыдущий экран */
  back() {
    if (State.history.length === 0) return;
    const prev = State.history.pop();
    this.go(prev.screen, prev.params, 'back');
  },

  /** Переключить нижний таб */
  goTab(tab) {
    if (State.activeTab === tab && State.currentScreen === tab) return;
    State.activeTab = tab;
    State.history   = [];
    this._updateTabBar();
    this.go(tab, {}, 'tab');
  },

  /** Синхронизировать подсветку табов */
  _updateTabBar() {
    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === State.activeTab);
    });
  },

  /** Управление MainButton Telegram для booking flow */
  _updateMainButton(screen) {
    if (!tg?.MainButton) return;
    const MB = tg.MainButton;

    const config = {
      service:  { show: true,  text: 'Выбрать время' },
      calendar: { show: false, text: '' },  // показывается динамически при выборе слота
      summary:  { show: true,  text: 'Подтвердить запись' },
    };

    if (config[screen]) {
      if (config[screen].show) {
        MB.setText(config[screen].text);
        MB.show();
      } else {
        MB.hide();
      }
    } else {
      MB.hide();
    }
  },
};

/* ══════════════════════════════════════════════════════════
   4. Утилиты
   ══════════════════════════════════════════════════════════ */

/** Тактильный отклик */
function haptic(type = 'light') {
  try {
    if (type === 'success') tg?.HapticFeedback?.notificationOccurred('success');
    else if (type === 'error') tg?.HapticFeedback?.notificationOccurred('error');
    else tg?.HapticFeedback?.impactOccurred(type);
  } catch (_) {}
}

/** Инициалы из имени: "Марина Козлова" → "МК" */
function initials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

/** HTML строки из n звёздочек */
function starsHTML(rating) {
  const full = Math.round(rating);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

/** Найти услугу по id */
function getService(id) {
  return APP_DATA.services.find(s => s.id === id) || APP_DATA.services[0];
}

/** Получить отзывы по id услуги */
function getReviews(serviceId) {
  return APP_DATA.reviews[serviceId] || [];
}

/** Отзыв дня — меняется по дате, стабилен в рамках сессии */
function getFeaturedReview() {
  const all = Object.values(APP_DATA.reviews).flat().filter(r => r.rating === 5);
  return all[new Date().getDate() % all.length] || null;
}

/* ══════════════════════════════════════════════════════════
   5. Экраны
   ══════════════════════════════════════════════════════════ */

/** Диспетчер — вызывает нужный рендерер */
function renderScreen(screen, params) {
  const renderers = {
    home:           renderHome,
    catalog:        renderCatalog,
    service:        renderService,
    calendar:       renderCalendar,
    summary:        renderSummary,
    success:        renderSuccess,
    bookings:       renderBookings,
    bookingDetail:  renderBookingDetail,
    master:         renderMaster,
  };
  const fn = renderers[screen];
  return fn ? fn(params) : `<div style="padding:32px;text-align:center">Экран не найден: ${screen}</div>`;
}

/* ─────────────────────────────────────────────────────────
   5.1 Главная
   ───────────────────────────────────────────────────────── */
function renderHome() {
  const m = APP_DATA.master;
  const lastBooking = BookingStorage.getLast();
  const lastService = lastBooking ? getService(lastBooking.serviceId) : null;

  // Популярные услуги: первые 3
  const popular = APP_DATA.services.slice(0, 3);

  // Блок "Записаться снова" — только если есть история
  const rebookBlock = lastService ? `
    <div class="rebook-card" data-action="rebook" data-id="${lastService.id}">
      <div class="rebook-emoji">${lastService.emoji}</div>
      <div class="rebook-text">
        <div class="rebook-title">${lastService.title}</div>
        <div class="rebook-sub">Последний визит · Записаться снова</div>
      </div>
      <div class="rebook-btn">
        <span class="btn-sm accent">Снова</span>
      </div>
    </div>` : '';

  // Карточки услуг
  const serviceCards = popular.map(s => serviceCardHTML(s)).join('');

  const featuredReview = getFeaturedReview();

  return `
    <div class="home-screen fade-in">

      <!-- Hero мастера -->
      <div class="hero" data-action="go-master">
        <div class="hero-bg" style="background:${m.gradient}; width:100%; height:100%;"></div>
        <div class="hero-decor" aria-hidden="true">
          <span class="hd hd-1">💅</span>
          <span class="hd hd-2">🌸</span>
          <span class="hd hd-3">💎</span>
          <span class="hd hd-4">🦋</span>
          <span class="hd hd-5">🌷</span>
          <span class="hd hd-6">✨</span>
          <span class="hd hd-7">🌹</span>
          <span class="hd hd-8">🍃</span>
          <span class="hd hd-9">💅</span>
          <span class="hd hd-10">🌸</span>
        </div>
        <div class="hero-info">
          <div class="hero-name">${m.name}</div>
          <div class="hero-spec">${m.specializations}</div>
          <div class="hero-stats">
            <span class="hero-stat">⭐ ${m.rating}</span>
            <span class="hero-stat-sep">·</span>
            <span class="hero-stat">${m.worksCount}+ работ</span>
            <span class="hero-stat-sep">·</span>
            <span class="hero-stat">${m.experience} лет опыта</span>
          </div>
        </div>
      </div>

      <!-- Отзыв клиента -->
      ${featuredReview ? `
        <div class="home-review">
          <div class="home-review-stars">${'★'.repeat(featuredReview.rating)}${'☆'.repeat(5 - featuredReview.rating)}</div>
          <div class="home-review-text">«${featuredReview.text}»</div>
          <div class="home-review-author">— ${featuredReview.name}, ${featuredReview.date}</div>
        </div>` : ''}

      <!-- Приветствие (только для возвращающихся) -->
      ${lastBooking ? `
        <div style="padding:12px var(--px) 0; font-size:14px; color:var(--tg-hint)">
          👋 С возвращением, <strong style="color:var(--tg-text)">${userName}</strong>!
        </div>` : ''}

      <!-- Записаться снова -->
      ${rebookBlock}

      <!-- Категории -->
      <div class="section-header">
        <span class="section-title">Что хочешь сделать?</span>
      </div>
      <div class="chips-row categories-row" id="home-categories">
        ${APP_DATA.categories.map(c => `
          <button class="chip ${c.id === 'all' ? 'active' : ''}"
                  data-action="filter-home" data-cat="${c.id}">
            ${c.emoji} ${c.label}
          </button>`).join('')}
      </div>

      <!-- Популярные услуги -->
      <div class="section-header">
        <span class="section-title">Популярные</span>
        <span class="section-link" data-action="go-tab" data-tab="catalog">Все →</span>
      </div>

      <div id="home-services-list">
        ${serviceCards}
      </div>

      <!-- Карточка мастера -->
      <div class="divider-full" style="margin-top:12px"></div>
      <div style="padding:16px var(--px)">
        <div style="display:flex;align-items:center;gap:12px" data-action="go-master">
          <div style="width:48px;height:48px;border-radius:50%;background:${m.gradient};
                      display:flex;align-items:center;justify-content:center;
                      font-size:16px;font-weight:700;color:#fff;flex-shrink:0">
            ${initials(m.name)}
          </div>
          <div>
            <div style="font-size:15px;font-weight:600">${m.name}</div>
            <div style="font-size:13px;color:var(--tg-hint)">${m.address} · ${m.workHours}</div>
          </div>
          <div style="margin-left:auto;color:var(--tg-hint)">›</div>
        </div>
      </div>

    </div>`;
}

/* ─────────────────────────────────────────────────────────
   5.2 Каталог услуг
   ───────────────────────────────────────────────────────── */
function renderCatalog() {
  return `
    <div class="fade-in" style="padding-bottom:16px">

      <!-- Поиск -->
      <div class="search-wrap">
        <input class="search-input" id="catalog-search"
               type="search" placeholder="Найти услугу…"
               value="${State.searchQuery}"
               data-action="search-input">
      </div>

      <!-- Фильтры по категориям -->
      <div class="chips-row" style="padding-top:8px;padding-bottom:8px">
        ${APP_DATA.categories.map(c => `
          <button class="chip ${c.id === State.activeCategory ? 'active' : ''}"
                  data-action="filter-catalog" data-cat="${c.id}">
            ${c.emoji} ${c.label}
          </button>`).join('')}
      </div>

      <!-- Список услуг -->
      <div id="catalog-list">
        ${renderFilteredServices()}
      </div>

    </div>`;
}

/** Отфильтрованный список услуг */
function renderFilteredServices() {
  let services = APP_DATA.services;

  // Фильтр по категории
  if (State.activeCategory !== 'all') {
    services = services.filter(s => s.categoryId === State.activeCategory);
  }

  // Фильтр по поиску
  if (State.searchQuery.trim()) {
    const q = State.searchQuery.toLowerCase();
    services = services.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q)
    );
  }

  if (!services.length) {
    return `
      <div class="empty-state">
        <div class="empty-emoji">🔍</div>
        <div class="empty-title">Ничего не найдено</div>
        <div class="empty-sub">Попробуй другой запрос или категорию</div>
        <button class="btn-sm accent" style="margin-top:12px"
                data-action="reset-filter">Сбросить</button>
      </div>`;
  }

  return services.map(s => serviceCardHTML(s)).join('');
}

/* ─────────────────────────────────────────────────────────
   5.3 Карточка услуги
   ───────────────────────────────────────────────────────── */
function renderService({ id }) {
  const s = getService(id);
  const reviews = getReviews(id);
  const nextSlot = getNextSlotLabel();

  // Фото-галерея
  const slides = s.photos.map((p, i) => `
    <div class="gallery-slide" style="background:${p.gradient}"
         data-action="open-photo" data-index="${i}">
      <div class="gallery-slide-emoji">${p.emoji}</div>
      <div class="gallery-slide-label">${p.label}</div>
    </div>`).join('');

  const dots = s.photos.map((_, i) => `
    <div class="gallery-dot ${i === 0 ? 'active' : ''}"></div>`).join('');

  // Блок отзывов (max 2)
  const reviewsHTML = reviews.slice(0, 2).map(r => `
    <div class="review-card">
      <div class="review-header">
        <div class="review-avatar">${r.name[0]}</div>
        <div>
          <div class="review-name">${r.name}</div>
          <div class="review-stars">${'★'.repeat(r.rating)}</div>
        </div>
        <div class="review-date">${r.date}</div>
      </div>
      <div class="review-text">${r.text}</div>
    </div>`).join('<div class="divider"></div>');

  return `
    <div class="service-screen fade-in">

      <!-- Галерея -->
      <div class="gallery-wrap" id="gallery-wrap">
        <div class="gallery-slides" id="gallery-slides" style="width:${s.photos.length * 100}%">
          ${slides}
        </div>
        <div class="gallery-dots" id="gallery-dots">${dots}</div>
      </div>

      <!-- Инфо -->
      <div class="svc-detail-info">
        <div class="svc-detail-title">${s.title}</div>
        <div class="svc-detail-row">
          <div class="svc-detail-meta">⏱ ${formatDuration(s.duration)}</div>
          <div class="svc-detail-meta">★ ${s.rating} (${s.reviewsCount})</div>
          <div class="svc-detail-price">${formatPrice(s.price)}</div>
        </div>

        <!-- Следующий слот -->
        ${nextSlot ? `
          <div style="margin-top:10px">
            <div class="slot-badge" data-action="go-calendar" data-id="${s.id}">
              🟢 Ближайший слот: ${nextSlot}
            </div>
          </div>` : ''}

        <!-- Описание -->
        <div class="svc-desc collapsed" id="svc-desc">${s.description}</div>
        <button class="svc-desc-toggle" id="desc-toggle" data-action="toggle-desc">
          Читать далее
        </button>
      </div>

      <div class="divider-full" style="margin-top:16px"></div>

      <!-- Отзывы -->
      <div class="section-header">
        <span class="section-title">Отзывы</span>
        <span style="font-size:13px;color:var(--tg-hint)">★ ${s.rating} · ${s.reviewsCount}</span>
      </div>
      ${reviewsHTML || '<div style="padding:12px var(--px);color:var(--tg-hint);font-size:14px">Пока нет отзывов</div>'}

      <!-- Кнопка записаться (резервная, если нет MainButton) -->
      <div style="padding:16px var(--px) 0">
        <button class="btn-primary" data-action="go-calendar" data-id="${s.id}">
          Выбрать время
        </button>
      </div>

    </div>`;
}

/* ─────────────────────────────────────────────────────────
   5.4 Выбор даты и времени
   ───────────────────────────────────────────────────────── */
function renderCalendar({ id }) {
  const s = getService(id);
  State.selectedService = id;

  const { calYear: year, calMonth: month } = State;
  const today = new Date();
  const todayKey = formatDateKey(today);
  const minDate = new Date(today); minDate.setDate(today.getDate() + 1);

  // Генерируем сетку дней
  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (firstDay + 6) % 7; // перевод на Пн=0

  const monthsRu = ['Январь','Февраль','Март','Апрель','Май','Июнь',
                    'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

  // Проверка: можно ли идти на предыдущий месяц
  const canPrev = (year > today.getFullYear()) || (month > today.getMonth());

  let daysHTML = '';
  for (let i = 0; i < startOffset; i++) {
    daysHTML += '<div class="cal-day empty"></div>';
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const date   = new Date(year, month, day);
    const key    = formatDateKey(date);
    const isPast = date < minDate;
    const isSun  = date.getDay() === 0;
    const isToday = key === todayKey;
    const isSel  = key === State.selectedDate;
    const hasSlot = ALL_SLOTS[key]?.some(s => s.available);
    const disabled = isPast || isSun;

    daysHTML += `
      <div class="cal-day
                  ${disabled ? 'disabled' : ''}
                  ${isToday  ? 'today'    : ''}
                  ${isSel    ? 'selected' : ''}"
           ${!disabled ? `data-action="select-date" data-date="${key}"` : ''}>
        <span>${day}</span>
        ${hasSlot && !disabled ? '<span class="cal-dot"></span>' : ''}
      </div>`;
  }

  // Блок слотов (если дата уже выбрана)
  const slotsBlock = State.selectedDate ? renderTimeSlots(State.selectedDate) : '';

  return `
    <div class="calendar-screen fade-in">

      <!-- Ремайндер услуги + прогресс -->
      <div class="cal-header">
        <div class="cal-header-service">${s.title}</div>
        <div class="cal-header-price">${formatPrice(s.price)} · ${formatDuration(s.duration)}</div>
      </div>
      <div class="progress-steps">
        <div class="progress-dot active"></div>
        <div class="progress-dot ${State.selectedTime ? 'active' : ''}"></div>
        <div class="progress-dot"></div>
      </div>

      <!-- Навигация по месяцу -->
      <div class="month-nav">
        <button class="month-btn" data-action="cal-prev" ${!canPrev ? 'disabled' : ''}>‹</button>
        <span class="month-name">${monthsRu[month]} ${year}</span>
        <button class="month-btn" data-action="cal-next">›</button>
      </div>

      <!-- Заголовки дней недели -->
      <div class="weekday-row">
        ${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(d => `<div class="weekday-cell">${d}</div>`).join('')}
      </div>

      <!-- Сетка дней -->
      <div class="calendar-grid">${daysHTML}</div>

      <!-- Слоты времени -->
      <div id="slots-container">${slotsBlock}</div>

    </div>`;
}

/** HTML-блок временных слотов для выбранной даты */
function renderTimeSlots(dateStr) {
  const slots = ALL_SLOTS[dateStr] || [];
  if (!slots.length) return '';

  const dateLabel = formatDateRu(dateStr);
  const slotsHTML = slots.map(sl => `
    <button class="time-slot ${sl.available ? '' : 'disabled'} ${State.selectedTime === sl.time && State.selectedDate === dateStr ? 'selected' : ''}"
            ${sl.available ? `data-action="select-slot" data-time="${sl.time}"` : ''}>
      ${sl.time}
    </button>`).join('');

  return `
    <div class="slots-section">
      <div class="slots-date">${dateLabel}</div>
      <div class="slots-grid">${slotsHTML}</div>
    </div>`;
}

/* ─────────────────────────────────────────────────────────
   5.5 Сводка бронирования
   ───────────────────────────────────────────────────────── */
function renderSummary() {
  const s = getService(State.selectedService);
  const dateLabel = formatDateRu(State.selectedDate);

  return `
    <div class="summary-screen fade-in">

      <div class="progress-steps">
        <div class="progress-dot done"></div>
        <div class="progress-dot done"></div>
        <div class="progress-dot active"></div>
      </div>

      <div style="padding:0 var(--px) 4px">
        <div class="section-title">Проверьте запись</div>
      </div>

      <!-- Карточка с деталями (строки редактируемые) -->
      <div class="summary-card">
        <div class="summary-row" data-action="go-service-from-summary">
          <div class="summary-row-icon">${s.emoji}</div>
          <div class="summary-row-text">
            <div class="summary-row-label">Услуга</div>
            <div class="summary-row-value">${s.title}</div>
          </div>
          <div class="summary-arrow">›</div>
        </div>
        <div class="summary-row" data-action="go-calendar-from-summary">
          <div class="summary-row-icon">📅</div>
          <div class="summary-row-text">
            <div class="summary-row-label">Дата</div>
            <div class="summary-row-value">${dateLabel}</div>
          </div>
          <div class="summary-arrow">›</div>
        </div>
        <div class="summary-row" data-action="go-calendar-from-summary">
          <div class="summary-row-icon">⏰</div>
          <div class="summary-row-text">
            <div class="summary-row-label">Время и длительность</div>
            <div class="summary-row-value">${State.selectedTime} · ${formatDuration(s.duration)}</div>
          </div>
          <div class="summary-arrow">›</div>
        </div>
        <div class="summary-row">
          <div class="summary-row-icon">👤</div>
          <div class="summary-row-text">
            <div class="summary-row-label">Мастер</div>
            <div class="summary-row-value">${APP_DATA.master.name}</div>
          </div>
        </div>
      </div>

      <!-- Итог -->
      <div class="summary-total">
        <span class="summary-total-label">Итого к оплате</span>
        <span class="summary-total-price">${formatPrice(s.price)}</span>
      </div>

      <!-- Политика отмены — ДО кнопки подтверждения -->
      <div class="cancel-policy">
        ℹ️ Бесплатная отмена за 24 часа до визита. После — полная стоимость.
      </div>

      <!-- Данные клиента (предзаполнены из Telegram) -->
      <div class="client-info">
        <div class="client-info-label">Клиент</div>
        <div class="client-info-name">${userName}</div>
      </div>

      <!-- Кнопка подтверждения (резервная) -->
      <div style="padding:16px var(--px) 0">
        <button class="btn-primary" data-action="confirm-booking">
          Подтвердить запись
        </button>
      </div>

    </div>`;
}

/* ─────────────────────────────────────────────────────────
   5.6 Успешная запись
   ───────────────────────────────────────────────────────── */
function renderSuccess({ booking }) {
  const s = getService(booking.serviceId);
  const dateLabel = formatDateRu(booking.date);

  return `
    <div class="success-screen fade-in">

      <!-- Анимация успеха -->
      <div class="success-anim">✅</div>

      <div class="success-title">Запись подтверждена!</div>
      <div class="success-sub">${userName}, ждём тебя<br>${dateLabel.toLowerCase()} в ${booking.time}</div>

      <!-- Карточка записи -->
      <div class="success-booking-card">
        <div class="success-booking-row">
          <span>${s.emoji}</span>
          <span><strong>${s.title}</strong></span>
        </div>
        <div class="success-booking-row">
          <span>📅</span>
          <span><strong>${dateLabel}</strong></span>
        </div>
        <div class="success-booking-row">
          <span>⏰</span>
          <span><strong>${booking.time} · ${formatDuration(s.duration)}</strong></span>
        </div>
        <div class="success-booking-row">
          <span>💰</span>
          <span><strong>${formatPrice(s.price)}</strong></span>
        </div>
      </div>

      <!-- Действия -->
      <div class="success-actions">
        <button class="btn-primary" data-action="share-referral">
          🎁 Поделиться с подругой
        </button>
        <button class="btn-outline" data-action="go-tab" data-tab="bookings">
          Мои записи
        </button>
      </div>

      <div class="success-reminder">🔔 Напомним за 2 часа до визита</div>

    </div>`;
}

/* ─────────────────────────────────────────────────────────
   5.7 Мои записи
   ───────────────────────────────────────────────────────── */
function renderBookings() {
  const upcoming = BookingStorage.getUpcoming();
  const past     = BookingStorage.getPast();

  const renderList = (list, isEmpty) => {
    if (!list.length) {
      return `
        <div class="empty-state">
          <div class="empty-emoji">${isEmpty ? '📅' : '🕐'}</div>
          <div class="empty-title">${isEmpty ? 'Нет предстоящих записей' : 'Нет прошлых записей'}</div>
          <div class="empty-sub">Записывайся к мастеру прямо сейчас</div>
          ${isEmpty ? `<button class="btn-sm accent" style="margin-top:12px"
                               data-action="go-tab" data-tab="catalog">Записаться</button>` : ''}
        </div>`;
    }
    return list.map(b => bookingCardHTML(b)).join('<div class="divider"></div>');
  };

  return `
    <div class="bookings-screen fade-in">

      <div style="padding:14px var(--px) 6px">
        <div class="section-title">Мои записи</div>
      </div>

      <!-- Переключатель -->
      <div class="segment">
        <button class="segment-tab ${State.bookingsTab === 'upcoming' ? 'active' : ''}"
                data-action="bookings-tab" data-tab="upcoming">
          Предстоящие ${upcoming.length ? `(${upcoming.length})` : ''}
        </button>
        <button class="segment-tab ${State.bookingsTab === 'past' ? 'active' : ''}"
                data-action="bookings-tab" data-tab="past">
          Прошлые
        </button>
      </div>

      <div id="bookings-list">
        ${State.bookingsTab === 'upcoming'
          ? renderList(upcoming, true)
          : renderList(past, false)}
      </div>

    </div>`;
}

/* ─────────────────────────────────────────────────────────
   5.8 Детали записи
   ───────────────────────────────────────────────────────── */
function renderBookingDetail({ bookingId }) {
  const b = BookingStorage.getAll().find(x => x.id === bookingId);
  if (!b) return `<div style="padding:32px;text-align:center">Запись не найдена</div>`;

  const s = getService(b.serviceId);
  const m = APP_DATA.master;

  const now = new Date();
  const bookingDate = new Date(`${b.date}T${b.time}`);
  const hoursLeft = (bookingDate - now) / 36e5;
  const isCancelled = b.status === 'cancelled';
  const isUpcoming  = !isCancelled && hoursLeft > 0;
  const canCancel   = isUpcoming && hoursLeft > 24;

  let statusLabel, statusClass;
  if (isCancelled) {
    statusLabel = 'Отменена'; statusClass = 'cancelled';
  } else if (hoursLeft <= 0) {
    statusLabel = 'Завершена'; statusClass = 'cancelled';
  } else if (hoursLeft < 24) {
    statusLabel = 'Сегодня'; statusClass = 'soon';
  } else if (hoursLeft < 48) {
    statusLabel = 'Завтра'; statusClass = 'soon';
  } else {
    statusLabel = 'Подтверждена'; statusClass = 'confirmed';
  }

  const photo = s.photos[0];
  const photoBg = photo.url ? `url(${photo.url}) center/cover` : photo.gradient;

  return `
    <div class="booking-detail-screen fade-in">

      <!-- Фото услуги -->
      <div class="bd-photo" style="background:${photoBg}">
        <div class="bd-photo-overlay"></div>
        <div class="bd-status-badge ${statusClass}">${statusLabel}</div>
        <div class="bd-photo-emoji">${s.emoji}</div>
      </div>

      <!-- Название и цена -->
      <div class="bd-header">
        <div class="bd-title">${s.title}</div>
        <div class="bd-price">${formatPrice(s.price)}</div>
      </div>

      <!-- Детали -->
      <div class="bd-details">
        <div class="bd-row">
          <span class="bd-row-icon">📅</span>
          <div>
            <div class="bd-row-label">Дата и время</div>
            <div class="bd-row-value">${formatDateRu(b.date)}, ${b.time}</div>
          </div>
        </div>
        <div class="bd-row">
          <span class="bd-row-icon">⏱</span>
          <div>
            <div class="bd-row-label">Длительность</div>
            <div class="bd-row-value">${formatDuration(s.duration)}</div>
          </div>
        </div>
        <div class="bd-row">
          <span class="bd-row-icon">💰</span>
          <div>
            <div class="bd-row-label">Стоимость</div>
            <div class="bd-row-value" style="color:var(--tg-btn)">${formatPrice(s.price)}</div>
          </div>
        </div>
        <div class="bd-row">
          <span class="bd-row-icon">👤</span>
          <div>
            <div class="bd-row-label">Мастер</div>
            <div class="bd-row-value">${m.name}</div>
          </div>
        </div>
        <div class="bd-row">
          <span class="bd-row-icon">📍</span>
          <div>
            <div class="bd-row-label">Адрес</div>
            <div class="bd-row-value">${m.address}</div>
          </div>
        </div>
      </div>

      <!-- Политика отмены -->
      ${isUpcoming ? `
        <div class="bd-policy">
          ℹ️ Бесплатная отмена за 24 часа до визита
        </div>` : ''}

      <!-- Кнопки действий -->
      <div class="bd-actions">
        <button class="btn-primary" data-action="rebook" data-id="${s.id}">
          Записаться снова
        </button>
        <button class="btn-outline" data-action="open-telegram-contact">
          Написать мастеру
        </button>
        ${canCancel ? `
          <button class="bd-cancel-btn" data-action="cancel-booking"
                  data-booking-id="${b.id}">
            Отменить запись
          </button>` : ''}
      </div>

    </div>`;
}

/* ─────────────────────────────────────────────────────────
   5.9 Профиль мастера
   ───────────────────────────────────────────────────────── */
function renderMaster() {
  const m = APP_DATA.master;

  // Галерея работ — берём фото из всех услуг
  const galleryItems = APP_DATA.services.flatMap(s => s.photos).slice(0, 9);
  const galleryHTML = galleryItems.map(p => `
    <div class="gallery-item" style="background:${p.gradient}"
         data-action="open-photo-master">
      ${p.emoji}
    </div>`).join('');

  return `
    <div class="master-screen fade-in">

      <!-- Hero -->
      <div class="master-hero" style="background:${m.gradient}">
        <div class="master-hero-overlay"></div>
        <div class="master-avatar">${initials(m.name)}</div>
        <div class="master-hero-name">${m.name}</div>
        <div class="master-hero-spec">${m.specializations}</div>
      </div>

      <!-- Статистика -->
      <div class="master-stats">
        <div class="stat-card">
          <div class="stat-value">${m.experience} лет</div>
          <div class="stat-label">Опыт работы</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${m.worksCount}+</div>
          <div class="stat-label">Работ сделано</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">★ ${m.rating}</div>
          <div class="stat-label">${m.reviewsCount} отзывов</div>
        </div>
      </div>

      <!-- Описание -->
      <div class="divider"></div>
      <div style="padding:14px var(--px) 0">
        <div class="section-title" style="margin-bottom:8px">О мастере</div>
        <div class="master-bio">${m.bio}</div>
      </div>

      <!-- Галерея работ -->
      <div class="divider-full" style="margin-top:4px"></div>
      <div class="section-header">
        <span class="section-title">Мои работы</span>
      </div>
      <div class="master-gallery" style="padding-bottom:12px">
        ${galleryHTML}
      </div>

      <!-- Контакты -->
      <div class="divider-full"></div>
      <div class="contact-row" data-action="open-instagram">
        <div class="contact-icon">📸</div>
        <div class="contact-text">${m.instagram}</div>
      </div>
      <div class="divider"></div>
      <div class="contact-row" data-action="open-telegram-contact">
        <div class="contact-icon">✈️</div>
        <div class="contact-text">@${m.telegram}</div>
      </div>
      <div class="divider"></div>
      <div class="contact-row" style="cursor:default">
        <div class="contact-icon">📍</div>
        <div style="font-size:14px;color:var(--tg-hint)">${m.address}</div>
      </div>
      <div class="contact-row" style="cursor:default">
        <div class="contact-icon">🕐</div>
        <div style="font-size:14px;color:var(--tg-hint)">${m.workHours}</div>
      </div>

      <!-- CTA -->
      <div class="divider-full"></div>
      <div class="master-cta">
        <button class="btn-primary" data-action="go-tab" data-tab="catalog">
          Записаться к ${m.nameDative || m.name.split(' ')[0]}
        </button>
        <button class="btn-outline" data-action="share-referral">
          Поделиться с другом
        </button>
      </div>

    </div>`;
}

/* ─────────────────────────────────────────────────────────
   Переиспользуемые HTML-компоненты
   ───────────────────────────────────────────────────────── */

/** Карточка услуги в списке */
function serviceCardHTML(s) {
  return `
    <div class="service-card" data-action="go-service" data-id="${s.id}">
      <div class="svc-thumb" style="background:${s.photos[0].gradient}">${s.emoji}</div>
      <div class="svc-info">
        <div class="svc-title">${s.title}</div>
        <div class="svc-meta">
          <span>⏱ ${formatDuration(s.duration)}</span>
        </div>
        <div class="svc-price">${formatPrice(s.price)}</div>
        <div class="svc-rating">★ ${s.rating} (${s.reviewsCount} отзывов)</div>
      </div>
      <button class="btn-sm accent" data-action="book-service" data-id="${s.id}">
        Записаться
      </button>
    </div>`;
}

/** Карточка записи в "Мои записи" */
function bookingCardHTML(b) {
  const s = getService(b.serviceId);
  const isCancelled = b.status === 'cancelled';
  const now = new Date();
  const bookingDate = new Date(`${b.date}T${b.time}`);
  const hoursLeft = (bookingDate - now) / 36e5; // часов до записи
  const canCancel = !isCancelled && hoursLeft > 24;

  let statusLabel, statusClass;
  if (isCancelled) {
    statusLabel = 'Отменена';
    statusClass = 'cancelled';
  } else if (hoursLeft <= 0) {
    statusLabel = 'Завершена';
    statusClass = 'cancelled';
  } else if (hoursLeft <= 48) {
    statusLabel = hoursLeft < 24 ? 'Сегодня' : 'Завтра';
    statusClass = 'soon';
  } else {
    statusLabel = 'Подтверждена';
    statusClass = 'confirmed';
  }

  const dateLabel = `${formatDateShort(b.date)}, ${b.time}`;

  return `
    <div class="booking-card" data-action="go-booking-detail" data-booking-id="${b.id}">
      <div class="booking-thumb" style="background:${s.photos[0].gradient}">${s.emoji}</div>
      <div class="booking-info">
        <div class="booking-title">${s.title}</div>
        <div class="booking-date">📅 ${dateLabel}</div>
        <div class="booking-status ${statusClass}">${statusLabel}</div>
        <div class="booking-actions">
          <button class="btn-sm accent" data-action="rebook" data-id="${s.id}"
                  onclick="event.stopPropagation()">
            Снова
          </button>
          ${canCancel ? `
            <button class="btn-sm danger" data-action="cancel-booking" data-booking-id="${b.id}"
                    onclick="event.stopPropagation()">
              Отменить
            </button>` : ''}
        </div>
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════
   6. Обработчик событий (единый делегированный listener)
   ══════════════════════════════════════════════════════════ */

document.addEventListener('click', e => {
  // Ищем ближайший элемент с data-action
  const el = e.target.closest('[data-action]');
  if (!el) return;

  const action = el.dataset.action;
  haptic('light');

  switch (action) {

    /* ── Навигация ───────────────────────────────────────── */
    case 'go-service': {
      const id = Number(el.dataset.id);
      State.galleryIndex = 0;
      Router.go('service', { id });
      break;
    }

    case 'book-service': {
      e.stopPropagation();
      const id = Number(el.dataset.id);
      State.selectedService = id;
      State.selectedDate = null;
      State.selectedTime = null;
      Router.go('calendar', { id });
      break;
    }

    case 'go-calendar': {
      const id = Number(el.dataset.id);
      State.selectedService = id;
      State.selectedDate = null;
      State.selectedTime = null;
      Router.go('calendar', { id });
      break;
    }

    case 'go-master': {
      Router.goTab('master');
      break;
    }

    case 'go-tab': {
      Router.goTab(el.dataset.tab);
      break;
    }

    /* ── Фильтры ─────────────────────────────────────────── */
    case 'filter-catalog': {
      State.activeCategory = el.dataset.cat;
      State.searchQuery = '';
      const input = document.getElementById('catalog-search');
      if (input) input.value = '';
      // Обновляем чипы
      document.querySelectorAll('[data-action="filter-catalog"]').forEach(c => {
        c.classList.toggle('active', c.dataset.cat === State.activeCategory);
      });
      const list = document.getElementById('catalog-list');
      if (list) list.innerHTML = renderFilteredServices();
      break;
    }

    case 'filter-home': {
      // Клик по категории на главной → переход в каталог с фильтром
      State.activeCategory = el.dataset.cat;
      Router.goTab('catalog');
      break;
    }

    case 'reset-filter': {
      State.activeCategory = 'all';
      State.searchQuery = '';
      const list = document.getElementById('catalog-list');
      if (list) list.innerHTML = renderFilteredServices();
      break;
    }

    /* ── Описание услуги ─────────────────────────────────── */
    case 'toggle-desc': {
      const desc = document.getElementById('svc-desc');
      const btn  = document.getElementById('desc-toggle');
      if (desc && btn) {
        const collapsed = desc.classList.toggle('collapsed');
        btn.textContent = collapsed ? 'Читать далее' : 'Свернуть';
      }
      break;
    }

    /* ── Галерея ─────────────────────────────────────────── */
    case 'open-photo': {
      const s = getService(State.selectedService || Number(
        document.querySelector('.service-screen') ? State.currentParams?.id : 0
      ));
      openLightbox(s?.photos || [], Number(el.dataset.index));
      break;
    }

    case 'open-photo-master': {
      const photos = APP_DATA.services.flatMap(sv => sv.photos).slice(0, 9);
      const idx = Array.from(
        document.querySelectorAll('[data-action="open-photo-master"]')
      ).indexOf(el);
      openLightbox(photos, idx >= 0 ? idx : 0);
      break;
    }

    case 'lightbox-close': {
      closeLightbox();
      break;
    }

    /* ── Календарь ───────────────────────────────────────── */
    case 'select-date': {
      State.selectedDate = el.dataset.date;
      State.selectedTime = null;

      // Обновляем выделение дней
      document.querySelectorAll('.cal-day').forEach(d => {
        d.classList.toggle('selected', d.dataset.date === State.selectedDate);
      });

      // Рендерим слоты
      const cont = document.getElementById('slots-container');
      if (cont) {
        cont.innerHTML = renderTimeSlots(State.selectedDate);
        cont.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      haptic('medium');

      // Скрываем MainButton (слот ещё не выбран)
      tg?.MainButton?.hide();
      break;
    }

    case 'select-slot': {
      State.selectedTime = el.dataset.time;

      // Обновляем визуальный выбор слотов
      document.querySelectorAll('.time-slot').forEach(sl => {
        sl.classList.toggle('selected', sl.dataset.time === State.selectedTime);
      });

      haptic('medium');

      // Показываем MainButton Telegram
      if (tg?.MainButton) {
        tg.MainButton.setText('Продолжить');
        tg.MainButton.show();
      }
      break;
    }

    case 'cal-prev': {
      if (State.calMonth === 0) { State.calYear--; State.calMonth = 11; }
      else State.calMonth--;
      Router.go('calendar', { id: State.selectedService }, 'forward');
      break;
    }

    case 'cal-next': {
      if (State.calMonth === 11) { State.calYear++; State.calMonth = 0; }
      else State.calMonth++;
      Router.go('calendar', { id: State.selectedService }, 'forward');
      break;
    }

    /* ── Сводка ──────────────────────────────────────────── */
    case 'go-service-from-summary': {
      Router.go('service', { id: State.selectedService }, 'back');
      break;
    }

    case 'go-calendar-from-summary': {
      Router.go('calendar', { id: State.selectedService }, 'back');
      break;
    }

    case 'confirm-booking': {
      confirmBooking();
      break;
    }

    /* ── Мои записи ──────────────────────────────────────── */
    case 'bookings-tab': {
      State.bookingsTab = el.dataset.tab;
      // Обновляем сегмент
      document.querySelectorAll('.segment-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === State.bookingsTab);
      });
      const list = document.getElementById('bookings-list');
      const upcoming = BookingStorage.getUpcoming();
      const past = BookingStorage.getPast();
      if (list) {
        list.innerHTML = State.bookingsTab === 'upcoming'
          ? renderListItems(upcoming, true)
          : renderListItems(past, false);
      }
      break;
    }

    case 'rebook': {
      e.stopPropagation();
      const id = Number(el.dataset.id);
      State.selectedService = id;
      State.selectedDate = null;
      State.selectedTime = null;
      Router.go('calendar', { id });
      break;
    }

    case 'cancel-booking': {
      e.stopPropagation();
      const bookingId = Number(el.dataset.bookingId);
      tg ? tg.showConfirm('Отменить запись?', confirmed => {
        if (confirmed) {
          BookingStorage.cancel(bookingId);
          haptic('error');
          Router.go('bookings', {}, 'tab');
        }
      }) : confirmCancelBooking(bookingId);
      break;
    }

    case 'go-booking-detail': {
      const bookingId = el.dataset.bookingId;
      if (bookingId) Router.go('bookingDetail', { bookingId });
      break;
    }

    /* ── Контакты мастера ────────────────────────────────── */
    case 'open-instagram': {
      const url = `https://instagram.com/${APP_DATA.master.instagram.replace('@', '')}`;
      tg ? tg.openLink(url) : window.open(url, '_blank');
      break;
    }

    case 'open-telegram-contact': {
      const url = `https://t.me/${APP_DATA.master.telegram}`;
      tg ? tg.openTelegramLink(url) : window.open(url, '_blank');
      break;
    }

    /* ── Поделиться ──────────────────────────────────────── */
    case 'share-referral': {
      const shareUrl  = 'https://t.me/gomel_beauty_bot';
      const shareText = `💅 Нашла классного мастера маникюра в Гомеле — ${APP_DATA.master.name}! Записывайся прямо в Telegram`;
      const telegramShareUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;
      if (tg) {
        tg.openTelegramLink(telegramShareUrl);
      } else if (navigator.share) {
        navigator.share({ text: shareText + ': ' + shareUrl });
      } else {
        navigator.clipboard?.writeText(shareUrl).then(() => alert('Ссылка скопирована!'));
      }
      break;
    }
  }
});

/* Поиск в каталоге — обрабатываем input событие */
document.addEventListener('input', e => {
  if (e.target.id !== 'catalog-search') return;
  State.searchQuery = e.target.value;
  const list = document.getElementById('catalog-list');
  if (list) list.innerHTML = renderFilteredServices();
});

/* Свайп в галерее услуги */
let touchStartX = 0;
document.addEventListener('touchstart', e => {
  touchStartX = e.touches[0].clientX;
}, { passive: true });

document.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  if (Math.abs(dx) < 40) return;

  // Свайп в галерее на экране услуги
  const slides = document.getElementById('gallery-slides');
  if (slides) {
    const total = APP_DATA.services.find(s => s.id === State.currentParams?.id)?.photos.length || 1;
    if (dx < 0 && State.galleryIndex < total - 1) State.galleryIndex++;
    else if (dx > 0 && State.galleryIndex > 0) State.galleryIndex--;
    updateGallery();
  }

  // Свайп в лайтбоксе
  const lb = document.getElementById('lightbox');
  if (lb?.classList.contains('open')) {
    const total = State.lightboxPhotos.length;
    if (dx < 0 && State.lightboxIndex < total - 1) State.lightboxIndex++;
    else if (dx > 0 && State.lightboxIndex > 0) State.lightboxIndex--;
    updateLightbox();
  }
}, { passive: true });

/** Обновляет позицию галереи в карточке услуги */
function updateGallery() {
  const slides = document.getElementById('gallery-slides');
  const dots   = document.querySelectorAll('.gallery-dot');
  if (!slides) return;

  slides.style.transform = `translateX(-${State.galleryIndex * (100 / slides.children.length)}%)`;
  dots.forEach((d, i) => d.classList.toggle('active', i === State.galleryIndex));
}

/* ══════════════════════════════════════════════════════════
   Лайтбокс
   ══════════════════════════════════════════════════════════ */

function openLightbox(photos, index = 0) {
  State.lightboxPhotos = photos;
  State.lightboxIndex  = index;
  document.getElementById('lightbox').classList.add('open');
  updateLightbox();
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
}

function updateLightbox() {
  const p = State.lightboxPhotos[State.lightboxIndex];
  if (!p) return;

  const lb = document.getElementById('lightbox');
  lb.querySelector('.lightbox-counter').textContent = `${State.lightboxIndex + 1} / ${State.lightboxPhotos.length}`;
  lb.querySelector('.lightbox-content').innerHTML = `
    <div class="lightbox-emoji" style="filter:drop-shadow(0 4px 12px rgba(0,0,0,.5))">${p.emoji}</div>
    <div class="lightbox-label">${p.label}</div>`;
}

/* ══════════════════════════════════════════════════════════
   Подтверждение записи
   ══════════════════════════════════════════════════════════ */

function confirmBooking() {
  if (!State.selectedService || !State.selectedDate || !State.selectedTime) {
    haptic('error');
    return;
  }

  haptic('success');

  // Показываем прогресс на MainButton
  if (tg?.MainButton) {
    tg.MainButton.showProgress(false);
    tg.MainButton.setText('Записываем…');
  }

  fetch(`${API_BASE}/bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': tg?.initData || '',
    },
    body: JSON.stringify({
      master_slug: MASTER_SLUG,
      service_id:  State.selectedService,
      date:        State.selectedDate,
      time:        State.selectedTime,
    }),
  })
    .then(r => r.json())
    .then(booking => {
      if (tg?.MainButton) tg.MainButton.hide();
      if (booking.error) {
        haptic('error');
        Router.go('success', { booking: null, error: booking.error });
        return;
      }
      Router.go('success', { booking });
    })
    .catch(() => {
      // Fallback: localStorage при отсутствии API (режим разработки)
      const booking = BookingStorage.add({
        serviceId: State.selectedService,
        date:      State.selectedDate,
        time:      State.selectedTime,
      });
      if (tg?.MainButton) tg.MainButton.hide();
      Router.go('success', { booking });
    });
}

/** Отмена записи без Telegram.showConfirm (для браузера) */
function confirmCancelBooking(bookingId) {
  if (window.confirm('Отменить запись?')) {
    BookingStorage.cancel(bookingId);
    Router.go('bookings', {}, 'tab');
  }
}

/** Рендер списка записей (используется при переключении вкладок без перехода экрана) */
function renderListItems(list, isUpcoming) {
  if (!list.length) {
    return `
      <div class="empty-state">
        <div class="empty-emoji">${isUpcoming ? '📅' : '🕐'}</div>
        <div class="empty-title">${isUpcoming ? 'Нет предстоящих записей' : 'Нет прошлых записей'}</div>
        <div class="empty-sub">Записывайся к мастеру прямо сейчас</div>
        ${isUpcoming ? `<button class="btn-sm accent" style="margin-top:12px"
                               data-action="go-tab" data-tab="catalog">Записаться</button>` : ''}
      </div>`;
  }
  return list.map(b => bookingCardHTML(b)).join('<div class="divider"></div>');
}

/* ══════════════════════════════════════════════════════════
   BackButton и MainButton Telegram
   ══════════════════════════════════════════════════════════ */

if (tg?.BackButton) {
  tg.BackButton.onClick(() => {
    haptic('light');
    Router.back();
  });
}

if (tg?.MainButton) {
  tg.MainButton.onClick(() => {
    const screen = State.currentScreen;
    if (screen === 'service') {
      const id = State.currentParams?.id;
      State.selectedService = id;
      State.selectedDate = null;
      State.selectedTime = null;
      Router.go('calendar', { id });
    } else if (screen === 'calendar') {
      if (State.selectedDate && State.selectedTime) {
        Router.go('summary', {});
      }
    } else if (screen === 'summary') {
      confirmBooking();
    }
  });
}

/* ══════════════════════════════════════════════════════════
   7. Запуск приложения
   ══════════════════════════════════════════════════════════ */

/* ── Онбординг + Оффер ───────────────────────────────────── */

const ONBOARDING_KEY = 'beauty_onboarding_shown';
const OFFER_KEY      = 'beauty_offer_shown';

function openModal(el) {
  el.style.display = 'flex';
  requestAnimationFrame(() => el.classList.add('offer-visible'));
}

function closeModal(el, cb) {
  el.classList.remove('offer-visible');
  el.classList.add('offer-hiding');
  setTimeout(() => {
    el.style.display = 'none';
    el.classList.remove('offer-hiding');
    if (cb) cb();
  }, 220);
}

function showOffer() {
  if (localStorage.getItem(OFFER_KEY)) return;
  const modal = document.getElementById('offer-modal');
  openModal(modal);

  function close() {
    localStorage.setItem(OFFER_KEY, '1');
    closeModal(modal);
  }

  document.getElementById('offer-skip').onclick = close;
  document.getElementById('offer-overlay').onclick = close;
  document.getElementById('offer-btn').onclick = () => {
    haptic('medium');
    if (tg) tg.openTelegramLink('https://t.me/gomel_beauty_bot?start=from_app');
    close();
  };
}

function showOnboarding() {
  if (localStorage.getItem(ONBOARDING_KEY)) {
    // Онбординг уже видел — сразу проверяем оффер
    setTimeout(showOffer, 900);
    return;
  }

  // Подставляем имя пользователя
  const nameEl = document.getElementById('onboarding-name');
  if (nameEl) nameEl.textContent = userName;

  const modal = document.getElementById('onboarding-modal');
  openModal(modal);

  function close() {
    localStorage.setItem(ONBOARDING_KEY, '1');
    closeModal(modal, () => setTimeout(showOffer, 500));
  }

  document.getElementById('onboarding-start').onclick = () => { haptic('medium'); close(); };
  document.getElementById('onboarding-overlay').onclick = close;
}

function applyTheme(theme) {
  if (!theme) return;
  const schemes = {
    default: { btn: '#7c3aed', bg: '#ffffff' },
    pink:    { btn: '#ec4899', bg: '#fdf2f8' },
    violet:  { btn: '#8b5cf6', bg: '#faf5ff' },
    dark:    { btn: '#818cf8', bg: '#1e1b4b' },
    minimal: { btn: '#374151', bg: '#f9fafb' },
    luxury:  { btn: '#b45309', bg: '#fffbeb' },
  };
  const s = schemes[theme.color_scheme] || schemes.default;
  const root = document.documentElement;
  root.style.setProperty('--tg-btn', s.btn);
  if (!theme.show_platform_branding) {
    document.getElementById('platform-branding')?.remove();
  }
}

async function init() {
  const now = new Date();
  State.calYear  = now.getFullYear();
  State.calMonth = now.getMonth();

  // Загружаем данные мастера и тему из API (graceful fallback на data.js)
  try {
    const [masterData, themeData] = await Promise.all([
      fetch(`${API_BASE}/masters/${MASTER_SLUG}`).then(r => r.json()),
      fetch(`${API_BASE}/masters/${MASTER_SLUG}/theme`).then(r => r.json()),
    ]);
    if (masterData && !masterData.error) {
      Object.assign(APP_DATA.master, masterData);
    }
    if (themeData && !themeData.error) {
      applyTheme(themeData);
    }
  } catch (e) {
    console.warn('API unavailable, using local data.js:', e.message);
  }

  Router.go('home', {}, 'tab');

  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      haptic('light');
      Router.goTab(btn.dataset.tab);
    });
  });

  // Онбординг через 700мс после загрузки
  setTimeout(showOnboarding, 700);
}

// ?reset в URL — сбрасывает localStorage (для тестирования)
if (new URLSearchParams(location.search).has('reset')) {
  localStorage.clear();
  history.replaceState(null, '', location.pathname);
}

// Запускаем после загрузки DOM
document.addEventListener('DOMContentLoaded', init);
