import { Router } from 'express';
import { pool, q } from '../db.js';
import { checkAdminPassword, hashPassword, requireAuth } from '../auth.js';
import { book, getSlotIntervalMin, localDate, toInstant } from '../slots.js';

const r = Router();
r.use(requireAuth);

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const STATUSES = ['agendado', 'concluido', 'cancelado', 'faltou'];
const bad = (res, msg = 'Dados inválidos') => res.status(400).json({ error: msg });

/* ---------- Configurações da Conta & Estúdio ---------- */
r.get('/settings', async (_req, res) => {
  const { rows: [st] } = await q('SELECT studio_name, avatar_url FROM studio_settings WHERE id = 1');
  res.json(st || { studio_name: 'Novolash Studio', avatar_url: '' });
});

r.put('/settings', async (req, res) => {
  const studioName = req.body?.studio_name?.trim();
  const avatarUrl = typeof req.body?.avatar_url === 'string' ? req.body.avatar_url.trim() : undefined;
  if (!studioName) return bad(res, 'Informe o nome do estúdio');
  const { rows: [st] } = await q(
    `INSERT INTO studio_settings (id, studio_name, avatar_url, updated_at)
     VALUES (1, $1, COALESCE($2, ''), now())
     ON CONFLICT (id) DO UPDATE
       SET studio_name = EXCLUDED.studio_name,
           avatar_url = CASE WHEN $2 IS NULL THEN studio_settings.avatar_url ELSE $2 END,
           updated_at = now()
     RETURNING studio_name, avatar_url`,
    [studioName, avatarUrl ?? null]
  );
  res.json(st);
});

r.put('/password', async (req, res) => {
  const currentPassword = String(req.body?.current_password || '');
  const newPassword = String(req.body?.new_password || '');
  if (!currentPassword || newPassword.length < 6) {
    return bad(res, 'A nova senha deve ter pelo menos 6 caracteres');
  }
  const validCurrent = await checkAdminPassword(currentPassword);
  if (!validCurrent) return res.status(401).json({ error: 'Senha atual incorreta' });
  const hashed = hashPassword(newPassword);
  await q(
    `INSERT INTO studio_settings (id, studio_name, avatar_url, password_hash, updated_at)
     VALUES (1, 'Novolash Studio', '', $1, now())
     ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = now()`,
    [hashed]
  );
  res.json({ ok: true });
});

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

r.post('/appointments', async (req, res) => {
  const [code, body] = await book(req.body, { force: true });
  res.status(code).json(body);
});

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
  return [name, b.description?.trim() || '', dur, price, b.active !== false, b.image_url?.trim() || ''];
};

r.get('/services', async (_req, res) => {
  res.json((await q('SELECT * FROM services ORDER BY active DESC, id')).rows);
});

