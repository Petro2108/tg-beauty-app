const { query } = require('../db');
const { decrypt } = require('../crypto');

async function filesRoutes(fastify) {
  // Прокси для Telegram file_id — скрывает bot_token от клиента
  fastify.get('/files/:masterSlug/:fileId', async (req, reply) => {
    const { rows } = await query(
      'SELECT bot_token FROM masters WHERE slug = $1 AND is_active = true',
      [req.params.masterSlug]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Not found' });

    const botToken = decrypt(rows[0].bot_token);
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${req.params.fileId}`
    );
    const json = await res.json();
    if (!json.ok) return reply.code(404).send({ error: 'File not found' });

    const fileUrl = `https://api.telegram.org/file/bot${botToken}/${json.result.file_path}`;
    return reply.redirect(fileUrl);
  });
}

module.exports = filesRoutes;
