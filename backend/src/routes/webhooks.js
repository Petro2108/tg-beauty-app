const { getBotForMaster } = require('../bots/manager');
const { query } = require('../db');

async function webhookRoutes(fastify) {
  fastify.post('/webhook/platform', async (req, reply) => {
    await fastify.platformBot.handleUpdate(req.body);
    return reply.code(200).send({ ok: true });
  });

  fastify.post('/webhook/master/:slug', async (req, reply) => {
    const { rows } = await query(
      'SELECT * FROM masters WHERE slug = $1 AND is_active = true',
      [req.params.slug]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Unknown master' });
    const bot = await getBotForMaster(rows[0].id);
    if (!bot) return reply.code(404).send({ error: 'Bot not loaded' });
    await bot.handleUpdate(req.body);
    return reply.code(200).send({ ok: true });
  });
}

module.exports = webhookRoutes;
