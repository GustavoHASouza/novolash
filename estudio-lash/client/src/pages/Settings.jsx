import { useEffect, useState } from 'react';
import { api } from '../api.js';
import ImageCropModal from '../components/ImageCropModal.jsx';

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const NEW = { id: null, name: '', description: '', duration_min: 60, price_cents: 0, image_url: '', active: true };

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
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="ghost sm"
                style={{ flex: 1 }}
                onClick={() => setCropSrc(v.image_url)}
              >
                Ajustar
              </button>
              <button
                type="button"
                className="ghost sm"
                style={{ flex: 1 }}
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
              Duração (min)
              <input type="number" min="15" step="15" value={v.duration_min} onChange={set('duration_min')} />
            </label>
            <label>
              Preço (R$)
              <input type="number" min="0" step="0.01" value={v.price} onChange={set('price')} />
            </label>
          </div>

          <label style={{ marginTop: 4 }}>
            Link da foto da modelo (ou envie e ajuste no botão ao lado)
            <input
              value={v.image_url.startsWith('data:') ? '' : v.image_url}
              onChange={set('image_url')}
              placeholder={v.image_url.startsWith('data:') ? 'Foto ajustada pronta (clique em Salvar alterações)' : 'https://...'}
            />
          </label>

          <div className="row between" style={{ marginTop: 12 }}>
            <label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, textTransform: 'none', letterSpacing: 0 }}>
              <input type="checkbox" checked={v.active} onChange={set('active')} />
              Procedimento ativo (visível para clientes)
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
    }, 'Serviço salvo com sucesso');

  const setH = (i, k, val) => setHours(hours.map((h, j) => (j === i ? { ...h, [k]: val } : h)));

  return (
    <>
      {msg?.ok && <div className="msg ok">{msg.ok}</div>}
      {msg?.err && <div className="msg err">{msg.err}</div>}

      <div className="card">
        <h2>Catálogo de Serviços e Modelos</h2>
        <p className="muted" style={{ marginBottom: 16 }}>
          Gerencie os procedimentos, valores, durações e ajuste o enquadramento exato das fotos exibidas no agendamento.
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

      <div className="card">
        <h2>Horário de Funcionamento</h2>
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
        <button style={{ marginTop: 16 }} onClick={() => run(() => api.admin('/hours', { method: 'PUT', body: hours }), 'Horários salvos com sucesso')}>
          Salvar Horários
        </button>
      </div>
    </>
  );
}
