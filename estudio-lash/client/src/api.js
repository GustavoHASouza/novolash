import { createContext, useContext } from 'react';

const BASE = import.meta.env.VITE_API_URL || 'https://viyxasteqzqhcfxfzywx.supabase.co/functions/v1';
export const TZ = 'America/Sao_Paulo';
export const STUDIO = import.meta.env.VITE_STUDIO_NAME || 'Novolash Studio';

export const StudioContext = createContext({
  studioName: STUDIO,
  avatarUrl: '',
  primaryColor: '#b76e79',
  secondaryColor: '#261e1e',
  setStudioSettings: () => {},
});

export const useStudio = () => useContext(StudioContext);

/* ---------- Identidade visual (cores primária e secundária) ---------- */
export const DEFAULT_PRIMARY = '#b76e79';
export const DEFAULT_SECONDARY = '#261e1e';
const HEX = /^#[0-9a-fA-F]{6}$/;

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbToHex = (rgb) =>
  '#' + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
const mix = (hex, target, amount) => {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  return rgbToHex(a.map((v, i) => v + (b[i] - v) * amount));
};
const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export function applyTheme(primary, secondary) {
  const p = HEX.test(primary || '') ? primary : DEFAULT_PRIMARY;
  const s = HEX.test(secondary || '') ? secondary : DEFAULT_SECONDARY;
  const [r, g, b] = hexToRgb(p);
  const root = document.documentElement;
  root.style.setProperty('--brand', p);
  root.style.setProperty('--brand-d', mix(p, '#000000', 0.18));
  root.style.setProperty('--brand-light', mix(p, '#ffffff', 0.86));
  root.style.setProperty('--brand-soft', mix(p, '#ffffff', 0.78));
  root.style.setProperty('--brand-glow', `rgba(${r}, ${g}, ${b}, 0.16)`);
  root.style.setProperty('--shadow-brand', `0 6px 22px rgba(${r}, ${g}, ${b}, 0.25)`);
  root.style.setProperty('--secondary', s);
  root.style.setProperty('--secondary-accent', mix(p, '#ffffff', 0.7));
  root.dataset.secondaryTone = luminance(s) > 0.45 ? 'light' : 'dark';
}

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
  settings: () => req('/settings'),
  services: () => req('/services'),
  slots: (date, serviceId) => req(`/availability?date=${date}&serviceId=${serviceId}`),
  book: (body) => req('/appointments', { method: 'POST', body }),
  login: (body) => req('/auth/login', { method: 'POST', body }),
  admin: (path, opts = {}) => req(`/admin${path}`, { ...opts, auth: true }),
};
