import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { ConfirmDialog, Modal, Toast } from '../components/Dialog.jsx';
import ImageCropModal from '../components/ImageCropModal.jsx';

export const blankClient = () => ({ name: '', phone: '', photo_url: '' });

export const normalize = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export const digitsOf = (s) => String(s || '').replace(/\D/g, '');

/** Formata enquanto digita: (11) 98765-4321 */
export function maskPhone(value) {
  const d = digitsOf(value).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function whatsappLink(phone) {
  const d = digitsOf(phone);
  return `https://wa.me/${d.length <= 11 ? `55${d}` : d}`;
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.slice(0, 2) || '?').toUpperCase();
}

export function Avatar({ client, size = 'md' }) {
  return (
    <span className={`client-avatar client-avatar-${size}`}>
      {client.photo_url ? <img src={client.photo_url} alt="" /> : initials(client.name)}
    </span>
  );
}

/**
 * Modal reutilizável de cadastro/edição de cliente (usado na aba Clientes
 * e também no botão "+" do Agendamento Manual na Agenda).
 */
export function ClientFormModal({ initialClient, onClose, onSaved, onRequestDelete }) {
  const [form, setForm] = useState(() => ({
    ...blankClient(),
    ...initialClient,
    phone: initialClient?.phone ? maskPhone(initialClient.phone) : '',
  }));
  const [formErr, setFormErr] = useState('');
  const [cropSrc, setCropSrc] = useState(null);
  const [busy, setBusy] = useState(false);

  function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCropSrc(ev.target.result);
    reader.readAsDataURL(file);
  }

  async function save(e) {
    e.preventDefault();
    setFormErr('');
    if (!form.name.trim()) return setFormErr('Informe o nome da cliente.');
    const d = digitsOf(form.phone);
    if (d.length < 10 || d.length > 11) {
      return setFormErr('Informe o telefone com DDD, por exemplo (11) 98765-4321.');
    }
    setBusy(true);
    const body = {
      name: form.name.trim(),
      phone: maskPhone(form.phone),
      photo_url: form.photo_url || '',
    };
    try {
      const saved = form.id
        ? await api.admin(`/clients/${form.id}`, { method: 'PUT', body })
        : await api.admin('/clients', { method: 'POST', body });
      onSaved?.(saved, Boolean(form.id));
    } catch (err) {
      setFormErr(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {cropSrc && (
        <ImageCropModal
          src={cropSrc}
          aspect={1}
          outputWidth={320}
          circle
          title="Ajustar foto da cliente"
          onCancel={() => setCropSrc(null)}
          onConfirm={(dataUrl) => {
            setForm((f) => ({ ...f, photo_url: dataUrl }));
            setCropSrc(null);
          }}
        />
      )}

      {!cropSrc && (
        <Modal
          title={form.id ? 'Editar cliente' : 'Adicionar cliente'}
          subtitle={form.id ? undefined : 'Nome e telefone são obrigatórios. A foto é opcional.'}
          size="sm"
          onClose={onClose}
        >
          <form onSubmit={save} className="dialog-form" noValidate>
            <div className="client-photo-field">
              <Avatar client={form} size="lg" />
              <div className="client-photo-actions">
                <label className="upload-photo-btn client-photo-btn">
                  {form.photo_url ? 'Trocar foto' : 'Adicionar foto'}
                  <input type="file" accept="image/*" onChange={handleFile} hidden />
                </label>
                {form.photo_url && (
                  <div className="client-photo-links">
                    <button type="button" className="link-btn" onClick={() => setCropSrc(form.photo_url)}>
                      Reajustar
                    </button>
                    <button type="button" className="link-btn" onClick={() => setForm({ ...form, photo_url: '' })}>
                      Remover
                    </button>
                  </div>
                )}
                {!form.photo_url && <span className="muted client-photo-hint">Opcional</span>}
              </div>
            </div>

            <label>
              Nome
              <input
                autoFocus={!form.id}
                maxLength={120}
                placeholder="Nome completo"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              Telefone (WhatsApp)
              <input
                type="tel"
                inputMode="tel"
                placeholder="(11) 98765-4321"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })}
              />
            </label>

            {formErr && <div className="msg err">{formErr}</div>}

            <div className="dialog-actions">
              {form.id && onRequestDelete && (
                <button
                  type="button"
                  className="ghost danger-ghost dialog-actions-left"
                  onClick={() => onRequestDelete(form)}
                >
                  Excluir
                </button>
              )}
              <button type="button" className="ghost" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" disabled={busy}>
                {busy ? 'Salvando...' : form.id ? 'Salvar alterações' : 'Adicionar'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    try {
      setClients(await api.admin('/clients'));
    } catch (e) {
      setToast({ err: e.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const closeToast = useCallback(() => setToast(null), []);

  const groups = useMemo(() => {
    const q = normalize(search.trim());
    const qDigits = digitsOf(search);
    const list = clients
      .filter((c) => !q || normalize(c.name).includes(q) || (qDigits.length >= 3 && digitsOf(c.phone).includes(qDigits)))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
    const map = new Map();
    for (const c of list) {
      const letter = normalize(c.name).charAt(0).toUpperCase();
      const key = /[A-Z]/.test(letter) ? letter : '#';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    }
    return [...map.entries()];
  }, [clients, search]);

  const resultCount = groups.reduce((acc, [, list]) => acc + list.length, 0);

  async function remove() {
    setBusy(true);
    try {
      await api.admin(`/clients/${confirmDelete.id}`, { method: 'DELETE' });
      setToast({ ok: `${confirmDelete.name} foi removida da lista.` });
      setConfirmDelete(null);
      setForm(null);
      await load();
    } catch (err) {
      setToast({ err: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="step-screen">
      <Toast toast={toast} onClose={closeToast} />

      <div className="clients-head">
        <div>
          <h2>Clientes</h2>
          <p className="muted">
            {clients.length === 0
              ? 'Nenhuma cliente cadastrada ainda.'
              : `${clients.length} ${clients.length === 1 ? 'cliente cadastrada' : 'clientes cadastradas'}`}
          </p>
        </div>
        <button type="button" onClick={() => setForm(blankClient())}>
          Adicionar cliente
        </button>
      </div>

      <div className="service-search-wrap clients-search">
        <svg className="service-search-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          className="service-search-input"
          placeholder="Pesquisar cliente por nome ou telefone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card clients-card">
        {loading ? (
          <p className="muted clients-empty">Carregando clientes...</p>
        ) : clients.length === 0 ? (
          <div className="clients-empty">
            <h3>Sua lista de clientes está vazia</h3>
            <p className="muted">Cadastre suas clientes para ter nome, WhatsApp e foto sempre à mão.</p>
            <button type="button" onClick={() => setForm(blankClient())}>Adicionar primeira cliente</button>
          </div>
        ) : resultCount === 0 ? (
          <p className="muted clients-empty">Nenhuma cliente encontrada para "{search}".</p>
        ) : (
          <>
            <div className="clients-table-head" aria-hidden="true">
              <span>Cliente</span>
              <span>WhatsApp</span>
              <span />
            </div>
            {groups.map(([letter, list]) => (
              <div key={letter} className="clients-group">
                <div className="clients-letter">{letter}</div>
                <ul>
                  {list.map((c) => (
                    <li key={c.id} className="client-row">
                      <div className="client-main">
                        <Avatar client={c} />
                        <span className="client-name">{c.name}</span>
                      </div>
                      <a
                        className="client-phone num"
                        href={whatsappLink(c.phone)}
                        target="_blank"
                        rel="noreferrer"
                        title="Abrir conversa no WhatsApp"
                      >
                        {maskPhone(c.phone) || c.phone}
                      </a>
                      <button
                        type="button"
                        className="icon-btn"
                        title="Editar cliente"
                        aria-label={`Editar ${c.name}`}
                        onClick={() => setForm(c)}
                      >
                        <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M13.5 3.5l3 3L7 16H4v-3l9.5-9.5z" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        )}
      </div>

      {form && (
        <ClientFormModal
          initialClient={form}
          onClose={() => setForm(null)}
          onRequestDelete={(c) => setConfirmDelete(c)}
          onSaved={async (saved, isEdit) => {
            setForm(null);
            setToast({
              ok: isEdit ? 'Dados da cliente atualizados.' : `${saved.name} adicionada às clientes.`,
            });
            await load();
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          tone="danger"
          busy={busy}
          title={`Excluir ${confirmDelete.name}?`}
          message="A cliente será removida da sua lista. Os agendamentos já feitos não são alterados."
          confirmLabel="Sim, excluir"
          cancelLabel="Cancelar"
          onConfirm={remove}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
