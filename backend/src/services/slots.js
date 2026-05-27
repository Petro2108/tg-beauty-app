const { query } = require('../db');

function generateTimeSlots(startTime, endTime) {
  const slots = [];
  let [h, m] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  while (h < eh || (h === eh && m < em)) {
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    m += 60;
    if (m >= 60) { h += Math.floor(m / 60); m = m % 60; }
  }
  return slots;
}

async function computeAvailableSlots(masterId, dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const dow = date.getDay(); // 0=Вс, 1=Пн

  const { rows: schedule } = await query(
    'SELECT * FROM master_schedules WHERE master_id = $1 AND day_of_week = $2',
    [masterId, dow]
  );
  if (!schedule.length || !schedule[0].is_working) return [];

  const baseTimes = generateTimeSlots(
    schedule[0].start_time.slice(0, 5),
    schedule[0].end_time.slice(0, 5)
  );

  const { rows: booked } = await query(
    `SELECT booking_time::text FROM bookings
     WHERE master_id = $1 AND booking_date = $2 AND status = 'confirmed'`,
    [masterId, dateStr]
  );

  const { rows: blocked } = await query(
    `SELECT blocked_time::text FROM blocked_slots
     WHERE master_id = $1 AND blocked_date = $2 AND blocked_time IS NOT NULL`,
    [masterId, dateStr]
  );

  const { rows: blockedDay } = await query(
    `SELECT 1 FROM blocked_slots WHERE master_id = $1 AND blocked_date = $2 AND blocked_time IS NULL`,
    [masterId, dateStr]
  );
  if (blockedDay.length) return baseTimes.map(t => ({ time: t, available: false }));

  const bookedSet = new Set(booked.map(r => r.booking_time.slice(0, 5)));
  const blockedSet = new Set(blocked.map(r => r.blocked_time.slice(0, 5)));

  return baseTimes.map(time => ({
    time,
    available: !bookedSet.has(time) && !blockedSet.has(time),
  }));
}

module.exports = { computeAvailableSlots };
