import { useEffect, useState } from 'react';
import { api, money, STUDIO } from '../api.js';

const today = () => new Date().toLocaleDateString('en-CA');
const br = (d) => d.split('-').reverse().join('/');

export default function Booking() {
  const [services, setServices] = useState([]);
  const [svc, setSvc] = useState(null);
  const [date, setDate] = useState(today());
  const [slots, setSlots] = useState([]);
  const [time, setTime] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadSlots = () =>
    svc ? api.slots(date, svc.id).then((r) => setSlots(r.slots)).catch(() => setSlots([])) : null;

  useEffect(() => {
    api.services().then(setServices).catch((e) => setMsg({ err: e.message }));
  }, []);

  useEffect(() => {
    setTime('');
    loadSlots();
  }, [svc, date]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api.book({ ...form, serviceId: svc.id, date, time });
      setMsg({ ok: `Agendamento confirmado para ${br(date)} às ${time}. Até breve!` });
      setForm({ name: '', phone: '', email: '', notes: '' });
      setTime('');
    } catch (err) {
      setMsg({ err: err.message });
    } finally {
      setBusy(false);
      loadSlots();
    }
  }

  return (
    <div className="wrap">
      <h1>{STUDIO}</h1>
      <p className="muted">Extensão de cílios e design de sobrancelha. Escolha o serviço e o melhor horário.</p>
      {msg?.ok && <div className="msg ok">{msg.ok}</div>}
      {msg?.err && <div className="msg err">{msg.err}</div>}

      <div className="card">
        <h2>1. Serviço</h2>
        <div className="grid">
          {services.map((s) => (
            <button key={s.id} className={`opt ${svc?.id === s.id ? 'sel' : ''}`} onClick={() => setSvc(s)}>
              <b>{s.name}</b>
              <div className="muted">{s.description}</div>
              <div>{money(s.price_cents)} · {s.duration_min} min</div>
            </button>
          ))}
        </div>
      </div>

      {svc && (
        <div className="card">
          <h2>2. Data e horário</h2>
          <label>
            Data
            <input type="date" min={today()} value={date} onChange={(e) => setDate(e.target.value || today())} />
          </label>
          {slots.length === 0 ? (
            <p className="muted">Sem horários livres nesta data. Tente outro dia.</p>
          ) : (
            <div className="slots">
              {slots.map((s) => (
                <button key={s} className={`opt ${time === s ? 'sel' : ''}`} onClick={() => setTime(s)}>{s}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {svc && time && (
        <form className="card" onSubmit={submit}>
          <h2>3. Seus dados</h2>
          <label>Nome completo<input required value={form.name} onChange={set('name')} /></label>
          <label>WhatsApp / telefone<input required type="tel" value={form.phone} onChange={set('phone')} /></label>
          <label>E-mail (opcional)<input type="email" value={form.email} onChange={set('email')} /></label>
          <label>Observações (opcional)<textarea rows="2" value={form.notes} onChange={set('notes')} /></label>
          <button disabled={busy}>{busy ? 'Enviando...' : `Confirmar ${br(date)} às ${time}`}</button>
        </form>
      )}
    </div>
  );
}
