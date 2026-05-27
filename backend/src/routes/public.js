const { query } = require('../db');
const { computeAvailableSlots } = require('../services/slots');

async function publicRoutes(fastify) {

  fastify.get('/api/v1/masters/:slug', async (req, reply) => {
    const { rows } = await query(
      `SELECT m.slug, m.plan, p.display_name, p.bio, p.bio_short, p.specializations,
              p.experience_years, p.works_count, p.rating, p.reviews_count,
              p.instagram, p.address, p.work_hours, p.gradient, p.photo_file_id
       FROM masters m JOIN master_profiles p ON p.master_id = m.id
       WHERE m.slug = $1 AND m.is_active = true`,
      [req.params.slug]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Master not found' });
    return rows[0];
  });

  fastify.get('/api/v1/masters/:slug/services', async (req, reply) => {
    const { rows: master } = await query(
      'SELECT id FROM masters WHERE slug = $1 AND is_active = true',
      [req.params.slug]
    );
    if (!master.length) return reply.code(404).send({ error: 'Not found' });
    const { rows } = await query(
      `SELECT s.*, c.label AS category_label, c.emoji AS category_emoji
       FROM services s LEFT JOIN service_categories c ON c.id = s.category_id
       WHERE s.master_id = $1 AND s.is_active = true ORDER BY s.sort_order, s.id`,
      [master[0].id]
    );
    return rows;
  });

  fastify.get('/api/v1/masters/:slug/services/:id', async (req, reply) => {
    const { rows: master } = await query(
      'SELECT id FROM masters WHERE slug = $1 AND is_active = true',
      [req.params.slug]
    );
    if (!master.length) return reply.code(404).send({ error: 'Not found' });
    const { rows: svc } = await query(
      'SELECT * FROM services WHERE id = $1 AND master_id = $2 AND is_active = true',
      [req.params.id, master[0].id]
    );
    if (!svc.length) return reply.code(404).send({ error: 'Service not found' });
    const { rows: reviews } = await query(
      `SELECT * FROM reviews
       WHERE service_id = $1 AND master_id = $2 AND is_published = true
       ORDER BY created_at DESC LIMIT 5`,
      [req.params.id, master[0].id]
    );
    return { ...svc[0], reviews };
  });

  fastify.get('/api/v1/masters/:slug/slots', async (req, reply) => {
    const { date } = req.query;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.code(400).send({ error: 'date required (YYYY-MM-DD)' });
    }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (new Date(date + 'T00:00:00') <= today) return [];

    const { rows: master } = await query(
      'SELECT id FROM masters WHERE slug = $1 AND is_active = true',
      [req.params.slug]
    );
    if (!master.length) return reply.code(404).send({ error: 'Not found' });
    return computeAvailableSlots(master[0].id, date);
  });

  fastify.get('/api/v1/masters/:slug/theme', async (req, reply) => {
    const { rows } = await query(
      `SELECT t.color_scheme, t.logo_url, t.logo_file_id, t.show_platform_branding
       FROM masters m LEFT JOIN master_themes t ON t.master_id = m.id
       WHERE m.slug = $1 AND m.is_active = true`,
      [req.params.slug]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Not found' });
    return rows[0] || { color_scheme: 'default', show_platform_branding: true };
  });
}

module.exports = publicRoutes;
