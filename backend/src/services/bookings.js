const { pool, query } = require('../db');
const { notify } = require('./notifications');

async function createBooking({ master, tgUser, serviceId, date, time }) {
  const d = new Date(date + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (d <= today) throw { code: 400, error: 'Cannot book past dates' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const conflict = await client.query(
      `SELECT 1 FROM bookings
       WHERE master_id=$1 AND booking_date=$2 AND booking_time=$3 AND status='confirmed'
       FOR UPDATE`,
      [master.id, date, time]
    );
    if (conflict.rows.length) throw { code: 409, error: 'Slot already taken' };

    const svc = await client.query(
      'SELECT * FROM services WHERE id = $1 AND master_id = $2 AND is_active = true',
      [serviceId, master.id]
    );
    if (!svc.rows.length) throw { code: 404, error: 'Service not found' };

    const { rows } = await client.query(
      `INSERT INTO bookings
         (master_id, client_telegram_id, client_name, service_id, booking_date, booking_time)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [master.id, tgUser.id, tgUser.first_name, serviceId, date, time]
    );
    await client.query('COMMIT');

    notify('booking_confirmed', { booking: rows[0], service: svc.rows[0], master, client: tgUser })
      .catch(console.error);

    return rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { createBooking };
