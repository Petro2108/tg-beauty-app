const { Bot } = require('grammy');
const { query } = require('../db');
const { encrypt } = require('../crypto');
const { registerMasterBot, getBotForMaster } = require('./manager');
const { APP_URL, API_URL, PLATFORM_ADMIN_TG_ID, PAYMENT_CARD } = require('../config');

const sessions = new Map(); // telegram_id → { step, masterId, data }

// ─────────────────────────────────────────────────────
// Тексты сообщений
// ─────────────────────────────────────────────────────
const MSG = {

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

  awaiting:
    `⬆️ Скопируй токен из @BotFather и пришли его мне.\n\n` +
    `Токен выглядит примерно так:\n` +
    `<code>1234567890:AABBCCDDEEFFaabbccddeeff</code>\n\n` +
    `Если ещё не создал бота — смотри инструкцию: /instructions`,

  tokenInvalid: (hint) =>
    `❌ Не удалось подключить бота.\n\n` +
    `Причина: ${hint}\n\n` +
    `Что проверить:\n` +
    `• Скопировал ли ты <b>весь</b> токен целиком?\n` +
    `• Не добавил ли лишние пробелы или символы?\n` +
    `• Этот токен точно от @BotFather, а не откуда-то ещё?\n\n` +
    `Попробуй ещё раз или напиши /help`,

  tokenDuplicate: (botUsername) =>
    `⚠️ Бот @${botUsername} уже подключён к платформе.\n\n` +
    `Если это твой бот и ты потерял доступ — напиши нам.`,

  tokenOk: (botUsername) =>
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

  profileDone: (name, botUsername) =>
    `🎉 Профиль настроен!\n\n` +
    `Имя: ${name}\n` +
    `Ссылка для клиентов: t.me/${botUsername}\n\n` +
    `Теперь добавим первую услугу — клиенты увидят её в каталоге.\n`,

  svcStep1:
    `➕ Добавление услуги\n\n` +
    `Шаг 1 из 6 — Название\n\n` +
    `Напиши название услуги так, как увидят клиенты.\n\n` +
    `Примеры:\n` +
    `<code>Маникюр классический</code>\n` +
    `<code>Маникюр с гель-лаком</code>\n` +
    `<code>Наращивание ресниц (классика)</code>`,

  svcStep2: () => `Шаг 2 из 6 — Категория\n\nВыбери категорию для этой услуги:`,

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

  status: (master, displayName, svcCount) =>
    `📊 Твой аккаунт\n\n` +
    `👤 ${displayName || 'Имя не указано'}\n` +
    `🤖 Бот: @${master.bot_username}\n` +
    `📦 Услуги: ${svcCount} из ${master.plan === 'pro' ? '∞' : '5'}\n` +
    `💎 План: ${master.plan === 'pro'
      ? `Pro (до ${new Date(master.plan_expires_at).toLocaleDateString('ru-RU')})`
      : 'Free'}\n\n` +
    `🔗 Ссылка для клиентов:\n` +
    `t.me/${master.bot_username}\n\n` +
    `Команды: /add_service · /my_services · /bookings · /subscribe`,

  subscribe: (plan, expiresAt, card) =>
    `💎 Pro подписка\n\n` +
    `Твой план: ${plan === 'pro'
      ? `✅ Pro (до ${new Date(expiresAt).toLocaleDateString('ru-RU')})`
      : '🆓 Free'}\n\n` +
    `Что даёт Pro:\n` +
    `• Безлимит услуг (сейчас: до 5)\n` +
    `• 6 цветовых тем приложения\n` +
    `• Кастомный логотип в шапке\n` +
    `• Убрать надпись "Powered by"\n\n` +
    `💰 Стоимость:\n` +
    `• 15 BYN / месяц\n` +
    `• 150 BYN / год (экономия 30 BYN)\n\n` +
    `Для оплаты:\n` +
    `Переведи на карту: <code>${card}</code>\n\n` +
    `После перевода пришли скриншот оплаты прямо сюда 👇\n` +
    `Подписка активируется в течение нескольких часов.`,

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

// Клавиатура категорий (inline)
async function buildCategoryKeyboard(masterId) {
  const { rows } = await query(
    'SELECT * FROM service_categories WHERE master_id = $1 ORDER BY sort_order',
    [masterId]
  );
  const buttons = rows.map(c => ({ text: `${c.emoji || ''} ${c.label}`, callback_data: `cat_${c.id}` }));
  const keyboard = [];
  for (let i = 0; i < buttons.length; i += 2) {
    keyboard.push(buttons.slice(i, i + 2));
  }
  keyboard.push([{ text: '➕ Другая (ввести вручную)', callback_data: 'cat_custom' }]);
  return { inline_keyboard: keyboard };
}

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
  await ctx.reply(MSG.profileDone(d.display_name, rows[0].bot_username), { parse_mode: 'HTML' });
  sessions.set(tgId, { step: 'svc_name', masterId: session.masterId, data: { photos: [] } });
  await ctx.reply(MSG.svcStep1, { parse_mode: 'HTML' });
}

