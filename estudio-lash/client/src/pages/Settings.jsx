import { useEffect, useState } from 'react';
import { api } from '../api.js';
import ImageCropModal from '../components/ImageCropModal.jsx';

const DIAS = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

const INTERVAL_OPTIONS = [
  { value: 30, label: 'De 30 em 30 min', desc: 'Ex.: 09:00, 09:30, 10:00...' },
  { value: 60, label: 'De hora em hora (1h)', desc: 'Ex.: 09:00, 10:00, 11:00...' },
  { value: 90, label: 'De 1h30 em 1h30', desc: 'Ex.: 09:00, 10:30, 12:00...' },
  { value: 120, label: 'De 2 em 2 horas (2h)', desc: 'Ex.: 09:00, 11:00, 13:00...' },
];

const NEW = {
  id: null,
  name: '',
  description: '',
  duration_min: 60,
  price_cents: 0,
  image_url: '',
  active: true,
};

const DEFAULT_LASH_PHOTO =
  'https://images.unsplash.com/photo-1583001931096-959e9a1a6223?auto=format&fit=crop&w=800&q=80';

function ServiceRow({ s, onSave }) {
  const [v, setV] = useState({
    ...s,
    image_url: s.image_url || '',
    price: (s.price_cents / 100).toFixed(2),
  });
  const [cropSrc, setCropSrc] = useState(null);

  const set = (k) => (e) =>
    setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCropSrc(ev.target.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  return (
    <div className="settings-service">
      {cropSrc && (
        <ImageCropModal
          src={cropSrc}
          aspect={16 / 10}
          outputWidth={960}
          title={`Ajustar foto do procedimento${v.name ? `: ${v.name}` : ''}`}
          onCancel={() => setCropSrc(null)}
          onConfirm={(croppedDataUrl) => {
            setV((prev) => ({ ...prev, image_url: croppedDataUrl }));
            setCropSrc(null);
          }}
        />
      )}

      <div className="settings-service-layout">
        <div className="settings-photo-box">
          <div className="settings-photo-preview">
            <img
              src={v.image_url || DEFAULT_LASH_PHOTO}
              alt={v.name || 'Modelo de cílios'}
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = DEFAULT_LASH_PHOTO;
              }}
            />
          </div>
          <label className="upload-photo-btn">
            Enviar e ajustar foto
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </label>
          {v.image_url && (
            <div className="settings-photo-actions">
              <button
                type="button"
                className="ghost sm"
                onClick={() => setCropSrc(v.image_url)}
              >
                Ajustar
              </button>
              <button
                type="button"
                className="ghost sm"
                onClick={() => setV({ ...v, image_url: '' })}
              >
                Remover
              </button>
            </div>
          )}
        </div>

        <div className="settings-fields-box">
          <div className="grid">
            <label>
              Nome do procedimento
              <input value={v.name} onChange={set('name')} placeholder="Ex.: Volume Brasileiro" />
            </label>
            <label>
              Descrição
              <input value={v.description} onChange={set('description')} placeholder="Descrição breve da técnica" />
            </label>
            <label>
              Duração estimada (min)
              <input type="number" min="15" step="15" value={v.duration_min} onChange={set('duration_min')} />
            </label>
            <label>
              Preço (R$)
              <input type="number" min="0" step="0.01" value={v.price} onChange={set('price')} />
            </label>
          </div>

          <label style={{ marginTop: 4 }}>
            Link da foto da modelo (ou envie e ajuste no botão acima)
            <input
              value={v.image_url.startsWith('data:') ? '' : v.image_url}
              onChange={set('image_url')}
              placeholder={
                v.image_url.startsWith('data:')
                  ? 'Foto ajustada pronta (clique em Salvar alterações)'
                  : 'https://...'
              }
            />
          </label>

          <div className="settings-service-footer">
            <label className="checkbox-inline">
              <input type="checkbox" checked={v.active} onChange={set('active')} />
              <span>Procedimento ativo (visível para clientes)</span>
            </label>
            <button type="button" className="sm" onClick={() => onSave(v)}>
              {s.id ? 'Salvar alterações' : 'Adicionar serviço'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  const [services, setServices] = useState([]);
  const [hours, setHours] = useState([]);
  const [slotInterval, setSlotInterval] = useState(30);
  const [bulkBreakStart, setBulkBreakStart] = useState('12:00');
  const [bulkBreakEnd, setBulkBreakEnd] = useState('13:00');
  const [msg, setMsg] = useState(null);
  const [n, setN] = useState(0);

  const load = () => {
    api.admin('/services').then(setServices).catch(() => {});
    api
      .admin('/hours')
      .then((rows) => {
        if (Array.isArray(rows)) {
          setHours(
            rows.map((r) => ({
              ...r,
              has_break: Boolean(r.has_break),
              break_start: r.break_start || '12:00',
              break_end: r.break_end || '13:00',
            }))
          );
          if (rows[0]?.slot_interval_min) {
            setSlotInterval(Number(rows[0].slot_interval_min));
          }
          const withBreak = rows.find((r) => r.has_break);
          if (withBreak) {
            setBulkBreakStart(withBreak.break_start || '12:00');
            setBulkBreakEnd(withBreak.break_end || '13:00');
          }
        }
      })
      .catch(() => {});
  };

  useEffect(load, []);

  const run = async (fn, ok) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ ok });
      load();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setMsg({ err: e.message });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const saveService = (v) =>
    run(async () => {
      const opts = { method: v.id ? 'PUT' : 'POST', body: v };
      await api.admin(v.id ? `/services/${v.id}` : '/services', opts);
      if (!v.id) setN(n + 1);
    }, 'Serviço salvo com sucesso.');

  const setH = (i, k, val) =>
    setHours((prev) => prev.map((h, j) => (j === i ? { ...h, [k]: val } : h)));

  function applyBreakToAllDays(enable) {
    setHours((prev) =>
      prev.map((h) => ({
        ...h,
        has_break: enable,
        break_start: bulkBreakStart || '12:00',
        break_end: bulkBreakEnd || '13:00',
      }))
    );
  }

  function replicateDayToAll(sourceDay) {
    setHours((prev) =>
      prev.map((h) => ({
        ...h,
        open_time: sourceDay.open_time,
        close_time: sourceDay.close_time,
        has_break: sourceDay.has_break,
        break_start: sourceDay.break_start,
        break_end: sourceDay.break_end,
      }))
    );
  }

  const saveHours = () =>
    run(
      () =>
        api.admin('/hours', {
          method: 'PUT',
          body: {
            slot_interval_min: Number(slotInterval),
            hours,
          },
        }),
      'Horários de funcionamento, intervalo de almoço e grade de agendamento salvos com sucesso.'
    );

  return (
    <div className="step-screen">
      {msg?.ok && <div className="msg ok">{msg.ok}</div>}
      {msg?.err && <div className="msg err">{msg.err}</div>}

      {/* CARD 1: HORÁRIO DE FUNCIONAMENTO, INTERVALO DE ATENDIMENTOS E ALMOÇO */}
      <div className="card">
        <h2>Horário de Funcionamento e Grade de Agendamento</h2>
        <p className="muted" style={{ marginBottom: 20 }}>
          Defina o intervalo entre os horários exibidos para as clientes, configure seu horário de almoço e edite o expediente de todos os dias da semana.
        </p>

        {/* Subseção A: Intervalo entre horários disponíveis */}
        <div className="hours-config-block">
          <div className="hours-config-header">
            <h3>Intervalo de Atendimentos na Tela de Agendamento</h3>
            <p className="muted">
              Escolha de quanto em quanto tempo os horários disponíveis serão mostrados para a cliente agendar.
            </p>
          </div>

          <div className="interval-options-grid">
            {INTERVAL_OPTIONS.map((opt) => {
              const active = Number(slotInterval) === opt.value;
              return (
                <button
                  type="button"
                  key={opt.value}
                  className={`interval-option-btn ${active ? 'active' : ''}`}
                  onClick={() => setSlotInterval(opt.value)}
                >
                  <span className="interval-option-title">{opt.label}</span>
                  <span className="interval-option-desc">{opt.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Subseção B: Aplicar Intervalo de Almoço em Todos os Dias */}
        <div className="hours-config-block">
          <div className="hours-config-header">
            <h3>Intervalo de Almoço / Pausa para Todos os Dias</h3>
            <p className="muted">
              Configure um horário de almoço padrão para bloquear marcações automaticamente em todos os dias da semana (ou ajuste dia por dia abaixo).
            </p>
          </div>

          <div className="bulk-break-bar">
            <div className="bulk-break-inputs">
              <label>
                Início do almoço
                <input
                  type="time"
                  value={bulkBreakStart}
                  onChange={(e) => setBulkBreakStart(e.target.value)}
                />
              </label>
              <label>
                Fim do almoço
                <input
                  type="time"
                  value={bulkBreakEnd}
                  onChange={(e) => setBulkBreakEnd(e.target.value)}
                />
              </label>
            </div>

            <div className="bulk-break-actions">
              <button
                type="button"
                className="sm"
                onClick={() => applyBreakToAllDays(true)}
              >
                Aplicar almoço em todos os dias
              </button>
              <button
                type="button"
                className="ghost sm"
                onClick={() => applyBreakToAllDays(false)}
              >
                Remover almoço de todos os dias
              </button>
            </div>
          </div>
        </div>

        {/* Subseção C: Dias da Semana (Domingo a Sábado) */}
        <div className="hours-days-list">
          {hours.map((h, i) => (
            <div
              className={`hours-day-card ${h.is_open ? 'open' : 'closed'}`}
              key={h.weekday}
            >
              <div className="hours-day-top">
                <label className="checkbox-inline hours-day-toggle">
                  <input
                    type="checkbox"
                    checked={h.is_open}
                    onChange={(e) => setH(i, 'is_open', e.target.checked)}
                  />
                  <span className="hours-day-name">{DIAS[h.weekday]}</span>
                  <span className={`badge ${h.is_open ? 'concluido' : 'cancelado'}`}>
                    {h.is_open ? 'Aberto' : 'Fechado'}
                  </span>
                </label>

                {h.is_open && (
                  <button
                    type="button"
                    className="ghost sm"
                    onClick={() => replicateDayToAll(h)}
                    title="Copiar abertura, fechamento e almoço deste dia para todos os outros dias"
                  >
                    Replicar horários para todos os dias
                  </button>
                )}
              </div>

              {h.is_open && (
                <div className="hours-day-body">
                  <div className="hours-time-group">
                    <span className="hours-group-label">Expediente</span>
                    <div className="hours-time-pair">
                      <label>
                        Abre às
                        <input
                          type="time"
                          value={h.open_time}
                          onChange={(e) => setH(i, 'open_time', e.target.value)}
                        />
                      </label>
                      <label>
                        Fecha às
                        <input
                          type="time"
                          value={h.close_time}
                          onChange={(e) => setH(i, 'close_time', e.target.value)}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="hours-break-group">
                    <label className="checkbox-inline" style={{ marginBottom: h.has_break ? 10 : 0 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(h.has_break)}
                        onChange={(e) => setH(i, 'has_break', e.target.checked)}
                      />
                      <span>Intervalo de almoço / pausa (indisponível para agendamento)</span>
                    </label>

                    {h.has_break && (
                      <div className="hours-time-pair">
                        <label>
                          Início da pausa
                          <input
                            type="time"
                            value={h.break_start || '12:00'}
                            onChange={(e) => setH(i, 'break_start', e.target.value)}
                          />
                        </label>
                        <label>
                          Retorno às
                          <input
                            type="time"
                            value={h.break_end || '13:00'}
                            onChange={(e) => setH(i, 'break_end', e.target.value)}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="hours-save-bar">
          <button type="button" onClick={saveHours}>
            Salvar Horários e Intervalos
          </button>
        </div>
      </div>

      {/* CARD 2: CATÁLOGO DE SERVIÇOS E MODELOS */}
      <div className="card">
        <h2>Catálogo de Serviços e Modelos</h2>
        <p className="muted" style={{ marginBottom: 16 }}>
          Gerencie os procedimentos, valores e ajuste o enquadramento exato das fotos exibidas no agendamento.
        </p>
        {services.map((s) => (
          <ServiceRow
            key={s.id + '-' + s.name + s.price_cents + s.active + (s.image_url || '').slice(-20)}
            s={s}
            onSave={saveService}
          />
        ))}
        <h3 style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--line-light)' }}>
          Cadastrar Novo Serviço
        </h3>
        <ServiceRow key={`new-${n}`} s={NEW} onSave={saveService} />
      </div>
    </div>
  );
}
