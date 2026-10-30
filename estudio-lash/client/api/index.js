import express from 'express';
import cors from 'cors';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { timingSafeEqual } from 'node:crypto';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});
const q = (text, params) => pool.query(text, params);

const OFFSET = process.env.STUDIO_UTC_OFFSET || '-03:00';
const STEP_MIN = 30;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const STATUSES = ['agendado', 'concluido', 'cancelado', 'faltou'];

const offMs = (() => {
  const m = OFFSET.match(/^([+-])(\d{2}):(\d{2})$/);
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60000;
})();

const toInstant = (date, time) => new Date(`${date}T${time}:00${OFFSET}`);
const localDate = (d) => new Date(d.getTime() + offMs).toISOString().slice(0, 10);
const toMin = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const fmt = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

async function slotsFor(date, durationMin) {
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

async function book(b, { force = false } = {}) {
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

const same = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

function login(req, res) {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, JWT_SECRET } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !JWT_SECRET) {
    return res.status(500).json({ error: 'Servidor sem credenciais configuradas' });
  }
  const { email = '', password = '' } = req.body || {};
  const okEmail = same(email, ADMIN_EMAIL);
  const okPass = same(password, ADMIN_PASSWORD);
  if (!okEmail || !okPass) return res.status(401).json({ error: 'E-mail ou senha inválidos' });
  res.json({ token: jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '12h' }) });
}

function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  try {
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Não autorizado' });
  }
}

const app = express();
app.use(cors());
app.use(express.json());

const bad = (res, msg = 'Dados inválidos') => res.status(400).json({ error: msg });

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.post('/api/auth/login', login);

app.get('/api/services', async (_req, res) => {
  const { rows } = await q(
    'SELECT id, name, description, duration_min, price_cents FROM services WHERE active ORDER BY price_cents DESC');
  res.json(rows);
});

app.get('/api/availability', async (req, res) => {
  const { date, serviceId } = req.query;
  if (!DATE.test(date || '')) return res.status(400).json({ error: 'Data inválida' });
  const { rows: [svc] } = await q(
    'SELECT duration_min FROM services WHERE id = $1 AND active', [Number(serviceId) || 0]);
  if (!svc) return res.status(404).json({ error: 'Serviço não encontrado' });
  res.json({ slots: await slotsFor(date, svc.duration_min) });
});

app.post('/api/appointments', async (req, res) => {
  const [code, body] = await book(req.body);
  res.status(code).json(body);
});

/* ---------- Admin Routes ---------- */
const admin = express.Router();
admin.use(requireAuth);

admin.get('/appointments', async (req, res) => {
  const { from, to } = req.query;
  if (!DATE.test(from || '') || !DATE.test(to || '')) return bad(res);
  const start = toInstant(from, '00:00');
  const end = new Date(toInstant(to, '00:00').getTime() + 86400000);
  const { rows } = await q(
    `SELECT a.id, a.client_name, a.client_phone, a.client_email, a.notes, a.status,
            a.starts_at, a.ends_at, s.name AS service, s.price_cents
     FROM appointments a JOIN services s ON s.id = a.service_id
     WHERE a.starts_at >= $1 AND a.starts_at < $2
     ORDER BY a.starts_at`, [start, end]);
  res.json(rows);
});

admin.post('/appointments', async (req, res) => {
  const [code, body] = await book(req.body, { force: true });
  res.status(code).json(body);
});

admin.patch('/appointments/:id', async (req, res) => {
  const { status } = req.body || {};
  if (!STATUSES.includes(status)) return bad(res);
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const { rows: [a] } = await c.query(
      `UPDATE appointments SET status = $1 WHERE id = $2
       RETURNING id, client_name, service_id, starts_at`, [status, Number(req.params.id) || 0]);
    if (!a) {
      await c.query('ROLLBACK');
      return res.status(404).json({ error: 'Agendamento não encontrado' });
    }
    await c.query('DELETE FROM transactions WHERE appointment_id = $1', [a.id]);
    if (status === 'concluido') {
      await c.query(
        `INSERT INTO transactions (type, description, category, amount_cents, occurred_on, appointment_id)
         SELECT 'receita', $2::text || ' — ' || s.name, 'Atendimentos', s.price_cents, $3::date, $1
         FROM services s WHERE s.id = $4 AND s.price_cents > 0`,
        [a.id, a.client_name, localDate(a.starts_at), a.service_id]);
    }
    await c.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await c.query('ROLLBACK');
    if (e.code === '23P01') return res.status(409).json({ error: 'Conflita com outro horário agendado' });
    throw e;
  } finally {
    c.release();
  }
});

