const BASE = import.meta.env.VITE_API_URL ?? (window.location.hostname === 'localhost' ? 'http://localhost:3001' : '');
export const TZ = 'America/Sao_Paulo';
export const STUDIO = import.meta.env.VITE_STUDIO_NAME || 'Novolash Studio';

export const money = (cents) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function req(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('token');
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && auth) {
    localStorage.removeItem('token');
    window.location.href = '/admin';
  }
  if (!res.ok) throw new Error(data.error || 'Erro na requisição');
  return data;
}

export const api = {
  services: () => req('/services'),
  slots: (date, serviceId) => req(`/availability?date=${date}&serviceId=${serviceId}`),
  book: (body) => req('/appointments', { method: 'POST', body }),
  login: (body) => req('/auth/login', { method: 'POST', body }),
  admin: (path, opts = {}) => req(`/admin${path}`, { ...opts, auth: true }),
};
