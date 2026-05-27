const cron = require('node-cron');
const { query } = require('../db');
const { sendReminder } = require('../services/notifications');

async function processReminders(hoursAhead, reminderCol) {
  const { rows } = await query(
    `SELECT b.*, s.title, s.emoji,
            m.id AS master_id, m.telegram_id AS master_telegram_id,
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
      await sendReminder(
        row,
        { title: row.title, emoji: row.emoji },
        { id: row.master_id, address: row.address },
        hoursText
      );
      await query(`UPDATE bookings SET ${reminderCol} = true WHERE id = $1`, [row.id]);
    } catch (e) {
      console.error(`Reminder failed for booking ${row.id}:`, e.message);
    }
  }
}

async function checkExpiredSubscriptions() {
  const { rows } = await query(
    `SELECT * FROM masters WHERE plan = 'pro' AND plan_expires_at < now()`
  );
  for (const master of rows) {
    await query('UPDATE masters SET plan = $1 WHERE id = $2', ['free', master.id]);

    // Скрыть услуги сверх лимита
    const { rows: extra } = await query(
      `SELECT id FROM services WHERE master_id = $1 AND is_active = true
       ORDER BY sort_order, id OFFSET 5`,
      [master.id]
    );
    for (const svc of extra) {
      await query('UPDATE services SET is_active = false WHERE id = $1', [svc.id]);
    }

    // Уведомить мастера
    try {
      const { getBotForMaster } = require('../bots/manager');
      const bot = await getBotForMaster(master.id);
      if (bot) {
        await bot.api.sendMessage(master.telegram_id,
          `⚠️ Подписка Pro истекла. Аккаунт переведён на Free план (5 услуг максимум).\n` +
          (extra.length ? `\n${extra.length} услуг скрыто.\n` : '') +
          `\nДля продления: /subscribe`
        );
      }
    } catch (e) {
      console.error(`Failed to notify master ${master.id}:`, e.message);
    }
  }
}

// Напоминания каждые 15 минут
cron.schedule('*/15 * * * *', () => {
  processReminders(24, 'reminder_24h_sent').catch(console.error);
  processReminders(2, 'reminder_2h_sent').catch(console.error);
});

// Проверка истёкших подписок ежедневно в 00:05
cron.schedule('5 0 * * *', () => {
  checkExpiredSubscriptions().catch(console.error);
});
