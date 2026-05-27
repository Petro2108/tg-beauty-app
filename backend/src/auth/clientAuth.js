const { verifyInitData } = require('./verifyInitData');
const { decrypt } = require('../crypto');
const { query } = require('../db');

async function clientAuth(req, reply) {
  const initData = req.headers['x-telegram-init-data'];
  const masterSlug = req.body?.master_slug || req.query?.master_slug;
  if (!initData || !masterSlug) return reply.code(401).send({ error: 'Unauthorized' });

  const { rows } = await query(
    'SELECT * FROM masters WHERE slug = $1 AND is_active = true',
    [masterSlug]
  );
  if (!rows.length) return reply.code(404).send({ error: 'Master not found' });

  const master = rows[0];
  const botToken = decrypt(master.bot_token);
  const tgUser = verifyInitData(initData, botToken);
  if (!tgUser) return reply.code(401).send({ error: 'Invalid initData' });

  req.tgUser = tgUser;
  req.master = master;
}

module.exports = { clientAuth };
