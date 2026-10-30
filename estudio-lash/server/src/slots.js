import { q } from './db.js';

const OFFSET = process.env.STUDIO_UTC_OFFSET || '-03:00'; // Brasília
const STEP_MIN = 30;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const offMs = (() => {
  const m = OFFSET.match(/^([+-])(\d{2}):(\d{2})$/);
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60000;
})();

export const toInstant = (date, time) => new Date(`${date}T${time}:00${OFFSET}`);
export const localDate = (d) => new Date(d.getTime() + offMs).toISOString().slice(0, 10);

const toMin = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const fmt = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Horários livres (HH:MM) para uma data e duração de serviço. */
export async function slotsFor(date, durationMin) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const { rows: [h] } = await q(
    'SELECT is_open, open_time, close_time FROM business_hours WHERE weekday = $1', [weekday]);
  if (!h?.is_open) return [];

  const dayStart = toInstant(date, '00:00');
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const { rows: busy } = await q(
    `SELECT starts_at, ends_at FROM appointments
     WHERE status = 'agendado' AND starts_at < $2 AND ends_at > $1`, [dayStart, dayEnd]);

  const now = new Date();
  const out = [];
  for (let m = toMin(h.open_time); m + durationMin <= toMin(h.close_time); m += STEP_MIN) {
    const s = toInstant(date, fmt(m));
    const e = new Date(s.getTime() + durationMin * 60000);
    if (s <= now) continue;
    if (busy.some((b) => s < b.ends_at && e > b.starts_at)) continue;
    out.push(fmt(m));
  }
  return out;
}

/** Cria agendamento. Retorna [statusHttp, corpo]. force=true ignora grade de horários (uso da profissional). */
export async function book(b, { force = false } = {}) {
  const { date, time, name, phone, email, notes } = b || {};
  const serviceId = Number(b?.serviceId) || 0;
  if (!name?.trim() || !phone?.trim() || !DATE.test(date || '') || !TIME.test(time || '')) {
    return [400, { error: 'Preencha nome, telefone, data e horário' }];
  }
  const { rows: [svc] } = await q('SELECT duration_min FROM services WHERE id = $1 AND active', [serviceId]);
  if (!svc) return [404, { error: 'Serviço não encontrado' }];

  const start = toInstant(date, time);
  if (isNaN(start)) return [400, { error: 'Data inválida' }];
  if (!force && !(await slotsFor(date, svc.duration_min)).includes(time)) {
    return [409, { error: 'Este horário não está mais disponível' }];
  }
  const end = new Date(start.getTime() + svc.duration_min * 60000);
  try {
    const { rows: [a] } = await q(
      `INSERT INTO appointments (service_id, client_name, client_phone, client_email, notes, starts_at, ends_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, starts_at, ends_at`,
      [serviceId, name.trim(), phone.trim(), email?.trim() || null, notes?.trim() || null, start, end]);
    return [201, a];
  } catch (e) {
    if (e.code === '23P01') return [409, { error: 'Este horário não está mais disponível' }];
    throw e;
  }
}
