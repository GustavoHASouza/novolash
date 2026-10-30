import { useEffect, useState } from 'react';
import { api, money } from '../api.js';

const today = () => new Date().toLocaleDateString('en-CA');
const br = (d) => d.split('-').reverse().join('/');

const DEFAULT_LASH_PHOTO =
  'https://images.unsplash.com/photo-1583001931096-959e9a1a6223?auto=format&fit=crop&w=800&q=80';

const STEPS = [
  { num: 1, label: 'Modelo' },
  { num: 2, label: 'Data e Horário' },
  { num: 3, label: 'Seus Dados' },
];

export default function Booking() {
  const [services, setServices] = useState([]);
  const [svc, setSvc] = useState(null);
  const [step, setStep] = useState(1);
  const [date, setDate] = useState(today());
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [time, setTime] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadSlots = () => {
    if (!svc) return;
    setLoadingSlots(true);
    api
      .slots(date, svc.id)
      .then((r) => setSlots(r.slots))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  };

  useEffect(() => {
    api.services().then(setServices).catch((e) => setMsg({ err: e.message }));
  }, []);

  useEffect(() => {
    setTime('');
    loadSlots();
  }, [svc, date]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  function goToStep(nextStep) {
    setMsg(null);
    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleSelectService(service) {
    setSvc(service);
    goToStep(2);
  }

  function handleSelectSlot(slotTime) {
    setTime(slotTime);
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api.book({ ...form, serviceId: svc.id, date, time });
      setMsg({
        ok: `Seu horário para ${svc.name} foi reservado para o dia ${br(date)} às ${time}.`,
      });
      setForm({ name: '', phone: '', email: '', notes: '' });
    } catch (err) {
      setMsg({ err: err.message });
    } finally {
      setBusy(false);
      loadSlots();
    }
  }

  function resetBooking() {
    setSvc(null);
    setStep(1);
    setDate(today());
    setSlots([]);
    setTime('');
    setForm({ name: '', phone: '', email: '', notes: '' });
    setMsg(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (msg?.ok) {
    return (
      <div className="wrap">
        <div className="card success-card">
          <div className="success-check">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2>Agendamento Confirmado</h2>
          <p>{msg.ok}</p>
          <button className="new-booking-btn" onClick={resetBooking}>
            Realizar novo agendamento
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className="hero">
        <span className="hero-eyebrow">Agendamento Online</span>
        <h1>Realce a Beleza do seu Olhar</h1>
        <p>Escolha o modelo desejado, selecione o melhor horário e confirme sua sessão em poucos segundos.</p>
      </div>

      {/* Stepper */}
      <div className="steps-bar">
        {STEPS.map((s, idx) => {
          const isActive = step === s.num;
          const isDone = step > s.num;
          const canClick = s.num === 1 || (s.num === 2 && svc) || (s.num === 3 && svc && time);
          return (
            <div key={s.num} className="step-item-wrap">
              <button
                type="button"
                className={`step-pill ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}
                disabled={!canClick}
                onClick={() => canClick && goToStep(s.num)}
              >
                <span className="step-num">{isDone ? '✓' : s.num}</span>
                <span className="step-label">{s.label}</span>
              </button>
              {idx < STEPS.length - 1 && (
                <div className={`step-connector ${step > s.num ? 'active' : ''}`} />
              )}
            </div>
          );
        })}
      </div>

      {msg?.err && <div className="msg err">{msg.err}</div>}

      {/* ETAPA 1: CATÁLOGO DE MODELOS / SERVIÇOS */}
      {step === 1 && (
        <div className="step-screen">
          <div className="section-header">
            <div>
              <h2>Escolha o Procedimento</h2>
              <p className="muted">Selecione o modelo de extensão de cílios ou design de sobrancelha para avançar.</p>
            </div>
          </div>

          <div className="catalog-grid">
            {services.map((s) => (
              <article
                key={s.id}
                className={`catalog-card ${svc?.id === s.id ? 'selected' : ''}`}
                onClick={() => handleSelectService(s)}
              >
                <div className="catalog-image-wrap">
                  <img
                    src={s.image_url || DEFAULT_LASH_PHOTO}
                    alt={s.name}
                    className="catalog-image"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = DEFAULT_LASH_PHOTO;
                    }}
                  />
                  <span className="catalog-duration-tag">{s.duration_min} min</span>
                </div>
                <div className="catalog-body">
                  <h3 className="catalog-title">{s.name}</h3>
                  <p className="catalog-desc">{s.description}</p>
                  <div className="catalog-footer">
                    <span className="catalog-price">{money(s.price_cents)}</span>
                    <span className="catalog-cta">
                      Selecionar
                      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 10h10M11 6l4 4-4 4" />
                      </svg>
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {/* ETAPA 2: DATA E HORÁRIO */}
      {step === 2 && svc && (
        <div className="step-screen">
          <div className="step-nav-top">
            <button type="button" className="back-btn" onClick={() => goToStep(1)}>
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 10H5M9 14l-4-4 4-4" />
              </svg>
              Voltar para modelos
            </button>
          </div>

          <div className="selected-summary-bar">
            <img
              src={svc.image_url || DEFAULT_LASH_PHOTO}
              alt={svc.name}
              className="summary-thumb"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = DEFAULT_LASH_PHOTO;
              }}
            />
            <div className="summary-info">
              <span className="summary-eyebrow">Procedimento selecionado</span>
              <strong>{svc.name}</strong>
              <span>{money(svc.price_cents)} · {svc.duration_min} minutos</span>
            </div>
            <button type="button" className="ghost sm" onClick={() => goToStep(1)}>
              Trocar
            </button>
          </div>

          <div className="card">
            <h2>Escolha a Data e o Horário</h2>
            <p className="muted" style={{ marginBottom: 20 }}>
              Selecione o dia desejado para visualizar os horários disponíveis na agenda.
            </p>

            <div className="date-section">
              <div className="date-input-wrapper">
                <label>
                  Data do atendimento
                  <input
                    type="date"
                    min={today()}
                    value={date}
                    onChange={(e) => setDate(e.target.value || today())}
                  />
                </label>
              </div>

              {loadingSlots ? (
                <p className="no-slots">Consultando horários disponíveis...</p>
              ) : slots.length === 0 ? (
                <p className="no-slots">Não há horários livres nesta data. Por favor, selecione outro dia.</p>
              ) : (
                <div>
                  <label style={{ marginBottom: 10 }}>Horários disponíveis em {br(date)}</label>
                  <div className="slots">
                    {slots.map((s) => (
                      <button
                        type="button"
                        key={s}
                        className={`slot-btn ${time === s ? 'sel' : ''}`}
                        onClick={() => handleSelectSlot(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="step-actions-footer">
              <button type="button" className="ghost" onClick={() => goToStep(1)}>
                Voltar
              </button>
              <button
                type="button"
                disabled={!time}
                onClick={() => goToStep(3)}
              >
                Continuar para seus dados
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ETAPA 3: DADOS DA CLIENTE */}
      {step === 3 && svc && time && (
        <div className="step-screen">
          <div className="step-nav-top">
            <button type="button" className="back-btn" onClick={() => goToStep(2)}>
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 10H5M9 14l-4-4 4-4" />
              </svg>
              Voltar para data e horário
            </button>
          </div>

          <div className="selected-summary-bar">
            <img
              src={svc.image_url || DEFAULT_LASH_PHOTO}
              alt={svc.name}
              className="summary-thumb"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = DEFAULT_LASH_PHOTO;
              }}
            />
            <div className="summary-info">
              <span className="summary-eyebrow">Resumo da reserva</span>
              <strong>{svc.name}</strong>
              <span>Dia {br(date)} às {time} · {money(svc.price_cents)}</span>
            </div>
            <button type="button" className="ghost sm" onClick={() => goToStep(2)}>
              Alterar horário
            </button>
          </div>

          <form className="card booking-form" onSubmit={submit}>
            <h2>Informe seus Dados</h2>
            <p className="muted" style={{ marginBottom: 20 }}>
              Preencha suas informações para concluir a reserva do horário.
            </p>

            <label>
              Nome completo
              <input
                required
                placeholder="Digite seu nome completo"
                value={form.name}
                onChange={set('name')}
              />
            </label>
            <label>
              WhatsApp / Telefone
              <input
                required
                type="tel"
                placeholder="(00) 00000-0000"
                value={form.phone}
                onChange={set('phone')}
              />
              <div className="form-hint">Utilizaremos este número para contato e confirmação</div>
            </label>
            <label>
              E-mail (opcional)
              <input
                type="email"
                placeholder="seu@email.com"
                value={form.email}
                onChange={set('email')}
              />
            </label>
            <label>
              Observações (opcional)
              <textarea
                rows="2"
                placeholder="Alguma preferência ou observação?"
                value={form.notes}
                onChange={set('notes')}
              />
            </label>

            <div className="step-actions-footer">
              <button type="button" className="ghost" onClick={() => goToStep(2)}>
                Voltar
              </button>
              <button type="submit" disabled={busy}>
                {busy ? 'Confirmando...' : `Confirmar Agendamento · ${br(date)} às ${time}`}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
