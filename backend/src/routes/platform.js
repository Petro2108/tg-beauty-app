const { query } = require('../db');
const { PLATFORM_ADMIN_TOKEN } = require('../config');
const { getBotForMaster } = require('../bots/manager');

async function platformAdminAuth(req, reply) {
  const token = req.headers['x-platform-admin-token'];
  if (!PLATFORM_ADMIN_TOKEN || !token || token !== PLATFORM_ADMIN_TOKEN) {
    return reply.code(403).send({ error: 'Forbidden' });
  }
}

async function platformRoutes(fastify) {
  fastify.addHook('preHandler', platformAdminAuth);

  fastify.get('/api/v1/platform/masters', async () => {
    const { rows } = await query(
      `SELECT m.*, p.display_name FROM masters m
       LEFT JOIN master_profiles p ON p.master_id = m.id
       ORDER BY m.created_at DESC`
    );
    return rows;
  });

  fastify.patch('/api/v1/platform/masters/:id/activate', async (req, reply) => {
    const { months = 1 } = req.body;
    const expires = new Date();
    expires.setMonth(expires.getMonth() + months);

    await query(
      `UPDATE masters SET plan='pro', plan_expires_at=$1 WHERE id=$2`,
      [expires.toISOString(), req.params.id]
    );
    await query(
      `INSERT INTO subscription_payments (master_id, period_months, activated_by, expires_at)
       VALUES ($1,$2,$3,$4)`,
      [req.params.id, months, 0, expires.toISOString()]
    );

    const { rows } = await query(
      'SELECT telegram_id FROM masters WHERE id = $1',
      [req.params.id]
    );
    if (rows.length) {
      const bot = await getBotForMaster(parseInt(req.params.id));
      if (bot) {
        await bot.api.sendMessage(rows[0].telegram_id,
          `🎉 <b>Pro подписка активирована!</b>\n\n` +
          `Активна до: ${expires.toLocaleDateString('ru-RU')}\n\n` +
          `Теперь доступно:\n` +
          `• Безлимит услуг → /add_service\n` +
          `• Выбор темы → /theme`,
          { parse_mode: 'HTML' }
        ).catch(console.error);
      }
    }
    return { ok: true, expires_at: expires.toISOString() };
  });

  fastify.patch('/api/v1/platform/masters/:id/suspend', async (req, reply) => {
    await query(
      'UPDATE masters SET is_active = false WHERE id = $1',
      [req.params.id]
    );
    return { ok: true };
  });
}

module.exports = platformRoutes;
