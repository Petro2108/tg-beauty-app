const { masterAuth } = require('../auth/masterAuth');
const { query } = require('../db');

const SERVICE_FREE_LIMIT = 5;

async function adminRoutes(fastify) {
  fastify.addHook('preHandler', masterAuth);

  /* ── Профиль ── */
  fastify.get('/api/v1/admin/profile', async (req) => {
    const { rows } = await query(
      'SELECT * FROM master_profiles WHERE master_id = $1',
      [req.master.id]
    );
    return { ...req.master, profile: rows[0] || null };
  });

  fastify.put('/api/v1/admin/profile', async (req) => {
    const { display_name, bio, bio_short, specializations, experience_years, address, work_hours, instagram, gradient } = req.body;
    await query(
      `INSERT INTO master_profiles
         (master_id, display_name, bio, bio_short, specializations, experience_years, address, work_hours, instagram, gradient)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (master_id) DO UPDATE SET
         display_name=$2, bio=$3, bio_short=$4, specializations=$5,
         experience_years=$6, address=$7, work_hours=$8, instagram=$9, gradient=$10`,
      [req.master.id, display_name, bio, bio_short, specializations, experience_years, address, work_hours, instagram, gradient]
    );
    return { ok: true };
  });

  /* ── Расписание ── */
  fastify.get('/api/v1/admin/schedule', async (req) => {
    const { rows } = await query(
      'SELECT * FROM master_schedules WHERE master_id = $1 ORDER BY day_of_week',
      [req.master.id]
    );
    return rows;
  });

  fastify.put('/api/v1/admin/schedule', async (req) => {
    for (const s of req.body) {
      await query(
        `INSERT INTO master_schedules (master_id, day_of_week, start_time, end_time, is_working)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (master_id, day_of_week) DO UPDATE SET start_time=$3, end_time=$4, is_working=$5`,
        [req.master.id, s.day_of_week, s.start_time, s.end_time, s.is_working]
      );
    }
    return { ok: true };
  });

  /* ── Услуги ── */
  fastify.get('/api/v1/admin/services', async (req) => {
    const { rows } = await query(
      'SELECT * FROM services WHERE master_id = $1 ORDER BY sort_order, id',
      [req.master.id]
    );
    return rows;
  });

  fastify.post('/api/v1/admin/services', async (req, reply) => {
    if (req.master.plan === 'free') {
      const { rows } = await query(
        'SELECT COUNT(*) FROM services WHERE master_id = $1 AND is_active = true',
        [req.master.id]
      );
      if (parseInt(rows[0].count) >= SERVICE_FREE_LIMIT) {
        return reply.code(403).send({
          error: 'LIMIT_REACHED',
          limit: SERVICE_FREE_LIMIT,
          message: `Free план ограничен ${SERVICE_FREE_LIMIT} услугами. Оформи Pro подписку.`,
        });
      }
    }
    const { title, description, price, duration_min, emoji, category_id, photos } = req.body;
    const { rows } = await query(
      `INSERT INTO services (master_id, title, description, price, duration_min, emoji, category_id, photos)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.master.id, title, description, price, duration_min, emoji, category_id || null, JSON.stringify(photos || [])]
    );
    return reply.code(201).send(rows[0]);
  });

  fastify.put('/api/v1/admin/services/:id', async (req, reply) => {
    const { title, description, price, duration_min, emoji, photos, is_active } = req.body;
    const { rows } = await query(
      `UPDATE services SET
         title=$1, description=$2, price=$3, duration_min=$4, emoji=$5,
         photos=$6, is_active=COALESCE($7, is_active)
       WHERE id = $8 AND master_id = $9 RETURNING *`,
      [title, description, price, duration_min, emoji, JSON.stringify(photos), is_active, req.params.id, req.master.id]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Not found' });
    return rows[0];
  });

  fastify.delete('/api/v1/admin/services/:id', async (req, reply) => {
    await query(
      'UPDATE services SET is_active = false WHERE id = $1 AND master_id = $2',
      [req.params.id, req.master.id]
    );
    return reply.code(204).send();
  });

  /* ── Записи ── */
  fastify.get('/api/v1/admin/bookings', async (req) => {
    const { date, status } = req.query;
    let sql = `SELECT b.*, s.title, s.emoji
               FROM bookings b LEFT JOIN services s ON s.id = b.service_id
               WHERE b.master_id = $1`;
    const params = [req.master.id];
    if (date) { params.push(date); sql += ` AND b.booking_date = $${params.length}`; }
    if (status) { params.push(status); sql += ` AND b.status = $${params.length}`; }
    sql += ' ORDER BY b.booking_date, b.booking_time';
    const { rows } = await query(sql, params);
    return rows;
  });

  fastify.patch('/api/v1/admin/bookings/:id', async (req, reply) => {
    const { status } = req.body;
    if (!['confirmed', 'cancelled', 'completed'].includes(status)) {
      return reply.code(400).send({ error: 'Invalid status' });
    }
    const { rows } = await query(
      'UPDATE bookings SET status=$1 WHERE id=$2 AND master_id=$3 RETURNING *',
      [status, req.params.id, req.master.id]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Not found' });
    return rows[0];
  });

  /* ── Блокировка слотов ── */
  fastify.post('/api/v1/admin/blocked-slots', async (req, reply) => {
    const { date, time, reason } = req.body;
    const { rows } = await query(
      `INSERT INTO blocked_slots (master_id, blocked_date, blocked_time, reason)
       VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING *`,
      [req.master.id, date, time || null, reason || null]
    );
    return reply.code(201).send(rows[0] || { ok: true });
  });

  fastify.delete('/api/v1/admin/blocked-slots/:id', async (req, reply) => {
    await query(
      'DELETE FROM blocked_slots WHERE id=$1 AND master_id=$2',
      [req.params.id, req.master.id]
    );
    return reply.code(204).send();
  });

  /* ── Подписка ── */
  fastify.get('/api/v1/admin/subscription', async (req) => {
    return {
      plan: req.master.plan,
      plan_expires_at: req.master.plan_expires_at,
    };
  });

  /* ── Тема (только pro) ── */
  fastify.put('/api/v1/admin/theme', async (req, reply) => {
    if (req.master.plan !== 'pro') {
      return reply.code(403).send({
        error: 'PRO_REQUIRED',
        message: 'Настройка темы доступна только в Pro плане',
      });
    }
    const { color_scheme, logo_url, logo_file_id, show_platform_branding } = req.body;
    await query(
      `INSERT INTO master_themes (master_id, color_scheme, logo_url, logo_file_id, show_platform_branding)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (master_id) DO UPDATE SET
         color_scheme=$2, logo_url=$3, logo_file_id=$4, show_platform_branding=$5`,
      [req.master.id, color_scheme, logo_url, logo_file_id, show_platform_branding]
    );
    return { ok: true };
  });
}

module.exports = adminRoutes;