r.post('/services', async (req, res) => {
  const v = serviceValues(req.body);
  if (!v) return bad(res);
  const { rows: [s] } = await q(
    `INSERT INTO services (name, description, duration_min, price_cents, active, image_url)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, v);
  res.status(201).json(s);
});

r.put('/services/:id', async (req, res) => {
  const v = serviceValues(req.body);
  if (!v) return bad(res);
  const { rows: [s] } = await q(
    `UPDATE services SET name=$1, description=$2, duration_min=$3, price_cents=$4, active=$5, image_url=$6
     WHERE id=$7 RETURNING *`, [...v, Number(req.params.id) || 0]);
  if (!s) return res.status(404).json({ error: 'Serviço não encontrado' });
  res.json(s);
});

/* ---------- Horário de funcionamento ---------- */
r.get('/hours', async (_req, res) => {
  const [hoursRes, intervalMin] = await Promise.all([
    q(
      `SELECT weekday, is_open, to_char(open_time,'HH24:MI') AS open_time,
              to_char(close_time,'HH24:MI') AS close_time,
              has_break,
              to_char(break_start,'HH24:MI') AS break_start,
              to_char(break_end,'HH24:MI') AS break_end
       FROM business_hours ORDER BY weekday`
    ),
    getSlotIntervalMin(),
  ]);
  res.json(hoursRes.rows.map((row) => ({ ...row, slot_interval_min: intervalMin })));
});

r.put('/hours', async (req, res) => {
  const body = req.body;
  const list = Array.isArray(body) ? body : body?.hours;
  const rawInterval = Number(
    (Array.isArray(body) ? body[0]?.slot_interval_min : body?.slot_interval_min) ?? 30
  );
  const intervalMin = rawInterval >= 15 && rawInterval <= 240 ? Math.round(rawInterval) : 30;

  const valid =
    Array.isArray(list) &&
    list.length === 7 &&
    list.every((h) => {
      const basicOk =
        Number.isInteger(h.weekday) &&
        TIME.test(h.open_time || '') &&
        TIME.test(h.close_time || '') &&
        h.close_time > h.open_time;
      if (!basicOk) return false;
      if (h.has_break) {
        return (
          TIME.test(h.break_start || '') &&
          TIME.test(h.break_end || '') &&
          h.break_end > h.break_start
        );
      }
      return true;
    });
  if (!valid) return bad(res, 'Verifique os horários de abertura, fechamento e intervalo de almoço');

  await q('UPDATE studio_settings SET slot_interval_min = $1, updated_at = now() WHERE id = 1', [intervalMin]);

  for (const h of list) {
    const bStart = TIME.test(h.break_start || '') ? h.break_start : '12:00';
    const bEnd = TIME.test(h.break_end || '') ? h.break_end : '13:00';
    await q(
      `UPDATE business_hours
       SET is_open=$2, open_time=$3, close_time=$4, has_break=$5, break_start=$6, break_end=$7
       WHERE weekday=$1`,
      [h.weekday, !!h.is_open, h.open_time, h.close_time, !!h.has_break, bStart, bEnd]
    );
  }
  res.json({ ok: true, slot_interval_min: intervalMin });
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

/* ---------- Estoque (Inventory) ---------- */
r.get('/inventory', async (_req, res) => {
  const { rows } = await q(
    `SELECT id, name, description, quantity, unit, last_cost_cents, updated_at
     FROM inventory_items
     ORDER BY name ASC, id ASC`
  );
  res.json(rows);
});

r.post('/inventory', async (req, res) => {
  const name = req.body?.name?.trim();
  const description = req.body?.description?.trim() || '';
  const quantity = Math.max(0, parseInt(req.body?.quantity ?? 0, 10) || 0);
  const unit = req.body?.unit?.trim() || 'un';
  const costCents = Math.max(0, Math.round(Number(req.body?.cost || 0) * 100));
  const occurredOn = DATE.test(req.body?.occurred_on || '') ? req.body.occurred_on : localDate(new Date());

  if (!name) return bad(res, 'Informe o nome do material');

  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const { rows: [item] } = await c.query(
      `INSERT INTO inventory_items (name, description, quantity, unit, last_cost_cents, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       RETURNING id, name, description, quantity, unit, last_cost_cents, updated_at`,
      [name, description, quantity, unit, costCents]
    );
    let txId = null;
    if (costCents > 0) {
      const txDesc = `Estoque: ${name}${quantity > 0 ? ` (${quantity} ${unit})` : ''}`;
      const { rows: [tx] } = await c.query(
        `INSERT INTO transactions (type, description, category, amount_cents, occurred_on)
         VALUES ('despesa', $1, 'Material', $2, $3::date)
         RETURNING id`,
        [txDesc, costCents, occurredOn]
      );
      txId = tx?.id ?? null;
    }
    if (quantity > 0 || costCents > 0) {
      await c.query(
        `INSERT INTO inventory_movements (item_id, delta, cost_cents, notes, transaction_id, occurred_on)
         VALUES ($1, $2, $3, 'Cadastro inicial de estoque', $4, $5::date)`,
        [item.id, quantity, costCents, txId, occurredOn]
      );
    }
    await c.query('COMMIT');
    res.status(201).json({ ...item, transaction_id: txId });
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
});

r.put('/inventory/:id', async (req, res) => {
  const itemId = Number(req.params.id) || 0;
  const name = req.body?.name?.trim();
  const description = req.body?.description?.trim() || '';
  const quantity = Math.max(0, parseInt(req.body?.quantity ?? 0, 10) || 0);
  const unit = req.body?.unit?.trim() || 'un';
  if (!name) return bad(res, 'Informe o nome do material');

  const { rows: [item] } = await q(
    `UPDATE inventory_items
     SET name = $1, description = $2, quantity = $3, unit = $4, updated_at = now()
     WHERE id = $5
     RETURNING id, name, description, quantity, unit, last_cost_cents, updated_at`,
    [name, description, quantity, unit, itemId]
  );
  if (!item) return res.status(404).json({ error: 'Item não encontrado' });
  res.json(item);
});

r.delete('/inventory/:id', async (req, res) => {
  await q('DELETE FROM inventory_items WHERE id = $1', [Number(req.params.id) || 0]);
  res.json({ ok: true });
});

r.post('/inventory/:id/movements', async (req, res) => {
  const itemId = Number(req.params.id) || 0;
  const delta = parseInt(req.body?.delta ?? 0, 10) || 0;
  const costCents = Math.max(0, Math.round(Number(req.body?.cost || 0) * 100));
  const notes = req.body?.notes?.trim() || '';
  const occurredOn = DATE.test(req.body?.occurred_on || '') ? req.body.occurred_on : localDate(new Date());

  if (delta === 0 && costCents === 0) {
    return bad(res, 'Informe a quantidade ou valor a movimentar');
  }

  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const { rows: [existing] } = await c.query(
      'SELECT id, name, quantity, unit, last_cost_cents FROM inventory_items WHERE id = $1 FOR UPDATE',
      [itemId]
    );
    if (!existing) {
      await c.query('ROLLBACK');
      return res.status(404).json({ error: 'Item não encontrado' });
    }
    const newQty = Math.max(0, existing.quantity + delta);
    const newLastCost = costCents > 0 ? costCents : existing.last_cost_cents;

    const { rows: [updated] } = await c.query(
      `UPDATE inventory_items
       SET quantity = $1, last_cost_cents = $2, updated_at = now()
       WHERE id = $3
       RETURNING id, name, description, quantity, unit, last_cost_cents, updated_at`,
      [newQty, newLastCost, itemId]
    );

    let txId = null;
    if (costCents > 0) {
      const qtyLabel = delta > 0 ? ` (+${delta} ${existing.unit})` : '';
      const txDesc = notes
        ? `Estoque: ${existing.name}${qtyLabel} — ${notes}`
        : `Compra de estoque: ${existing.name}${qtyLabel}`;
      const { rows: [tx] } = await c.query(
        `INSERT INTO transactions (type, description, category, amount_cents, occurred_on)
         VALUES ('despesa', $1, 'Material', $2, $3::date)
         RETURNING id`,
        [txDesc, costCents, occurredOn]
      );
      txId = tx?.id ?? null;
    }

    await c.query(
      `INSERT INTO inventory_movements (item_id, delta, cost_cents, notes, transaction_id, occurred_on)
       VALUES ($1, $2, $3, $4, $5, $6::date)`,
      [itemId, delta, costCents, notes || (delta > 0 ? 'Entrada de estoque' : 'Baixa de estoque'), txId, occurredOn]
    );

    await c.query('COMMIT');
    res.json({ item: updated, transaction_id: txId });
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
});

r.get('/inventory/:id/movements', async (req, res) => {
  const itemId = Number(req.params.id) || 0;
  const { rows } = await q(
    `SELECT id, item_id, delta, cost_cents, notes, transaction_id, occurred_on::text AS occurred_on, created_at
     FROM inventory_movements
     WHERE item_id = $1
     ORDER BY created_at DESC
     LIMIT 30`,
    [itemId]
  );
  res.json(rows);
});

export default r;
