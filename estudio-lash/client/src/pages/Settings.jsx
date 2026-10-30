import { useEffect, useState } from 'react';
import { api } from '../api.js';

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const NEW = { id: null, name: '', description: '', duration_min: 60, price_cents: 0, image_url: '', active: true };

const DEFAULT_LASH_PHOTO =
  'https://images.unsplash.com/photo-1583001931096-959e9a1a6223?auto=format&fit=crop&w=800&q=80';

/** Redimensiona e comprime uma imagem escolhida pela profissional para salvar leve no banco */
function compressImageFile(file, maxWidth = 900, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function ServiceRow({ s, onSave }) {
  const [v, setV] = useState({
    ...s,
    image_url: s.image_url || '',
    price: (s.price_cents / 100).toFixed(2),
  });
  const [uploading, setUploading] = useState(false);

  const set = (k) => (e) =>
    setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await compressImageFile(file);
      setV((prev) => ({ ...prev, image_url: dataUrl }));
    } catch {
      alert('Não foi possível processar a imagem selecionada.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="settings-service">
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
            {uploading ? 'Carregando...' : 'Enviar foto do aparelho'}
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </label>
          {v.image_url && (
            <button
              type="button"
              className="ghost sm"
              style={{ width: '100%', marginTop: 4 }}
              onClick={() => setV({ ...v, image_url: '' })}
            >
              Remover foto
            </button>
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
            Link da foto da modelo (ou envie do aparelho ao lado)
            <input
              value={v.image_url.startsWith('data:') ? '' : v.image_url}
              onChange={set('image_url')}
              placeholder={v.image_url.startsWith('data:') ? 'Foto enviada do aparelho (clique em Salvar)' : 'https://...'}
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
          Gerencie os procedimentos, valores, durações e fotos de modelos exibidas na página de agendamento.
        </p>
        {services.map((s) => (
          <ServiceRow
            key={s.id + '-' + s.name + s.price_cents + s.active + (s.image_url || '').slice(0, 30)}
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
