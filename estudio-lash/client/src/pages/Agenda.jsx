import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, money, TZ } from '../api.js';
import { ConfirmDialog, Modal, Toast } from '../components/Dialog.jsx';

const BLOCK = '__bloqueio';

const today = () => new Date().toLocaleDateString('en-CA');
const hhmm = (iso) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const dayKey = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });
const shortDate = (iso) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: TZ });
const fullDayLabel = (d) =>
  new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
const centsToInput = (c) => (Number(c || 0) / 100).toFixed(2);
const addDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-CA');
};

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

const emptyForm = (date) => ({
  serviceId: '',
  date,
  time: '09:00',
  name: '',
  phone: '',
  notes: '',
  price: '',
  start_date: date,
  start_time: '09:00',
  end_date: date,
  end_time: '18:00',
});

/* Campos de período indisponível (início e término) */
function BlockFields({ v, onChange }) {
  const set = (k) => (e) => onChange({ ...v, [k]: e.target.value });
  return (
    <div className="block-fields">
      <div className="block-fields-group">
        <span className="block-fields-label">Início</span>
        <div className="hours-time-pair">
          <label>
            Dia de início
            <input type="date" required value={v.start_date} onChange={set('start_date')} />
          </label>
          <label>
            Hora de início
            <input type="time" required value={v.start_time} onChange={set('start_time')} />
          </label>
        </div>
      </div>
      <div className="block-fields-group">
        <span className="block-fields-label">Término</span>
        <div className="hours-time-pair">
          <label>
            Dia de término
            <input
              type="date"
              required
              min={v.start_date}
              value={v.end_date}
              onChange={set('end_date')}
            />
          </label>
          <label>
            Hora de término
            <input type="time" required value={v.end_time} onChange={set('end_time')} />
          </label>
        </div>
      </div>
      <label>
        Motivo (opcional)
        <input
          placeholder="Ex.: curso, viagem, consulta médica"
          value={v.notes}
          onChange={set('notes')}
        />
      </label>
    </div>
  );
}

