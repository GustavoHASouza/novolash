import { useCallback, useEffect, useState } from 'react';
import { api, money, TZ } from '../api.js';

const today = () => new Date().toLocaleDateString('en-CA');
const addDays = (d, n) => {
  const x = new Date(`${d}T12:00:00`);
  x.setDate(x.getDate() + n);
  return x.toLocaleDateString('en-CA');
};
const hhmm = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const dayKey = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });
const dayLabel = (d) =>
  new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
const STATUS = { agendado: 'Agendado', concluido: 'Concluído', cancelado: 'Cancelado', faltou: 'Faltou' };
const wa = (phone) => {
  const d = phone.replace(/\D/g, '');
  return `https://wa.me/${d.length <= 11 ? '55' + d : d}`;
};

export default function Agenda() {
  const [start, setStart] = useState(today());
  const [items, setItems] = useState([]);
  const [err, setErr] = useState('');
  const [services, setServices] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ serviceId: '', date: today(), time: '09:00', name: '', phone: '' });

  const load = useCallback(async () => {
    try {
      setItems(await api.admin(`/appointments?from=${start}&to=${addDays(start, 6)}`));
    } catch (e) { setErr(e.message); }
  }, [start]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.admin('/services').then((s) => setServices(s.filter((x) => x.active))); }, []);

  async function setStatus(id, status) {
    setErr('');
    try {
      await api.admin(`/appointments/${id}`, { method: 'PATCH', body: { status } });
      load();
    } catch (e) { setErr(e.message); }
  }

  async function create(e) {
    e.preventDefault();
    setErr('');
    try {
      await api.admin('/appointments', { method: 'POST', body: f });
      setOpen(false);
      setF({ ...f, name: '', phone: '' });
      load();
    } catch (e2) { setErr(e2.message); }
  }

  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  return (
    <>
      {err && <div className="msg err">{err}</div>}
      <div className="row between" style={{ marginBottom: 12 }}>
        <div className="row">
          <button className="ghost sm" onClick={() => setStart(addDays(start, -7))}>← Semana</button>
          <button className="ghost sm" onClick={() => setStart(today())}>Hoje</button>
          <button className="ghost sm" onClick={() => setStart(addDays(start, 7))}>Semana →</button>
        </div>
        <button className="sm" onClick={() => setOpen(!open)}>+ Novo agendamento</button>
      </div>

      {open && (
        <form className="card" onSubmit={create}>
          <div className="grid">
            <label>Serviço
              <select required value={f.serviceId} onChange={(e) => setF({ ...f, serviceId: e.target.value })}>
                <option value="">Selecione</option>
                {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label>Data<input type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
            <label>Hora<input type="time" required value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></label>
            <label>Cliente<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
            <label>Telefone<input required value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
          </div>
          <button>Salvar</button>
        </form>
      )}

      {days.map((d) => {
        const list = items.filter((a) => dayKey(a.starts_at) === d);
        return (
          <div className="card" key={d}>
            <h3 style={{ textTransform: 'capitalize' }}>{dayLabel(d)}</h3>
            {list.length === 0 && <p className="muted">Sem atendimentos.</p>}
            {list.map((a) => (
              <div className="appt" key={a.id}>
                <div className="row between">
                  <b>{hhmm(a.starts_at)}–{hhmm(a.ends_at)} · {a.client_name}</b>
                  <span className={`badge ${a.status}`}>{STATUS[a.status]}</span>
                </div>
                <div className="muted">
                  {a.service} · {money(a.price_cents)} ·{' '}
                  <a href={wa(a.client_phone)} target="_blank" rel="noreferrer">{a.client_phone}</a>
                  {a.notes && <> · “{a.notes}”</>}
                </div>
                <div className="row" style={{ marginTop: 6 }}>
                  {a.status !== 'concluido' && <button className="sm" onClick={() => setStatus(a.id, 'concluido')}>Concluir</button>}
                  {a.status !== 'faltou' && <button className="ghost sm" onClick={() => setStatus(a.id, 'faltou')}>Faltou</button>}
                  {a.status !== 'cancelado' && <button className="ghost sm" onClick={() => setStatus(a.id, 'cancelado')}>Cancelar</button>}
                  {a.status !== 'agendado' && <button className="ghost sm" onClick={() => setStatus(a.id, 'agendado')}>Reagendar (voltar p/ agendado)</button>}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}
