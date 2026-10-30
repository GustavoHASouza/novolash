import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, money, TZ } from '../api.js';

const today = () => new Date().toLocaleDateString('en-CA');
const hhmm = (iso) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const dayKey = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });
const fullDayLabel = (d) =>
  new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const STATUS = {
  agendado: 'Agendado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  faltou: 'Faltou',
};

const wa = (phone) => {
  const d = String(phone || '').replace(/\D/g, '');
  return `https://wa.me/${d.length <= 11 ? '55' + d : d}`;
};

function getMonthInfo(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  const firstDay = new Date(y, m - 1, 1);
  const lastDay = new Date(y, m, 0);
  const daysInMonth = lastDay.getDate();
  const startWeekday = firstDay.getDay();

  const firstStr = `${yearMonth}-01`;
  const lastStr = `${yearMonth}-${String(daysInMonth).padStart(2, '0')}`;
  const label = firstDay.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${yearMonth}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  return { y, m, firstStr, lastStr, label, cells };
}

function shiftMonth(yearMonth, delta) {
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function Agenda() {
  const [currentMonth, setCurrentMonth] = useState(() => today().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(null);
  const [items, setItems] = useState([]);
  const [err, setErr] = useState('');
  const [services, setServices] = useState([]);
  const [openForm, setOpenForm] = useState(false);
  const [f, setF] = useState({
    serviceId: '',
    date: today(),
    time: '09:00',
    name: '',
    phone: '',
    notes: '',
  });

  const monthInfo = useMemo(() => getMonthInfo(currentMonth), [currentMonth]);

  const load = useCallback(async () => {
    try {
      const data = await api.admin(
        `/appointments?from=${monthInfo.firstStr}&to=${monthInfo.lastStr}`
      );
      setItems(data);
    } catch (e) {
      setErr(e.message);
    }
  }, [monthInfo.firstStr, monthInfo.lastStr]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .admin('/services')
      .then((s) => setServices(s.filter((x) => x.active)))
      .catch(() => {});
  }, []);

  async function setStatus(id, status) {
    setErr('');
    try {
      await api.admin(`/appointments/${id}`, { method: 'PATCH', body: { status } });
      load();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function create(e) {
    e.preventDefault();
    setErr('');
    try {
      await api.admin('/appointments', { method: 'POST', body: f });
      setOpenForm(false);
      setF({ ...f, name: '', phone: '', notes: '' });
      if (f.date.slice(0, 7) !== currentMonth) {
        setCurrentMonth(f.date.slice(0, 7));
      } else {
        load();
      }
      setSelectedDate(f.date);
    } catch (e2) {
      setErr(e2.message);
    }
  }

  function openDayAgenda(dateStr) {
    setSelectedDate(dateStr);
    setF((prev) => ({ ...prev, date: dateStr }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const byDay = useMemo(() => {
    const map = {};
    for (const a of items) {
      const k = dayKey(a.starts_at);
      if (!map[k]) map[k] = [];
      map[k].push(a);
    }
    return map;
  }, [items]);

  const todayStr = today();

  return (
    <div className="step-screen">
      {err && <div className="msg err">{err}</div>}

      {/* Barra superior da Agenda */}
      <div className="calendar-toolbar">
        <div className="calendar-title-group">
          <h2 className="calendar-month-title">{monthInfo.label}</h2>
          <div className="calendar-nav-btns">
            <button
              type="button"
              className="ghost sm"
              onClick={() => setCurrentMonth(shiftMonth(currentMonth, -1))}
            >
              Anterior
            </button>
            <button
              type="button"
              className="ghost sm"
              onClick={() => {
                const t = today();
                setCurrentMonth(t.slice(0, 7));
                if (selectedDate) setSelectedDate(t);
              }}
            >
              Hoje
            </button>
            <button
              type="button"
              className="ghost sm"
              onClick={() => setCurrentMonth(shiftMonth(currentMonth, 1))}
            >
              Próximo
            </button>
          </div>
        </div>

        <button
          type="button"
          className="sm calendar-new-btn"
          onClick={() => {
            setF((prev) => ({ ...prev, date: selectedDate || today() }));
            setOpenForm(!openForm);
          }}
        >
          {openForm ? 'Fechar formulário' : 'Novo agendamento'}
        </button>
      </div>

      {openForm && (
        <form className="card" onSubmit={create}>
          <h3>Novo Agendamento Manual</h3>
          <div className="grid">
            <label>
              Procedimento
              <select
                required
                value={f.serviceId}
                onChange={(e) => setF({ ...f, serviceId: e.target.value })}
              >
                <option value="">Selecione</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({money(s.price_cents)})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Data
              <input
                type="date"
                required
                value={f.date}
                onChange={(e) => setF({ ...f, date: e.target.value })}
              />
            </label>
            <label>
              Horário
              <input
                type="time"
                required
                value={f.time}
                onChange={(e) => setF({ ...f, time: e.target.value })}
              />
            </label>
            <label>
              Nome da cliente
              <input
                required
                placeholder="Nome completo"
                value={f.name}
                onChange={(e) => setF({ ...f, name: e.target.value })}
              />
            </label>
            <label>
              Telefone / WhatsApp
              <input
                required
                type="tel"
                placeholder="(00) 00000-0000"
                value={f.phone}
                onChange={(e) => setF({ ...f, phone: e.target.value })}
              />
            </label>
            <label>
              Observações (opcional)
              <input
                placeholder="Anote detalhes se desejar"
                value={f.notes}
                onChange={(e) => setF({ ...f, notes: e.target.value })}
              />
            </label>
          </div>
          <button type="submit" style={{ marginTop: 12 }}>
            Salvar agendamento
          </button>
        </form>
      )}

      {/* VISÃO 1: CALENDÁRIO MENSAL COM COLUNAS 100% UNIFORMES */}
      {!selectedDate && (
        <div className="card calendar-card">
          <div className="calendar-weekdays">
            {WEEKDAYS_SHORT.map((w) => (
              <div key={w} className="calendar-weekday-cell">
                {w}
              </div>
            ))}
          </div>

          <div className="calendar-grid">
            {monthInfo.cells.map((dateStr, i) => {
              if (!dateStr) {
                return <div key={`empty-${i}`} className="calendar-day-cell empty" />;
              }
              const dayNum = Number(dateStr.slice(-2));
              const dayAppts = byDay[dateStr] || [];
              const activeCount = dayAppts.filter((a) => a.status !== 'cancelado').length;
              const isToday = dateStr === todayStr;

              return (
                <button
                  type="button"
                  key={dateStr}
                  className={`calendar-day-cell ${isToday ? 'today' : ''} ${
                    dayAppts.length > 0 ? 'has-events' : ''
                  }`}
                  onClick={() => openDayAgenda(dateStr)}
                >
                  <div className="calendar-day-top">
                    <span className="calendar-day-number">{dayNum}</span>
                    {activeCount > 0 && (
                      <span className="calendar-day-count" title={`${activeCount} agendamentos`}>
                        <span className="calendar-count-num">{activeCount}</span>
                        <span className="calendar-count-label">
                          {activeCount === 1 ? ' horário' : ' horários'}
                        </span>
                      </span>
                    )}
                  </div>

                  <div className="calendar-day-events">
                    {dayAppts.slice(0, 2).map((a) => (
                      <div key={a.id} className={`calendar-event-pill ${a.status}`}>
                        <span className="calendar-event-time">{hhmm(a.starts_at)}</span>
                        <span className="calendar-event-name">{a.client_name}</span>
                      </div>
                    ))}
                    {dayAppts.length > 2 && (
                      <div className="calendar-event-more">
                        +{dayAppts.length - 2}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* VISÃO 2: AGENDA DETALHADA DO DIA SELECIONADO */}
      {selectedDate && (
        <div className="step-screen">
          <div className="step-nav-top">
            <button
              type="button"
              className="back-btn"
              onClick={() => setSelectedDate(null)}
            >
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 10H5M9 14l-4-4 4-4" />
              </svg>
              Voltar ao calendário mensal
            </button>
          </div>

          <div className="card day-detail-card">
            <div className="day-detail-header">
              <div>
                <span className="summary-eyebrow">Agenda do dia</span>
                <h2 style={{ textTransform: 'capitalize', marginTop: 2 }}>
                  {fullDayLabel(selectedDate)}
                </h2>
              </div>
              <button
                type="button"
                className="ghost sm"
                onClick={() => {
                  setF((prev) => ({ ...prev, date: selectedDate }));
                  setOpenForm(true);
                }}
              >
                Agendar neste dia
              </button>
            </div>

            {(byDay[selectedDate] || []).length === 0 ? (
              <div className="no-slots" style={{ marginTop: 12 }}>
                Nenhum atendimento agendado para esta data.
              </div>
            ) : (
              <div className="day-timeline">
                {(byDay[selectedDate] || []).map((a) => (
                  <div className="timeline-item" key={a.id}>
                    <div className="timeline-time-col">
                      <span className="timeline-start">{hhmm(a.starts_at)}</span>
                      <span className="timeline-end">até {hhmm(a.ends_at)}</span>
                    </div>

                    <div className="timeline-content-col">
                      <div className="appt-header">
                        <strong className="timeline-client">{a.client_name}</strong>
                        <span className={`badge ${a.status}`}>{STATUS[a.status]}</span>
                      </div>

                      <div className="timeline-service">
                        {a.service} · <strong>{money(a.price_cents)}</strong>
                      </div>

                      <div className="appt-details" style={{ marginTop: 4 }}>
                        <a href={wa(a.client_phone)} target="_blank" rel="noreferrer">
                          WhatsApp: {a.client_phone}
                        </a>
                        {a.client_email && <> · {a.client_email}</>}
                        {a.notes && <div className="timeline-notes">Observação: "{a.notes}"</div>}
                      </div>

                      <div className="appt-actions">
                        {a.status !== 'concluido' && (
                          <button
                            type="button"
                            className="sm"
                            onClick={() => setStatus(a.id, 'concluido')}
                          >
                            Concluir atendimento
                          </button>
                        )}
                        {a.status !== 'faltou' && (
                          <button
                            type="button"
                            className="ghost sm"
                            onClick={() => setStatus(a.id, 'faltou')}
                          >
                            Marcar falta
                          </button>
                        )}
                        {a.status !== 'cancelado' && (
                          <button
                            type="button"
                            className="ghost sm"
                            onClick={() => setStatus(a.id, 'cancelado')}
                          >
                            Cancelar
                          </button>
                        )}
                        {a.status !== 'agendado' && (
                          <button
                            type="button"
                            className="ghost sm"
                            onClick={() => setStatus(a.id, 'agendado')}
                          >
                            Voltar para agendado
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
