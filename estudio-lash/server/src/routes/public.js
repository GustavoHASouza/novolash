import { Router } from 'express';
import { q } from '../db.js';
import { login } from '../auth.js';
import { book, slotsFor } from '../slots.js';

const r = Router();

r.post('/auth/login', login);

r.get('/services', async (_req, res) => {
  const { rows } = await q(
    'SELECT id, name, description, duration_min, price_cents, image_url FROM services WHERE active ORDER BY price_cents DESC');
  res.json(rows);
});

r.get('/availability', async (req, res) => {
  const { date, serviceId } = req.query;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return res.status(400).json({ error: 'Data inválida' });
  const { rows: [svc] } = await q(
    'SELECT duration_min FROM services WHERE id = $1 AND active', [Number(serviceId) || 0]);
  if (!svc) return res.status(404).json({ error: 'Serviço não encontrado' });
  res.json({ slots: await slotsFor(date, svc.duration_min) });
});

r.post('/appointments', async (req, res) => {
  const [code, body] = await book(req.body);
  res.status(code).json(body);
});

export default r;