const serviceValues = (b) => {
  const name = b?.name?.trim();
  const dur = parseInt(b?.duration_min, 10);
  const price = Math.round(Number(b?.price) * 100);
  if (!name || !(dur > 0) || !(price >= 0)) return null;
  return [name, b.description?.trim() || '', dur, price, b.active !== false];
};

admin.get('/services', async (_req, res) => {
  res.json((await q('SELECT * FROM services ORDER BY active DESC, id')).rows);
});

admin.post('/services', async (req, res) => {
  const v = serviceValues(req.body);
  if (!v) return bad(res);
  const { rows: [s] } = await q(
    `INSERT INTO services (name, description, duration_min, price_cents, active)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`, v);
  res.status(201).json(s);
});

admin.put('/services/:id', async (req, res) => {
  const v = serviceValues(req.body);
  if (!v) return bad(res);
  const { rows: [s] } = await q(
    `UPDATE services SET name=$1, description=$2, duration_min=$3, price_cents=$4, active=$5
     WHERE id=$6 RETURNING *`, [...v, Number(req.params.id) || 0]);
  if (!s) return res.status(404).json({ error: 'Serviço não encontrado' });
  res.json(s);
});

admin.get('/hours', async (_req, res) => {
  const { rows } = await q(
    `SELECT weekday, is_open, to_char(open_time,'HH24:MI') AS open_time,
            to_char(close_time,'HH24:MI') AS close_time
     FROM business_hours ORDER BY weekday`);
  res.json(rows);
});

admin.put('/hours', async (req, res) => {
  const list = req.body;
  const valid = Array.isArray(list) && list.length === 7 && list.every((h) =>
    Number.isInteger(h.weekday) && TIME.test(h.open_time) && TIME.test(h.close_time) && h.close_time > h.open_time);
  if (!valid) return bad(res, 'Horários inválidos');
  for (const h of list) {
    await q('UPDATE business_hours SET is_open=$2, open_time=$3, close_time=$4 WHERE weekday=$1',
      [h.weekday, !!h.is_open, h.open_time, h.close_time]);
  }
  res.json({ ok: true });
});

admin.get('/transactions', async (req, res) => {
  if (!MONTH.test(req.query.month || '')) return bad(res);
  const { rows } = await q(
    `SELECT id, type, description, category, amount_cents, occurred_on::text AS occurred_on, appointment_id
     FROM transactions WHERE to_char(occurred_on,'YYYY-MM') = $1
     ORDER BY occurred_on DESC, id DESC`, [req.query.month]);
  res.json(rows);
});

admin.post('/transactions', async (req, res) => {
  const { type, description, category, amount, occurred_on } = req.body || {};
  const cents = Math.round(Number(amount) * 100);
  if (!['receita', 'despesa'].includes(type) || !description?.trim() || !(cents > 0) || !DATE.test(occurred_on || '')) {
    return bad(res);
  }
  const { rows: [t] } = await q(
    `INSERT INTO transactions (type, description, category, amount_cents, occurred_on)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [type, description.trim(), category?.trim() || 'Outros', cents, occurred_on]);
  res.status(201).json(t);
});

admin.delete('/transactions/:id', async (req, res) => {
  await q('DELETE FROM transactions WHERE id = $1', [Number(req.params.id) || 0]);
  res.json({ ok: true });
});

admin.get('/summary', async (req, res) => {
  if (!MONTH.test(req.query.month || '')) return bad(res);
  const { rows } = await q(
    `SELECT type, category, SUM(amount_cents)::int AS total
     FROM transactions WHERE to_char(occurred_on,'YYYY-MM') = $1
     GROUP BY type, category ORDER BY total DESC`, [req.query.month]);
  const sum = (t) => rows.filter((x) => x.type === t).reduce((s, x) => s + x.total, 0);
  res.json({ receita: sum('receita'), despesa: sum('despesa'), saldo: sum('receita') - sum('despesa'), categorias: rows });
});

app.use('/api/admin', admin);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

export default app;
