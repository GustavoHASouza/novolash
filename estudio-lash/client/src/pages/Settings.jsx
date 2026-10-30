import { useEffect, useState } from 'react';
import { api } from '../api.js';

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const NEW = { id: null, name: '', description: '', duration_min: 60, price_cents: 0, active: true };

function ServiceRow({ s, onSave }) {
  const [v, setV] = useState({ ...s, price: (s.price_cents / 100).toFixed(2) });
  const set = (k) => (e) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  return (
    <div className="settings-service">
      <div className="grid">
        <label>Nome<input value={v.name} onChange={set('name')} placeholder="Nome do serviço" /></label>
        <label>Descrição<input value={v.description} onChange={set('description')} placeholder="Descrição breve" /></label>
        <label>Duração (min)<input type="number" min="15" step="15" value={v.duration_min} onChange={set('duration_min')} /></label>
        <label>Preço (R$)<input type="number" min="0" step="0.01" value={v.price} onChange={set('price')} /></label>
      </div>
      <div className="row between" style={{ marginTop: 12 }}>
        <label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, textTransform: 'none', letterSpacing: 0 }}>
          <input type="checkbox" checked={v.active} onChange={set('active')} />
          Ativo (visível para clientes)
        </label>
        <button className="sm" onClick={() => onSave(v)}>{s.id ? '💾 Salvar' : '➕ Adicionar serviço'}</button>
      </div>
    </div>
  );
}

export default function Settings() {
  const [services, setServices] = useState([]);
  const [hours, setHours] = useState([]);
  const [msg, setMsg] = useState(null);
  const [n, setN] = useState(0);

  const load = () => {
    api.admin('/services').then(setServices);
    api.admin('/hours').then(setHours);
  };
  useEffect(load, []);

  const run = async (fn, ok) => {
    try { await fn(); setMsg({ ok }); load(); } catch (e) { setMsg({ err: e.message }); }
  };

  const saveService = (v) =>
    run(async () => {
      const opts = { method: v.id ? 'PUT' : 'POST', body: v };
      await api.admin(v.id ? `/services/${v.id}` : '/services', opts);
      if (!v.id) setN(n + 1);
    }, 'Serviço salvo');

  const setH = (i, k, val) => setHours(hours.map((h, j) => (j === i ? { ...h, [k]: val } : h)));

  return (
    <>
      {msg?.ok && <div className="msg ok">{msg.ok}</div>}
      {msg?.err && <div className="msg err">{msg.err}</div>}

      <div className="card">
        <h2>💅 Serviços</h2>
        {services.map((s) => <ServiceRow key={s.id + '-' + s.name + s.price_cents + s.active} s={s} onSave={saveService} />)}
        <h3 style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line-light)' }}>➕ Novo Serviço</h3>
        <ServiceRow key={`new-${n}`} s={NEW} onSave={saveService} />
      </div>

      <div className="card">
        <h2>🕐 Horário de Funcionamento</h2>
        {hours.map((h, i) => (
          <div className="hours-row" key={h.weekday}>
            <label style={{ minWidth: 120, margin: 0, textTransform: 'none', letterSpacing: 0, fontSize: '0.9rem' }}>
              <input type="checkbox" checked={h.is_open} onChange={(e) => setH(i, 'is_open', e.target.checked)} />
              {DIAS[h.weekday]}
            </label>
            <input type="time" style={{ width: 130 }} disabled={!h.is_open} value={h.open_time} onChange={(e) => setH(i, 'open_time', e.target.value)} />
            <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>até</span>
            <input type="time" style={{ width: 130 }} disabled={!h.is_open} value={h.close_time} onChange={(e) => setH(i, 'close_time', e.target.value)} />
          </div>
        ))}
        <button style={{ marginTop: 16 }} onClick={() => run(() => api.admin('/hours', { method: 'PUT', body: hours }), 'Horários salvos')}>
          💾 Salvar Horários
        </button>
      </div>
    </>
  );
}
