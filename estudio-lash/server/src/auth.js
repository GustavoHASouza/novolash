import jwt from 'jsonwebtoken';
import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import { q } from './db.js';

const same = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, Buffer.from(salt, 'hex'), 100000, 32, 'sha256').toString('hex');
  return `pbkdf2:${salt}:${hash}`;
}

export function verifyPasswordHash(password, stored) {
  if (!stored || !stored.startsWith('pbkdf2:')) return false;
  const [, saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const computed = pbkdf2Sync(password, Buffer.from(saltHex, 'hex'), 100000, 32, 'sha256').toString('hex');
  return same(computed, hashHex);
}

export async function checkAdminPassword(password) {
  const { ADMIN_PASSWORD = '' } = process.env;
  const { rows: [st] } = await q('SELECT password_hash FROM studio_settings WHERE id = 1');
  if (st?.password_hash) {
    return verifyPasswordHash(String(password), st.password_hash);
  }
  return same(String(password), ADMIN_PASSWORD);
}

export async function login(req, res) {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, JWT_SECRET } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !JWT_SECRET) {
    return res.status(500).json({ error: 'Servidor sem credenciais configuradas' });
  }
  const { email = '', password = '' } = req.body || {};
  const okEmail = same(email, ADMIN_EMAIL);
  const okPass = await checkAdminPassword(password);
  if (!okEmail || !okPass) return res.status(401).json({ error: 'E-mail ou senha inválidos' });
  res.json({ token: jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '12h' }) });
}

export function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  try {
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Não autorizado' });
  }
}
