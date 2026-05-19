/**
 * data.js — данные приложения
 * Здесь хранятся: профиль мастера, услуги, отзывы,
 * генерация слотов, работа с записями через localStorage.
 *
 * Чтобы изменить данные мастера — редактируй объект APP_DATA.master
 * Чтобы добавить услугу — добавь объект в APP_DATA.services
 */

const APP_DATA = {

  /* ── Профиль мастера ─────────────────────────────────── */
  master: {
    name: 'Дарья Русакова',
    specializations: 'Маникюр · Педикюр · Брови',
    bio: 'Сертифицированный мастер маникюра и педикюра с 2019 года. Сделала более 500 работ. Специализируюсь на аппаратном маникюре, сложном дизайне и оформлении бровей. Работаю со стерильными инструментами, использую профессиональные материалы. Принимаю в г. Гомеле.',
    bioShort: 'Сертифицированный мастер маникюра и педикюра с 2019 года. Более 500 работ в Гомеле.',
    experience: 5,
    worksCount: 500,
    rating: 4.9,
    reviewsCount: 127,
    // градиент вместо фото — меняется цвет "аватара" мастера
    gradient: 'linear-gradient(160deg, #f9a8c9 0%, #c084fc 50%, #818cf8 100%)',
    initials: 'ДР',
    instagram: '@marina_nails_gomel',
    telegram: 'marina_master',
    address: 'г. Гомель, Беларусь',
    workHours: 'Пн–Сб, 10:00–20:00',
  },

  /* ── Категории ────────────────────────────────────────── */
  categories: [
    { id: 'all',       label: 'Все',       emoji: '✨' },
    { id: 'manicure',  label: 'Маникюр',   emoji: '💅' },
    { id: 'pedicure',  label: 'Педикюр',   emoji: '🦶' },
    { id: 'brows',     label: 'Брови',     emoji: '🪄' },
    { id: 'lashes',    label: 'Ресницы',   emoji: '👁' },
  ],

  /* ── Услуги ───────────────────────────────────────────── */
  services: [
    {
      id: 1,
      title: 'Маникюр классический',
      categoryId: 'manicure',
      price: 25,
      duration: 60,
      rating: 4.9,
      reviewsCount: 45,
      description: 'Классический маникюр — идеальная форма ногтей, уход за кутикулой и покрытие на выбор. Руки выглядят ухоженно и аккуратно. Подойдёт как для повседневного образа, так и для особых случаев.',
      emoji: '💅',
      // CSS-градиенты вместо фото — можно заменить на реальные URL
      photos: [
        { gradient: 'linear-gradient(135deg, #fda4af 0%, #fb7185 100%)', label: 'Готовый результат', emoji: '💅' },
        { gradient: 'linear-gradient(135deg, #fdba74 0%, #f97316 100%)', label: 'До процедуры',       emoji: '✋' },
        { gradient: 'linear-gradient(135deg, #86efac 0%, #22c55e 100%)', label: 'После процедуры',   emoji: '✨' },
      ],
    },
    {
      id: 2,
      title: 'Маникюр с гель-лаком',
      categoryId: 'manicure',
      price: 45,
      duration: 90,
      rating: 4.9,
      reviewsCount: 67,
      description: 'Маникюр с покрытием гель-лак — держится 3–4 недели без сколов. Форма ногтей, уход за кутикулой, база, цвет и топ. Выбор из 200+ оттенков. Снятие старого покрытия входит в стоимость.',
      emoji: '✨',
      photos: [
        { gradient: 'linear-gradient(135deg, #c4b5fd 0%, #8b5cf6 100%)', label: 'Готовый результат', emoji: '💜' },
        { gradient: 'linear-gradient(135deg, #f9a8d4 0%, #ec4899 100%)', label: 'Дизайн',            emoji: '🎨' },
        { gradient: 'linear-gradient(135deg, #93c5fd 0%, #3b82f6 100%)', label: 'Палитра',           emoji: '🎨' },
      ],
    },
    {
      id: 3,
      title: 'Педикюр классический',
      categoryId: 'pedicure',
      price: 35,
      duration: 75,
      rating: 4.8,
      reviewsCount: 33,
      description: 'Комплексный уход за стопами и ногтями ног. Обработка кожи, форма ногтей, уход за кутикулой. Ноги становятся мягкими и ухоженными. Включает расслабляющую ванночку и завершающий массаж стоп.',
      emoji: '🦶',
      photos: [
        { gradient: 'linear-gradient(135deg, #a5f3fc 0%, #06b6d4 100%)', label: 'Готовый результат', emoji: '🦶' },
        { gradient: 'linear-gradient(135deg, #bae6fd 0%, #38bdf8 100%)', label: 'В процессе',        emoji: '💆' },
      ],
    },
    {
      id: 4,
      title: 'Коррекция и окраска бровей',
      categoryId: 'brows',
      price: 20,
      duration: 45,
      rating: 5.0,
      reviewsCount: 28,
      description: 'Коррекция формы бровей воском и пинцетом + окрашивание хной или краской. Брови выглядят аккуратно и выразительно. Эффект держится 2–3 недели. Подбор формы по типу лица.',
      emoji: '🪄',
      photos: [
        { gradient: 'linear-gradient(135deg, #bbf7d0 0%, #16a34a 100%)', label: 'До и после',        emoji: '🪄' },
        { gradient: 'linear-gradient(135deg, #fef08a 0%, #ca8a04 100%)', label: 'После окраски',     emoji: '✨' },
      ],
    },
    {
      id: 5,
      title: 'Наращивание ресниц',
      categoryId: 'lashes',
      price: 60,
      duration: 120,
      rating: 4.8,
      reviewsCount: 19,
      description: 'Классическое наращивание — одна искусственная ресница на одну натуральную. Взгляд становится глубоким и выразительным без туши. Материалы гипоаллергенны. Эффект держится 3–4 недели.',
      emoji: '👁',
      photos: [
        { gradient: 'linear-gradient(135deg, #fcd34d 0%, #d97706 100%)', label: 'Готовый результат', emoji: '👁' },
        { gradient: 'linear-gradient(135deg, #fde68a 0%, #f59e0b 100%)', label: 'Крупный план',      emoji: '✨' },
      ],
    },
  ],

  /* ── Отзывы (по id услуги) ────────────────────────────── */
  reviews: {
    1: [
      { name: 'Аня К.',   rating: 5, text: 'Очень аккуратно, руки выглядят идеально. Уже третий раз прихожу!',           date: '12 мая' },
      { name: 'Оля М.',   rating: 5, text: 'Марина — лучший мастер, всегда качественно и быстро',                        date: '8 мая'  },
      { name: 'Катя Л.',  rating: 4, text: 'Хорошо получилось, пришла снова — не пожалела',                              date: '5 мая'  },
    ],
    2: [
      { name: 'Алиса Р.', rating: 5, text: 'Гель держится уже 4 недели — ни одного скола! Невероятно',                   date: '15 мая' },
      { name: 'Вика С.',  rating: 5, text: 'Потрясающий дизайн, все подруги спрашивают где делала',                      date: '10 мая' },
      { name: 'Маша Д.',  rating: 5, text: 'Записалась на маникюр впервые и не прогадала, приду ещё',                    date: '7 мая'  },
    ],
    3: [
      { name: 'Таня Б.',  rating: 5, text: 'Ноги как после спа, чудесная процедура!',                                    date: '14 мая' },
      { name: 'Женя К.',  rating: 5, text: 'Очень аккуратно, совсем не больно. Спасибо Марине',                          date: '9 мая'  },
    ],
    4: [
      { name: 'Даша О.',  rating: 5, text: 'Форма бровей идеальная, давно так хорошо не выглядели',                      date: '16 мая' },
      { name: 'Маша П.',  rating: 5, text: 'Всегда прихожу только к Марине, доверяю ей полностью',                       date: '11 мая' },
    ],
    5: [
      { name: 'Лена В.',  rating: 5, text: 'Выглядит очень естественно, утром не нужна тушь — мечта!',                   date: '13 мая' },
      { name: 'Соня Ж.',  rating: 4, text: 'Красиво получилось, держатся уже третью неделю',                             date: '6 мая'  },
    ],
  },
};