async function saveSvc(ctx, session, tgId) {
  const d = session.data;
  await query(
    `INSERT INTO services (master_id, title, category_id, price, duration_min, description, photos)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [session.masterId, d.title, d.category_id || null, d.price, d.duration_min,
      d.description, JSON.stringify(d.photos)]
  );
  sessions.delete(tgId);
  await ctx.reply(MSG.svcDone(d.title));
}

function setupPlatformBotHandlers(bot) {

  // ── /start ──────────────────────────────────────────────────────────────
  bot.command('start', async ctx => {
    const tgId = ctx.from.id;
    const firstName = ctx.from.first_name || 'мастер';

    const { rows } = await query(
      `SELECT m.*, p.display_name FROM masters m
       LEFT JOIN master_profiles p ON p.master_id = m.id
       WHERE m.telegram_id = $1`,
      [tgId]
    );
    if (rows.length) {
      const { rows: svcs } = await query(
        'SELECT COUNT(*) FROM services WHERE master_id = $1 AND is_active = true',
        [rows[0].id]
      );
      return ctx.reply(
        MSG.status(rows[0], rows[0].display_name, parseInt(svcs[0].count)),
        { parse_mode: 'HTML' }
      );
    }

    sessions.set(tgId, { step: 'awaiting_token', data: {} });
    await ctx.reply(MSG.welcome(firstName), {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: '🤖 Открыть @BotFather', url: 'https://t.me/BotFather' }]],
      },
    });
    setTimeout(() => ctx.reply(MSG.botfatherGuide, { parse_mode: 'HTML' }), 1000);
  });

  // ── /instructions ────────────────────────────────────────────────────────
  bot.command('instructions', ctx => ctx.reply(MSG.botfatherGuide, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: '🤖 Открыть @BotFather', url: 'https://t.me/BotFather' }]] },
  }));

  // ── /help ────────────────────────────────────────────────────────────────
  bot.command('help', ctx => ctx.reply(MSG.help));

  // ── /status ──────────────────────────────────────────────────────────────
  bot.command('status', async ctx => {
    const { rows } = await query(
      `SELECT m.*, p.display_name FROM masters m
       LEFT JOIN master_profiles p ON p.master_id = m.id
       WHERE m.telegram_id = $1`,
      [ctx.from.id]
    );
    if (!rows.length) return ctx.reply('Ты ещё не зарегистрирован. Напиши /start');
    const { rows: svcs } = await query(
      'SELECT COUNT(*) FROM services WHERE master_id = $1 AND is_active = true',
      [rows[0].id]
    );
    return ctx.reply(MSG.status(rows[0], rows[0].display_name, parseInt(svcs[0].count)), { parse_mode: 'HTML' });
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
      `${b.emoji || ''} ${b.title}\n📅 ${b.booking_date} в ${String(b.booking_time).slice(0, 5)}\n👤 ${b.client_name || 'Клиент'}`
    );
    await ctx.reply(`📋 Ближайшие записи:\n\n${lines.join('\n\n')}`);
  });

  // ── /subscribe ───────────────────────────────────────────────────────────
  bot.command('subscribe', async ctx => {
    const { rows } = await query('SELECT * FROM masters WHERE telegram_id = $1', [ctx.from.id]);
    if (!rows.length) return ctx.reply('Сначала подключи бота через /start');
    await ctx.reply(MSG.subscribe(rows[0].plan, rows[0].plan_expires_at, PAYMENT_CARD), { parse_mode: 'HTML' });
  });

  // ── /theme ───────────────────────────────────────────────────────────────
  bot.command('theme', async ctx => {
    const { rows } = await query('SELECT * FROM masters WHERE telegram_id = $1', [ctx.from.id]);
    if (!rows.length) return ctx.reply('Сначала подключи бота через /start');
    if (rows[0].plan !== 'pro') {
      return ctx.reply('🎨 Выбор темы доступен только в Pro плане.\n\nОформи подписку: /subscribe');
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
        ],
      },
    });
  });

  // ── /add_service ──────────────────────────────────────────────────────────
  bot.command('add_service', async ctx => {
    const { rows: master } = await query('SELECT * FROM masters WHERE telegram_id = $1', [ctx.from.id]);
    if (!master.length) return ctx.reply('Сначала подключи бота через /start');

    if (master[0].plan === 'free') {
      const { rows: cnt } = await query(
        'SELECT COUNT(*) FROM services WHERE master_id = $1 AND is_active = true',
        [master[0].id]
      );
      if (parseInt(cnt[0].count) >= 5) {
        return ctx.reply(
          `⚠️ На бесплатном плане можно добавить до 5 услуг.\n` +
          `У тебя уже ${cnt[0].count}.\n\n` +
          `Чтобы добавить больше — оформи Pro подписку: /subscribe`
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
      'SELECT * FROM services WHERE master_id = $1 ORDER BY sort_order, id',
      [master[0].id]
    );
    if (!rows.length) return ctx.reply('Услуг пока нет. Добавь первую: /add_service');
    for (const svc of rows) {
      const statusLabel = svc.is_active ? '✅' : '🚫 скрыта';
      await ctx.reply(
        `${svc.emoji || '💅'} <b>${svc.title}</b> ${statusLabel}\n💰 ${svc.price} BYN · ⏱ ${svc.duration_min} мин`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[
              { text: '✏️ Изменить', callback_data: `edit_svc_${svc.id}` },
              { text: svc.is_active ? '🙈 Скрыть' : '👁 Показать', callback_data: `toggle_svc_${svc.id}` },
              { text: '🗑 Удалить', callback_data: `del_svc_${svc.id}` },
            ]],
          },
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

  // ── Inline callbacks ──────────────────────────────────────────────────────
  bot.on('callback_query', async ctx => {
    const data = ctx.callbackQuery.data;
    const tgId = ctx.from.id;

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

    if (data.startsWith('del_svc_')) {
      const svcId = parseInt(data.replace('del_svc_', ''));
      await query('UPDATE services SET is_active = false WHERE id = $1', [svcId]);
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      await ctx.reply('🗑 Услуга удалена.');
      return ctx.answerCallbackQuery();
    }

    if (data === 'svc_photos_done') {
      const session = sessions.get(tgId);
      if (!session || session.step !== 'svc_photos') return ctx.answerCallbackQuery();
      await saveSvc(ctx, session, tgId);
      return ctx.answerCallbackQuery();
    }

    return ctx.answerCallbackQuery();
  });

  // ── Входящие сообщения ────────────────────────────────────────────────────
  bot.on('message', async ctx => {
    const text = (ctx.message.text || '').trim();
    const tgId = ctx.from.id;
    const session = sessions.get(tgId);

    // Фото
    if (ctx.message.photo) {
      const { rows: masterRows } = await query('SELECT * FROM masters WHERE telegram_id = $1', [tgId]);

      if (session?.step === 'setup_photo') {
        const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        session.data.photo_file_id = fileId;
        await finishProfileSetup(ctx, session, tgId);
        return;
      }

      if (session?.step === 'svc_photos') {
        const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        session.data.photos.push({ fileId, label: `Фото ${session.data.photos.length + 1}`, emoji: '💅' });
        sessions.set(tgId, session);
        await ctx.reply(
          `📷 Фото ${session.data.photos.length} принято!\n\nОтправь ещё фото или нажми кнопку ниже:`,
          {
            reply_markup: {
              inline_keyboard: [[{ text: '✅ Готово, сохранить услугу', callback_data: 'svc_photos_done' }]],
            },
          }
        );
        return;
      }

      // Скриншот оплаты подписки
      if (masterRows.length) {
        const adminId = PLATFORM_ADMIN_TG_ID;
        if (adminId) {
          await ctx.api.forwardMessage(adminId, ctx.chat.id, ctx.message.message_id);
          await ctx.api.sendMessage(adminId,
            `💰 Запрос на Pro от @${masterRows[0].bot_username} (ID мастера: ${masterRows[0].id})\n` +
            `Активировать на 1 месяц: /activate_${masterRows[0].id}_1\n` +
            `Активировать на 12 месяцев: /activate_${masterRows[0].id}_12`
          );
        }
        return ctx.reply(
          '✅ Скриншот получен!\n\n' +
          'Мы проверим оплату и активируем Pro подписку в течение нескольких часов.\n' +
          'Ты получишь уведомление здесь.'
        );
      }
      return;
    }

    // Токен нового бота
    if (/^\d{8,12}:[\w-]{35,}$/.test(text)) {
      await ctx.reply('⏳ Проверяю токен...');
      try {
        const testBot = new Bot(text);
        const me = await testBot.api.getMe();

        const { rows: existing } = await query(
          'SELECT 1 FROM masters WHERE bot_username = $1',
          [me.username]
        );
        if (existing.length) {
          return ctx.reply(MSG.tokenDuplicate(me.username), { parse_mode: 'HTML' });
        }

        const slug = me.username.toLowerCase()
          .replace(/_?bot$/i, '')
          .replace(/[^a-z0-9_]/g, '_');

        const { rows: created } = await query(
          `INSERT INTO masters (telegram_id, username, bot_token, bot_username, slug)
           VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [tgId, ctx.from.username || null, encrypt(text), me.username, slug]
        );
        const master = created[0];

        // Дефолтные категории
        const defaultCats = [
          ['Маникюр', '💅', 1], ['Педикюр', '🦶', 2],
          ['Брови', '🪄', 3], ['Ресницы', '👁', 4], ['Другое', '✨', 5],
        ];
        for (const [label, emoji, i] of defaultCats) {
          await query(
            'INSERT INTO service_categories (master_id, label, emoji, sort_order) VALUES ($1,$2,$3,$4)',
            [master.id, label, emoji, i]
          );
        }

        // Расписание по умолчанию: Пн–Сб 10:00–19:00, Вс — выходной
        for (let d = 1; d <= 6; d++) {
          await query(
            `INSERT INTO master_schedules (master_id, day_of_week, start_time, end_time, is_working)
             VALUES ($1,$2,'10:00','19:00',true)`,
            [master.id, d]
          );
        }
        await query(
          `INSERT INTO master_schedules (master_id, day_of_week, start_time, end_time, is_working)
           VALUES ($1,0,'10:00','19:00',false)`,
          [master.id]
        );

        await registerMasterBot(master);
        await testBot.api.setWebhook(`${API_URL}/webhook/master/${slug}`);
        await testBot.api.setChatMenuButton({
          menu_button: {
            type: 'web_app',
            text: '💅 Записаться',
            web_app: { url: `${APP_URL}?m=${slug}` },
          },
        });

        sessions.set(tgId, { step: 'setup_name', masterId: master.id, data: {} });
        await ctx.reply(MSG.tokenOk(me.username), { parse_mode: 'HTML' });
      } catch (e) {
        console.error('Token validation error:', e.message);
        const hint = e.message.includes('401') ? 'Токен недействителен' :
          e.message.includes('network') ? 'Проблема с сетью, попробуй ещё раз' :
            'Неизвестная ошибка';
        await ctx.reply(MSG.tokenInvalid(hint), { parse_mode: 'HTML' });
      }
      return;
    }

    // Пошаговые диалоги
    if (!session) {
      const { rows } = await query('SELECT 1 FROM masters WHERE telegram_id = $1', [tgId]);
      if (!rows.length) {
        return ctx.reply(MSG.awaiting, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[{ text: '🤖 Открыть @BotFather', url: 'https://t.me/BotFather' }]] },
        });
      }
      return;
    }

    if (session.step === 'setup_name') {
      if (text.length < 2) return ctx.reply('Слишком короткое имя. Напиши ещё раз.');
      session.data.display_name = text;
      session.step = 'setup_spec';
      sessions.set(tgId, session);
      return ctx.reply(MSG.setupStep2, { parse_mode: 'HTML' });
    }

    if (session.step === 'setup_spec') {
      session.data.specializations = text;
      session.step = 'setup_address';
      sessions.set(tgId, session);
      return ctx.reply(MSG.setupStep3, { parse_mode: 'HTML' });
    }

    if (session.step === 'setup_address') {
      session.data.address = text;
      session.step = 'setup_hours';
      sessions.set(tgId, session);
      return ctx.reply(MSG.setupStep4, { parse_mode: 'HTML' });
    }

    if (session.step === 'setup_hours') {
      session.data.work_hours = text;
      session.step = 'setup_photo';
      sessions.set(tgId, session);
      return ctx.reply(MSG.setupStep5, { parse_mode: 'HTML' });
    }

    if (session.step === 'setup_photo') {
      if (text.toLowerCase().includes('пропуст')) {
        await finishProfileSetup(ctx, session, tgId);
      } else {
        return ctx.reply('Отправь фото (изображение) или напиши «пропустить»');
      }
      return;
    }

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

    if (session.step === 'svc_name') {
      session.data.title = text;
      session.step = 'svc_category';
      sessions.set(tgId, session);
      const keyboard = await buildCategoryKeyboard(session.masterId);
      return ctx.reply(MSG.svcStep2(), { reply_markup: keyboard });
    }

    if (session.step === 'svc_category_custom') {
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
      if (isNaN(price) || price <= 0) {
        return ctx.reply('Введи корректную цену (только число, например: <code>25</code>)', { parse_mode: 'HTML' });
      }
      session.data.price = price;
      session.step = 'svc_duration';
      sessions.set(tgId, session);
      return ctx.reply(MSG.svcStep4, { parse_mode: 'HTML' });
    }

    if (session.step === 'svc_duration') {
      const dur = parseInt(text);
      if (isNaN(dur) || dur < 5 || dur > 480) {
        return ctx.reply('Введи длительность в минутах (от 5 до 480)', { parse_mode: 'HTML' });
      }
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
          inline_keyboard: [[{ text: '⏭ Пропустить фото', callback_data: 'svc_photos_done' }]],
        },
      });
    }
  });

  // ── Активация подписки администратором ────────────────────────────────────
  bot.hears(/^\/activate_(\d+)_(\d+)$/, async ctx => {
    if (String(ctx.from.id) !== String(PLATFORM_ADMIN_TG_ID)) return;
    const masterId = parseInt(ctx.match[1]);
    const months = parseInt(ctx.match[2]);
    const expires = new Date();
    expires.setMonth(expires.getMonth() + months);

    await query(
      `UPDATE masters SET plan='pro', plan_expires_at=$1 WHERE id=$2`,
      [expires.toISOString(), masterId]
    );
    await query(
      `INSERT INTO subscription_payments (master_id, period_months, activated_by, expires_at)
       VALUES ($1,$2,$3,$4)`,
      [masterId, months, ctx.from.id, expires.toISOString()]
    );

    const { rows } = await query(
      'SELECT telegram_id, bot_username FROM masters WHERE id = $1',
      [masterId]
    );
    if (rows.length) {
      const masterBot = await getBotForMaster(masterId);
      const sendFn = masterBot
        ? (id, txt, opts) => masterBot.api.sendMessage(id, txt, opts)
        : (id, txt, opts) => ctx.api.sendMessage(id, txt, opts);
      await sendFn(rows[0].telegram_id,
        `🎉 <b>Pro подписка активирована!</b>\n\n` +
        `Активна до: ${expires.toLocaleDateString('ru-RU')}\n\n` +
        `Теперь доступно:\n` +
        `• Безлимит услуг → /add_service\n` +
        `• Выбор темы → /theme\n` +
        `• Кастомный логотип`,
        { parse_mode: 'HTML' }
      ).catch(console.error);
    }
    await ctx.reply(
      `✅ Pro активирован для мастера ${masterId} на ${months} мес. до ${expires.toLocaleDateString('ru-RU')}`
    );
  });
}

module.exports = { setupPlatformBotHandlers };
