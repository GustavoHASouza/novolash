import { useEffect, useState } from 'react';
import { api, money, STUDIO } from '../api.js';

const today = () => new Date().toLocaleDateString('en-CA');
const br = (d) => d.split('-').reverse().join('/');

const SERVICE_EMOJIS = {
  'fio': '💫',
  'volume': '🌸',
  'russo': '🌸',
  'manutenção': '✨',
  'manutencao': '✨',
  'sobrancelha': '🪶',
  'brow': '🪶',
  'mega': '👑',
  'brown': '🤎',
  'classic': '🌟',
  'fox': '🦊',
  'wispy': '🦋',
  'wet': '💧',
  'hybrid': '💎',
  'kim': '💎',
  'default': '✨',
};

function getServiceEmoji(name) {
  const lower = (name || '').toLowerCase();
  for (const [key, emoji] of Object.entries(SERVICE_EMOJIS)) {
    if (key !== 'default' && lower.includes(key)) return emoji;
  }
  return SERVICE_EMOJIS.default;
}

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

  const currentStep = !svc ? 1 : !time ? 2 : 3;

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

  function resetBooking() {
    setSvc(null);
    setDate(today());
    setSlots([]);
    setTime('');
    setForm({ name: '', phone: '', email: '', notes: '' });
    setMsg(null);
  }

  // If success, show the success card
  if (msg?.ok) {
    return (
      <div className="wrap">
        <div className="card success-card">
          <span className="success-icon">✅</span>
          <h2>Agendamento Confirmado!</h2>
          <p>{msg.ok}</p>
          <button className="new-booking-btn" onClick={resetBooking}>
            Fazer novo agendamento
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      {/* Hero */}
      <div className="hero">
        <span className="hero-sparkle">✨</span>
        <h1>Agende seu Horário</h1>
        <p>Extensão de cílios e design de sobrancelha. Escolha o serviço e o melhor horário para você.</p>
      </div>

      {/* Step Indicator */}
      <div className="steps-indicator">
        <div className={`step-dot ${currentStep >= 1 ? 'active' : ''} ${currentStep > 1 ? 'done' : ''}`}>1</div>
        <div className={`step-line ${currentStep > 1 ? 'active' : ''}`} />
        <div className={`step-dot ${currentStep >= 2 ? 'active' : ''} ${currentStep > 2 ? 'done' : ''}`}>2</div>
        <div className={`step-line ${currentStep > 2 ? 'active' : ''}`} />
        <div className={`step-dot ${currentStep >= 3 ? 'active' : ''}`}>3</div>
      </div>

      {msg?.err && <div className="msg err">{msg.err}</div>}

      {/* Step 1: Service Selection */}
      <div className="card">
        <h2>💫 Escolha o Serviço</h2>
        <div className="grid">
          {services.map((s) => (
            <button key={s.id} className={`opt ${svc?.id === s.id ? 'sel' : ''}`} onClick={() => setSvc(s)}>
              <div className="service-card">
                <span className="service-emoji">{getServiceEmoji(s.name)}</span>
                <span className="service-name">{s.name}</span>
                <span className="service-desc">{s.description}</span>
                <div className="service-meta">
                  {money(s.price_cents)}
                  <span className="duration">· {s.duration_min} min</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Step 2: Date & Time */}
      {svc && (
        <div className="card">
          <h2>📅 Data e Horário</h2>
          <div className="date-section">
            <div className="date-input-wrapper">
              <label>
                Selecione a data
                <input type="date" min={today()} value={date} onChange={(e) => setDate(e.target.value || today())} />
              </label>
            </div>
            {slots.length === 0 ? (
              <p className="no-slots">Sem horários livres nesta data. Tente outro dia ✨</p>
            ) : (
              <>
                <label style={{ marginBottom: 4 }}>Horários disponíveis</label>
                <div className="slots">
                  {slots.map((s) => (
                    <button key={s} className={`opt ${time === s ? 'sel' : ''}`} onClick={() => setTime(s)}>{s}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Client Info */}
      {svc && time && (
        <form className="card booking-form" onSubmit={submit}>
          <h2>📝 Seus Dados</h2>
          <label>
            Nome completo
            <input required placeholder="Seu nome" value={form.name} onChange={set('name')} />
          </label>
          <label>
            WhatsApp / Telefone
            <input required type="tel" placeholder="(00) 00000-0000" value={form.phone} onChange={set('phone')} />
            <div className="form-hint">Usaremos para confirmar seu agendamento</div>
          </label>
          <label>
            E-mail (opcional)
            <input type="email" placeholder="seu@email.com" value={form.email} onChange={set('email')} />
          </label>
          <label>
            Observações (opcional)
            <textarea rows="2" placeholder="Alguma observação especial?" value={form.notes} onChange={set('notes')} />
          </label>
          <button className="confirm-btn" disabled={busy}>
            {busy ? 'Enviando...' : `✨ Confirmar ${br(date)} às ${time}`}
          </button>
        </form>
      )}
    </div>
  );
}
