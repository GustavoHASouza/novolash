import jwt from 'jsonwebtoken';
import { timingSafeEqual } from 'node:crypto';

const same = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

export function login(req, res) {
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

export function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  try {
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Não autorizado' });
  }
}
