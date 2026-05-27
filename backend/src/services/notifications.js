const { query } = require('../db');

const DAYS_RU = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function formatDate(d) {
  const dt = new Date(d + 'T00:00:00');
  return `${DAYS_RU[dt.getDay()]}, ${dt.getDate()} ${MONTHS_RU[dt.getMonth()]}`;
}

function getBotForMaster(masterId) {
  // Lazy import to avoid circular dependency at module load time
  const { getBotForMaster: _get } = require('../bots/manager');
  return _get(masterId);
}

async function notify(event, data) {
  const bot = await getBotForMaster(data.master.id);
  if (!bot) return;

  if (event === 'booking_confirmed') {
    const { booking, service, master, client } = data;
    const dateStr = formatDate(String(booking.booking_date).slice(0, 10));
    const time = String(booking.booking_time).slice(0, 5);

    const { rows: profile } = await query(
      'SELECT display_name, address FROM master_profiles WHERE master_id = $1',
      [master.id]
    );
    const masterName = profile[0]?.display_name || 'Мастер';
    const address = profile[0]?.address || '';

    await bot.api.sendMessage(client.id,
      `✅ Запись подтверждена!\n\n` +
      `${service.emoji || ''} ${service.title}\n` +
      `📅 ${dateStr}, ${time}\n` +
      `👤 ${masterName}\n` +
      (address ? `📍 ${address}\n` : '') +
      `\nНапомним за 24ч и за 2ч до визита.`
    ).catch(console.error);

    await bot.api.sendMessage(master.telegram_id,
      `📥 Новая запись!\n\n` +
      `${service.emoji || ''} ${service.title}\n` +
      `📅 ${dateStr}, ${time}\n` +
      `👤 Клиент: ${client.first_name}${client.username ? ' @' + client.username : ''}`
    ).catch(console.error);
  }
}

async function sendReminder(booking, service, master, hoursText) {
  const bot = await getBotForMaster(master.id);
  if (!bot) return;
  const time = String(booking.booking_time).slice(0, 5);
  await bot.api.sendMessage(booking.client_telegram_id,
    `🔔 Напоминание!\n` +
    `${hoursText} у тебя запись:\n\n` +
    `${service.emoji || ''} ${service.title}\n` +
    `⏰ ${time}\n` +
    (master.address ? `📍 ${master.address}` : '')
  ).catch(console.error);
}

module.exports = { notify, sendReminder };