/* ══════════════════════════════════════════════════════════
   Генерация слотов
   Создаём расписание на 45 дней вперёд.
   Мастер работает Пн–Сб, 10:00–19:00.
   Некоторые слоты помечаем занятыми случайно (сид по дате).
   ══════════════════════════════════════════════════════════ */

/**
 * Простой детерминированный псевдослучайный генератор.
 * Один и тот же сид → одинаковый результат (слоты не "мерцают" при re-render).
 */
function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

/** Форматирует Date в строку "YYYY-MM-DD" */
function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Форматирует дату по-русски: "Суббота, 17 мая" */
function formatDateRu(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const days   = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
  const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  return `${days[date.getDay()]}, ${d} ${months[m - 1]}`;
}

/** Форматирует дату коротко: "17 мая" */
function formatDateShort(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  const months = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
  return `${d} ${months[m - 1]}`;
}

/** Форматирует длительность: "1 ч 30 мин" или "45 мин" */
function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} мин`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

/** Форматирует цену: "25 р." */
function formatPrice(price) {
  return price.toLocaleString('ru-BY') + ' р.';
}

// Фиксированные времена слотов (Пн–Сб, 10:00–19:00)
const SLOT_TIMES = ['10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00'];

/**
 * Генерирует слоты для всех услуг на 45 дней вперёд.
 * Возвращает объект: { "2026-05-20": [{time, available}, ...], ... }
 */
function generateAllSlots() {
  const result = {};
  const today = new Date();

  for (let i = 1; i <= 45; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);

    // Воскресенье (0) — выходной
    if (date.getDay() === 0) continue;

    const key = formatDateKey(date);
    // Сид из даты для детерминизма
    const seed = parseInt(key.replace(/-/g, ''), 10);
    const rand = seededRandom(seed);

    result[key] = SLOT_TIMES.map(time => ({
      time,
      available: rand() > 0.35, // ~65% слотов доступны
    }));
  }

  return result;
}

// Генерируем один раз при загрузке — все слоты в одном объекте
const ALL_SLOTS = generateAllSlots();

/** Возвращает ближайший доступный слот в формате "завтра в 11:00" или "21 мая в 14:00" */
function getNextSlotLabel() {
  const today = new Date();
  const tomorrowKey = formatDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));

  for (const dateKey of Object.keys(ALL_SLOTS).sort()) {
    const slot = ALL_SLOTS[dateKey].find(s => s.available);
    if (!slot) continue;
    if (dateKey === tomorrowKey) return `завтра в ${slot.time}`;
    return `${formatDateShort(dateKey)} в ${slot.time}`;
  }
  return null;
}

/* ══════════════════════════════════════════════════════════
   Хранилище записей (localStorage)
   ══════════════════════════════════════════════════════════ */

const BookingStorage = {
  KEY: 'beauty_app_bookings',

  /** Все записи */
  getAll() {
    try {
      return JSON.parse(localStorage.getItem(this.KEY) || '[]');
    } catch {
      return [];
    }
  },

  /** Предстоящие подтверждённые записи */
  getUpcoming() {
    const now = new Date();
    return this.getAll().filter(b => {
      if (b.status !== 'confirmed') return false;
      const dt = new Date(`${b.date}T${b.time}`);
      return dt > now;
    });
  },

  /** Прошедшие / отменённые записи */
  getPast() {
    const now = new Date();
    return this.getAll().filter(b => {
      if (b.status === 'cancelled') return true;
      const dt = new Date(`${b.date}T${b.time}`);
      return dt <= now;
    });
  },

  /** Последняя подтверждённая запись для блока "Записаться снова" */
  getLast() {
    return this.getAll().find(b => b.status === 'confirmed' || b.status === 'completed') || null;
  },

  /** Добавить запись */
  add(booking) {
    const all = this.getAll();
    const newBooking = {
      id: Date.now(),
      status: 'confirmed',
      createdAt: new Date().toISOString(),
      ...booking,
    };
    all.unshift(newBooking);
    localStorage.setItem(this.KEY, JSON.stringify(all));
    return newBooking;
  },

  /** Отменить запись по id */
  cancel(id) {
    const all = this.getAll();
    const idx = all.findIndex(b => b.id === id);
    if (idx !== -1) {
      all[idx].status = 'cancelled';
      localStorage.setItem(this.KEY, JSON.stringify(all));
    }
  },

  /** Найти услугу по id записи */
  getServiceForBooking(booking) {
    return APP_DATA.services.find(s => s.id === booking.serviceId) || null;
  },
};
