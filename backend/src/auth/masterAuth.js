const { verifyInitData } = require('./verifyInitData');
const { decrypt } = require('../crypto');
const { query } = require('../db');

async function masterAuth(req, reply) {
  const initData = req.headers['x-telegram-init-data'];
  if (!initData) return reply.code(401).send({ error: 'Unauthorized' });

  let userRaw;
  try {
    userRaw = JSON.parse(new URLSearchParams(initData).get('user') || 'null');
  } catch {
    return reply.code(401).send({ error: 'Invalid initData format' });
  }
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