export default function Agenda() {
  const [currentMonth, setCurrentMonth] = useState(() => today().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(null);
  const [items, setItems] = useState([]);
  const [toast, setToast] = useState(null);
  const [allServices, setAllServices] = useState([]);
  const [openForm, setOpenForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState(() => emptyForm(today()));
  const [confirm, setConfirm] = useState(null);
  const [alertInfo, setAlertInfo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const services = useMemo(() => allServices.filter((x) => x.active), [allServices]);
  const monthInfo = useMemo(() => getMonthInfo(currentMonth), [currentMonth]);
  const isBlockForm = f.serviceId === BLOCK;
  const closeToast = useCallback(() => setToast(null), []);

  const load = useCallback(async () => {
    try {
      const data = await api.admin(
        `/appointments?from=${monthInfo.firstStr}&to=${monthInfo.lastStr}`
      );
      setItems(data);
    } catch (e) {
      setToast({ err: e.message });
    }
  }, [monthInfo.firstStr, monthInfo.lastStr]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .admin('/services')
      .then(setAllServices)
      .catch(() => {});
  }, []);

  async function setStatus(id, status) {
    try {
      await api.admin(`/appointments/${id}`, { method: 'PATCH', body: { status } });
      load();
    } catch (e) {
      setToast({ err: e.message });
    }
  }

  function selectService(value) {
    const svc = allServices.find((s) => String(s.id) === String(value));
    setF((prev) => ({
      ...prev,
      serviceId: value,
      price: svc ? centsToInput(svc.price_cents) : prev.price,
      start_date: prev.start_date || prev.date,
      end_date: prev.end_date || prev.date,
    }));
  }

  async function create(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (isBlockForm) {
        await api.admin('/appointments', {
          method: 'POST',
          body: {
            kind: 'bloqueio',
            start_date: f.start_date,
            start_time: f.start_time,
            end_date: f.end_date,
            end_time: f.end_time,
            notes: f.notes,
          },
        });
      } else {
        await api.admin('/appointments', { method: 'POST', body: f });
      }
      const targetDate = isBlockForm ? f.start_date : f.date;
      setOpenForm(false);
      setF(emptyForm(targetDate));
      setToast({ ok: isBlockForm ? 'Período indisponível registrado.' : 'Agendamento salvo.' });
      if (targetDate.slice(0, 7) !== currentMonth) {
        setCurrentMonth(targetDate.slice(0, 7));
      } else {
        load();
      }
      setSelectedDate(targetDate);
    } catch (err) {
      if (isBlockForm) {
        setAlertInfo({ title: 'Não foi possível registrar a indisponibilidade', message: err.message });
      } else {
        setToast({ err: err.message });
      }
    } finally {
      setSaving(false);
    }
  }

  function askDelete(a) {
    const isBlock = a.kind === 'bloqueio';
    setConfirm({
      title: isBlock ? 'Excluir período indisponível?' : 'Cancelar este agendamento?',
      message: isBlock
        ? 'O período será removido e os horários voltarão a ficar disponíveis para agendamento.'
        : `O agendamento de ${a.client_name} será excluído definitivamente, junto com todos os dados e lançamentos financeiros vinculados. Esta ação não pode ser desfeita.`,
      confirmLabel: isBlock ? 'Sim, excluir' : 'Sim, cancelar e excluir',
      onConfirm: async () => {
        setConfirm((c) => ({ ...c, busy: true }));
        try {
          await api.admin(`/appointments/${a.id}`, { method: 'DELETE' });
          setConfirm(null);
          setToast({ ok: isBlock ? 'Período indisponível removido.' : 'Agendamento excluído.' });
          load();
        } catch (err) {
          setConfirm(null);
          setToast({ err: err.message });
        }
      },
    });
  }

  function openEdit(a) {
    setEditing(a);
    if (a.kind === 'bloqueio') {
      setEditForm({
        start_date: dayKey(a.starts_at),
        start_time: hhmm(a.starts_at),
        end_date: dayKey(a.ends_at),
        end_time: hhmm(a.ends_at),
        notes: a.notes || '',
      });
    } else {
      setEditForm({
        name: a.client_name || '',
        phone: a.client_phone || '',
        email: a.client_email || '',
        serviceId: a.service_id ? String(a.service_id) : '',
        price: centsToInput(a.price_cents),
        date: dayKey(a.starts_at),
        time: hhmm(a.starts_at),
        notes: a.notes || '',
      });
    }
  }

  const closeEdit = useCallback(() => {
    setEditing(null);
    setEditForm(null);
  }, []);

  async function saveEdit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.admin(`/appointments/${editing.id}`, { method: 'PUT', body: editForm });
      const newDate = editing.kind === 'bloqueio' ? editForm.start_date : editForm.date;
      closeEdit();
      setToast({ ok: 'Alterações salvas.' });
      if (newDate.slice(0, 7) !== currentMonth) {
        setCurrentMonth(newDate.slice(0, 7));
      } else {
        load();
      }
      if (selectedDate) setSelectedDate(newDate);
    } catch (err) {
      if (editing.kind === 'bloqueio') {
        setAlertInfo({ title: 'Não foi possível salvar o período', message: err.message });
      } else {
        setToast({ err: err.message });
      }
    } finally {
      setSaving(false);
    }
  }

  function openDayAgenda(dateStr) {
    setSelectedDate(dateStr);
    setF((prev) => ({ ...prev, date: dateStr, start_date: dateStr, end_date: dateStr }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openNewForm(dateStr) {
    setF((prev) => ({ ...prev, date: dateStr, start_date: dateStr, end_date: dateStr }));
    setOpenForm(true);
  }

  // Agrupa por dia; períodos indisponíveis aparecem em todos os dias que abrangem
  const byDay = useMemo(() => {
    const map = {};
    const push = (k, a) => {
      if (!map[k]) map[k] = [];
      map[k].push(a);
    };
    for (const a of items) {
      if (a.kind === 'bloqueio') {
        const first = dayKey(a.starts_at);
        const last = dayKey(new Date(new Date(a.ends_at).getTime() - 60000).toISOString());
        for (let d = first, guard = 0; d <= last && guard < 400; d = addDays(d, 1), guard++) {
          push(d, a);
        }
      } else {
        push(dayKey(a.starts_at), a);
      }
    }
    return map;
  }, [items]);

  const todayStr = today();
  const editServices = editing
    ? allServices.filter((s) => s.active || String(s.id) === String(editForm?.serviceId))
    : [];

  return (
    <div className="step-screen">
      <Toast toast={toast} onClose={closeToast} />

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          cancelLabel="Não"
          tone="danger"
          busy={confirm.busy}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}

      {alertInfo && (
        <ConfirmDialog
          alertOnly
          tone="danger"
          title={alertInfo.title}
          message={alertInfo.message}
          onCancel={() => setAlertInfo(null)}
        />
      )}

      {editing && editForm && (
        <Modal
          title={editing.kind === 'bloqueio' ? 'Editar período indisponível' : 'Editar agendamento'}
          subtitle={
            editing.kind === 'bloqueio'
              ? 'Ajuste o início e o término do período.'
              : 'Altere qualquer informação do atendimento.'
          }
          onClose={closeEdit}
          footer={
            <>
              <button type="button" className="ghost" onClick={closeEdit} disabled={saving}>
                Cancelar
              </button>
              <button type="submit" form="edit-appt-form" disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </>
          }
        >
          <form id="edit-appt-form" onSubmit={saveEdit}>
            {editing.kind === 'bloqueio' ? (
              <BlockFields v={editForm} onChange={setEditForm} />
            ) : (
              <div className="grid edit-grid">
                <label>
                  Nome da cliente
                  <input
                    required
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  />
                </label>
                <label>
                  Telefone / WhatsApp
                  <input
                    required
                    type="tel"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  />
                </label>
                <label>
                  Procedimento
                  <select
                    required
                    value={editForm.serviceId}
                    onChange={(e) => {
                      const svc = allServices.find((s) => String(s.id) === e.target.value);
                      setEditForm({
                        ...editForm,
                        serviceId: e.target.value,
                        price: svc ? centsToInput(svc.price_cents) : editForm.price,
                      });
                    }}
                  >
                    <option value="">Selecione</option>
                    {editServices.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Valor do atendimento (R$)
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={editForm.price}
                    onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                  />
                </label>
                <label>
                  Data
                  <input
                    type="date"
                    required
                    value={editForm.date}
                    onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                  />
                </label>
                <label>
                  Horário
                  <input
                    type="time"
                    required
                    value={editForm.time}
                    onChange={(e) => setEditForm({ ...editForm, time: e.target.value })}
                  />
                </label>
                <label>
                  E-mail (opcional)
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  />
                </label>
                <label>
                  Observações (opcional)
                  <input
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  />
                </label>
              </div>
            )}
          </form>
        </Modal>
      )}

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
            if (openForm) setOpenForm(false);
            else openNewForm(selectedDate || today());
          }}
        >
          {openForm ? 'Fechar formulário' : 'Novo agendamento'}
        </button>
      </div>

      {openForm && (
        <form className="card" onSubmit={create}>
          <h3>{isBlockForm ? 'Registrar Período Indisponível' : 'Novo Agendamento Manual'}</h3>
          <div className="grid">
            <label>
              Procedimento
              <select required value={f.serviceId} onChange={(e) => selectService(e.target.value)}>
                <option value="">Selecione</option>
                <option value={BLOCK}>Estarei indisponível</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({money(s.price_cents)})
                  </option>
                ))}
              </select>
            </label>

            {!isBlockForm && (
              <>
                <label>
                  Valor do atendimento (R$)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="Valor do serviço"
                    value={f.price}
                    onChange={(e) => setF({ ...f, price: e.target.value })}
                  />
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
              </>
            )}
          </div>

          {isBlockForm && (
            <>
              <p className="muted block-form-hint">
                Durante este período nenhum horário ficará disponível para as clientes. Não é possível
                registrar se já houver atendimentos marcados na janela escolhida.
              </p>
              <BlockFields v={f} onChange={setF} />
            </>
          )}

          <button type="submit" style={{ marginTop: 12 }} disabled={saving}>
            {saving ? 'Salvando...' : isBlockForm ? 'Registrar indisponibilidade' : 'Salvar agendamento'}
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
              const activeCount = dayAppts.filter(
                (a) => a.status !== 'cancelado' && a.kind !== 'bloqueio'
              ).length;
              const hasBlock = dayAppts.some((a) => a.kind === 'bloqueio');
              const isToday = dateStr === todayStr;

              return (
                <button
                  type="button"
                  key={dateStr}
                  className={`calendar-day-cell ${isToday ? 'today' : ''} ${
                    dayAppts.length > 0 ? 'has-events' : ''
                  } ${hasBlock ? 'has-block' : ''}`}
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
                      <div
                        key={a.id}
                        className={`calendar-event-pill ${a.kind === 'bloqueio' ? 'bloqueio' : a.status}`}
                      >
                        {a.kind === 'bloqueio' ? (
                          <span className="calendar-event-name">Indisponível</span>
                        ) : (
                          <>
                            <span className="calendar-event-time">{hhmm(a.starts_at)}</span>
                            <span className="calendar-event-name">{a.client_name}</span>
                          </>
                        )}
                      </div>
                    ))}
                    {dayAppts.length > 2 && (
                      <div className="calendar-event-more">+{dayAppts.length - 2}</div>
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
            <button type="button" className="back-btn" onClick={() => setSelectedDate(null)}>
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
              <button type="button" className="ghost sm" onClick={() => openNewForm(selectedDate)}>
                Agendar neste dia
              </button>
            </div>

            {(byDay[selectedDate] || []).length === 0 ? (
              <div className="no-slots" style={{ marginTop: 12 }}>
                Nenhum atendimento agendado para esta data.
              </div>
            ) : (
              <div className="day-timeline">
                {(byDay[selectedDate] || []).map((a) =>
                  a.kind === 'bloqueio' ? (
                    <div className="timeline-item timeline-block" key={a.id}>
                      <div className="timeline-time-col">
                        <span className="timeline-start">
                          {dayKey(a.starts_at) < selectedDate ? '00:00' : hhmm(a.starts_at)}
                        </span>
                        <span className="timeline-end">
                          até {dayKey(a.ends_at) > selectedDate ? '23:59' : hhmm(a.ends_at)}
                        </span>
                      </div>
                      <div className="timeline-content-col">
                        <div className="appt-header">
                          <strong className="timeline-client">Estarei indisponível</strong>
                          <span className="badge bloqueio">Bloqueado</span>
                        </div>
                        <div className="timeline-service">
                          De {shortDate(a.starts_at)} às {hhmm(a.starts_at)} até{' '}
                          {shortDate(a.ends_at)} às {hhmm(a.ends_at)}
                        </div>
                        {a.notes && <div className="timeline-notes">Motivo: {a.notes}</div>}
                        <div className="appt-actions">
                          <button type="button" className="ghost sm" onClick={() => openEdit(a)}>
                            Editar período
                          </button>
                          <button type="button" className="ghost sm danger-ghost" onClick={() => askDelete(a)}>
                            Excluir
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
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
                            <button type="button" className="sm" onClick={() => setStatus(a.id, 'concluido')}>
                              Concluir atendimento
                            </button>
                          )}
                          <button type="button" className="ghost sm" onClick={() => openEdit(a)}>
                            Editar
                          </button>
                          {a.status !== 'faltou' && (
                            <button type="button" className="ghost sm" onClick={() => setStatus(a.id, 'faltou')}>
                              Marcar falta
                            </button>
                          )}
                          {a.status !== 'agendado' && (
                            <button type="button" className="ghost sm" onClick={() => setStatus(a.id, 'agendado')}>
                              Voltar para agendado
                            </button>
                          )}
                          <button type="button" className="ghost sm danger-ghost" onClick={() => askDelete(a)}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
