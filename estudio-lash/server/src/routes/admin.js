import { Router } from 'express';
import { pool, q } from '../db.js';
import { requireAuth } from '../auth.js';
import { book, localDate, toInstant } from '../slots.js';

const r = Router();
r.use(requireAuth);

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const STATUSES = ['agendado', 'concluido', 'cancelado', 'faltou'];
const bad = (res, msg = 'Dados inválidos') => res.status(400).json({ error: msg });

/* ---------- Agenda ---------- */
r.get('/appointments', async (req, res) => {
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

// agendamento manual pela profissional (ignora a grade de horários, respeita conflitos)
r.post('/appointments', async (req, res) => {
  const [code, body] = await book(req.body, { force: true });
  res.status(code).json(body);
});

// muda status; ao concluir, lança a receita automaticamente (e remove ao reverter)
r.patch('/appointments/:id', async (req, res) => {
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

/* ---------- Serviços ---------- */
const serviceValues = (b) => {
  const name = b?.name?.trim();
  const dur = parseInt(b?.duration_min, 10);
  const price = Math.round(Number(b?.price) * 100);
  if (!name || !(dur > 0) || !(price >= 0)) return null;
  return [name, b.description?.trim() || '', dur, price, b.active !== false];
};

r.get('/services', async (_req, res) => {
  res.json((await q('SELECT * FROM services ORDER BY active DESC, id')).rows);
});

r.post('/services', async (req, res) => {
  const v = serviceValues(req.body);
  if (!v) return bad(res);
  const { rows: [s] } = await q(
    `INSERT INTO services (name, description, duration_min, price_cents, active)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`, v);
  res.status(201).json(s);
});

r.put('/services/:id', async (req, res) => {
  const v = serviceValues(req.body);
  if (!v) return bad(res);
  const { rows: [s] } = await q(
    `UPDATE services SET name=$1, description=$2, duration_min=$3, price_cents=$4, active=$5
     WHERE id=$6 RETURNING *`, [...v, Number(req.params.id) || 0]);
  if (!s) return res.status(404).json({ error: 'Serviço não encontrado' });
  res.json(s);
});

/* ---------- Horário de funcionamento ---------- */
r.get('/hours', async (_req, res) => {
  const { rows } = await q(
    `SELECT weekday, is_open, to_char(open_time,'HH24:MI') AS open_time,
            to_char(close_time,'HH24:MI') AS close_time
     FROM business_hours ORDER BY weekday`);
  res.json(rows);
});

r.put('/hours', async (req, res) => {
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

/* ---------- Financeiro ---------- */
r.get('/transactions', async (req, res) => {
  if (!MONTH.test(req.query.month || '')) return bad(res);
  const { rows } = await q(
    `SELECT id, type, description, category, amount_cents, occurred_on::text AS occurred_on, appointment_id
     FROM transactions WHERE to_char(occurred_on,'YYYY-MM') = $1
     ORDER BY occurred_on DESC, id DESC`, [req.query.month]);
  res.json(rows);
});

r.post('/transactions', async (req, res) => {
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

r.delete('/transactions/:id', async (req, res) => {
  await q('DELETE FROM transactions WHERE id = $1', [Number(req.params.id) || 0]);
  res.json({ ok: true });
});

r.get('/summary', async (req, res) => {
  if (!MONTH.test(req.query.month || '')) return bad(res);
  const { rows } = await q(
    `SELECT type, category, SUM(amount_cents)::int AS total
     FROM transactions WHERE to_char(occurred_on,'YYYY-MM') = $1
     GROUP BY type, category ORDER BY total DESC`, [req.query.month]);
  const sum = (t) => rows.filter((x) => x.type === t).reduce((s, x) => s + x.total, 0);
  res.json({ receita: sum('receita'), despesa: sum('despesa'), saldo: sum('receita') - sum('despesa'), categorias: rows });
});

export default r;
