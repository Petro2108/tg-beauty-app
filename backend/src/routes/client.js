const { clientAuth } = require('../auth/clientAuth');
const { createBooking } = require('../services/bookings');
const { query } = require('../db');

async function clientRoutes(fastify) {
  fastify.addHook('preHandler', clientAuth);

  fastify.get('/api/v1/bookings', async (req) => {
    const { rows } = await query(
      `SELECT b.*, s.title, s.emoji, s.price, s.duration_min, s.photos
       FROM bookings b LEFT JOIN services s ON s.id = b.service_id
       WHERE b.master_id = $1 AND b.client_telegram_id = $2
       ORDER BY b.booking_date DESC, b.booking_time DESC`,
      [req.master.id, req.tgUser.id]
    );
    return rows;
  });

  fastify.post('/api/v1/bookings', async (req, reply) => {
    const { service_id, date, time } = req.body;
    if (!service_id || !date || !time) {
      return reply.code(400).send({ error: 'service_id, date, time required' });
    }
    try {
      const booking = await createBooking({
        master: req.master,
        tgUser: req.tgUser,
        serviceId: service_id,
        date,
        time,
      });
      return reply.code(201).send(booking);
    } catch (e) {
      return reply.code(e.code || 500).send({ error: e.error || 'Internal error' });
    }
  });

  fastify.patch('/api/v1/bookings/:id/cancel', async (req, reply) => {
    const { rows } = await query(
      `UPDATE bookings SET status = 'cancelled'
       WHERE id = $1 AND master_id = $2 AND client_telegram_id = $3 AND status = 'confirmed'
       RETURNING *`,
      [req.params.id, req.master.id, req.tgUser.id]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Booking not found' });
    return rows[0];
  });
}

module.exports = clientRoutes;
