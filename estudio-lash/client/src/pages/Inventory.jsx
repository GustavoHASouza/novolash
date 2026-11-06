import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { ConfirmDialog, Modal, Toast } from '../components/Dialog.jsx';

const blankItem = (sectionId = '') => ({
  section_id: sectionId,
  name: '',
  quantity: 1,
  min_quantity: 1,
  description: '',
});

function ChevronIcon({ open }) {
  return (
    <svg
      className={`inv-chevron ${open ? 'is-open' : ''}`}
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 8l4 4 4-4" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13.5 3.5l3 3L7 16H4v-3l9.5-9.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10" />
    </svg>
  );
}

export default function Inventory() {
  const [sections, setSections] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState(null);

  // Todas as sessões iniciam minimizadas por padrão
  const [openSections, setOpenSections] = useState({});

  const [sectionForm, setSectionForm] = useState(null); // { id?, name }
  const [itemForm, setItemForm] = useState(null); // item fields + id?
  const [confirm, setConfirm] = useState(null); // { kind, target }
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.admin('/inventory');
      setSections(data.sections || []);
      setItems(data.items || []);
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

  function toggleSection(id) {
    setOpenSections((prev) => ({
      ...prev,
      [id]: !(prev[id] ?? false),
    }));
  }

  const query = search.trim().toLowerCase();
  const grouped = useMemo(
    () =>
      sections
        .map((s) => {
          const all = items.filter((i) => i.section_id === s.id);
          const sectionMatch = query && s.name.toLowerCase().includes(query);
          const list =
            !query || sectionMatch
              ? all
              : all.filter(
                  (i) =>
                    i.name.toLowerCase().includes(query) ||
                    (i.description || '').toLowerCase().includes(query)
                );
          return { ...s, all, list, visible: !query || sectionMatch || list.length > 0 };
        })
        .filter((s) => s.visible),
    [sections, items, query]
  );

  // Itens que precisam ser repostos (permanecem na lista até que a quantidade ULTRAPASSE o estoque mínimo)
  const lowItems = useMemo(
    () =>
      items
        .filter((i) => Number(i.quantity) <= Number(i.min_quantity))
        .map((i) => {
          const sec = sections.find((s) => s.id === i.section_id);
          return { ...i, sectionName: sec?.name || 'Sem sessão' };
        }),
    [items, sections]
  );

  const totalUnits = items.reduce((acc, i) => acc + Number(i.quantity || 0), 0);

  /* ---------- Sessões ---------- */
  async function saveSection(e) {
    e.preventDefault();
    setBusy(true);
    try {
      if (sectionForm.id) {
        await api.admin(`/inventory/sections/${sectionForm.id}`, {
          method: 'PUT',
          body: { name: sectionForm.name },
        });
        setToast({ ok: 'Sessão renomeada.' });
      } else {
        await api.admin('/inventory/sections', { method: 'POST', body: { name: sectionForm.name } });
        setToast({ ok: `Sessão "${sectionForm.name.trim()}" criada.` });
      }
      setSectionForm(null);
      await load();
    } catch (err) {
      setToast({ err: err.message });
    } finally {
      setBusy(false);
    }
  }

  /* ---------- Itens ---------- */
  async function saveItem(e) {
    e.preventDefault();
    setBusy(true);
    const body = {
      section_id: Number(itemForm.section_id),
      name: itemForm.name,
      quantity: Number(itemForm.quantity || 0),
      min_quantity: Number(itemForm.min_quantity || 0),
      description: itemForm.description,
    };
    try {
      if (itemForm.id) {
        await api.admin(`/inventory/${itemForm.id}`, { method: 'PUT', body });
        setToast({ ok: 'Item atualizado.' });
      } else {
        await api.admin('/inventory', { method: 'POST', body });
        setToast({ ok: `"${body.name.trim()}" adicionado ao estoque.` });
      }
      setOpenSections((prev) => ({ ...prev, [body.section_id]: true }));
      setItemForm(null);
      await load();
    } catch (err) {
      setToast({ err: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function changeQty(item, delta) {
    const next = Math.max(0, item.quantity + delta);
    if (next === item.quantity) return;
    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, quantity: next } : i)));
    try {
      const updated = await api.admin(`/inventory/${item.id}/quantity`, {
        method: 'PATCH',
        body: { delta },
      });
      setItems((list) => list.map((i) => (i.id === item.id ? { ...i, quantity: updated.quantity } : i)));
    } catch (err) {
      setToast({ err: err.message });
      load();
    }
  }

  async function runConfirm() {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === 'section') {
        await api.admin(`/inventory/sections/${confirm.target.id}`, { method: 'DELETE' });
        setToast({ ok: `Sessão "${confirm.target.name}" excluída.` });
      } else {
        await api.admin(`/inventory/${confirm.target.id}`, { method: 'DELETE' });
        setToast({ ok: `"${confirm.target.name}" removido do estoque.` });
        setItemForm(null);
      }
      setConfirm(null);
      await load();
    } catch (err) {
      setToast({ err: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="step-screen inv-view">
      <Toast toast={toast} onClose={closeToast} />

      {/* Alerta de Reposição em destaque no topo da página */}
      {lowItems.length > 0 && (
        <div className="inv-restock-banner" role="alert">
          <div className="inv-restock-head">
            <span className="inv-restock-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </span>
            <div className="inv-restock-title-wrap">
              <strong>
                Repor Estoque: {lowItems.length}{' '}
                {lowItems.length === 1 ? 'item precisa de reposição' : 'itens precisam de reposição'}
              </strong>
              <span>
                Estes materiais continuarão listados aqui até que a quantidade em estoque ultrapasse o mínimo definido:
              </span>
            </div>
          </div>

          <ul className="inv-restock-list">
            {lowItems.map((item) => (
              <li key={item.id} className="inv-restock-row">
                <div className="inv-restock-item-info">
                  <span className="inv-restock-item-name">{item.name}</span>
                  <span className="inv-restock-item-sec">{item.sectionName}</span>
                </div>

                <div className="inv-restock-item-right">
                  <span className="inv-restock-status num">
                    Atual: <b>{item.quantity} un</b> · Mínimo: <b>{item.min_quantity} un</b>
                  </span>
                  <div className="inv-stepper sm" role="group" aria-label={`Ajustar ${item.name}`}>
                    <button
                      type="button"
                      aria-label="Diminuir"
                      disabled={item.quantity <= 0}
                      onClick={() => changeQty(item, -1)}
                    >
                      −
                    </button>
                    <span className="inv-qty num">
                      <strong>{item.quantity}</strong>
                      <small>un</small>
                    </span>
                    <button
                      type="button"
                      aria-label="Aumentar"
                      onClick={() => changeQty(item, 1)}
                      title="Adicionar 1 unidade"
                    >
                      +
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="stats">
        <div className="stat">
          <span className="muted">Sessões de Estoque</span>
          <b className="num">{sections.length}</b>
        </div>
        <div className="stat">
          <span className="muted">Itens Cadastrados</span>
          <b className="num">{items.length}</b>
        </div>
        <div className="stat">
          <span className="muted">Unidades no Estoque</span>
          <b className="num">{totalUnits} un</b>
        </div>
      </div>

      <div className="inventory-toolbar">
        <div className="service-search-wrap" style={{ marginBottom: 0, flex: 1 }}>
          <svg className="service-search-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            className="service-search-input"
            placeholder="Pesquisar item ou sessão"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="inventory-toolbar-actions">
          <button type="button" className="ghost" onClick={() => setSectionForm({ name: '' })}>
            + Nova sessão
          </button>
          {sections.length > 0 && (
            <button type="button" onClick={() => setItemForm(blankItem(sections[0].id))}>
              + Adicionar item
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="card inv-empty"><p className="muted">Carregando estoque...</p></div>
      ) : sections.length === 0 ? (
        <div className="card inv-empty">
          <h3>Nenhuma sessão cadastrada</h3>
          <p className="muted">Crie sessões como "Cílios Volume Y" ou "Descartáveis" para organizar seus materiais.</p>
        </div>
      ) : grouped.length === 0 ? (
        <div className="card inv-empty"><p className="muted">Nenhum item encontrado para "{search}".</p></div>
      ) : (
        <div className="inv-sections">
          {grouped.map((s) => {
            const units = s.all.reduce((acc, i) => acc + Number(i.quantity || 0), 0);
            const secLowCount = s.all.filter((i) => Number(i.quantity) <= Number(i.min_quantity)).length;
            const isOpen = query ? (openSections[s.id] ?? true) : Boolean(openSections[s.id]);

            return (
              <section key={s.id} className={`card inv-section ${isOpen ? 'is-open' : 'is-collapsed'}`}>
                <header className="inv-section-head">
                  <button
                    type="button"
                    className="inv-section-toggle"
                    onClick={() => toggleSection(s.id)}
                    aria-expanded={isOpen}
                    title={isOpen ? `Minimizar sessão ${s.name}` : `Visualizar itens de ${s.name}`}
                  >
                    <span className="inv-toggle-icon-box">
                      <ChevronIcon open={isOpen} />
                    </span>
                    <div className="inv-section-title">
                      <div className="inv-section-title-row">
                        <h3>{s.name}</h3>
                        {secLowCount > 0 && (
                          <span className="inv-low-tag">
                            {secLowCount} {secLowCount === 1 ? 'repor' : 'repor'}
                          </span>
                        )}
                      </div>
                      <span className="inv-section-meta">
                        {s.all.length} {s.all.length === 1 ? 'item' : 'itens'} · <span className="num">{units}</span>{' '}
                        {units === 1 ? 'unidade' : 'unidades'}
                      </span>
                    </div>
                  </button>

                  <div className="inv-section-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      title="Renomear sessão"
                      aria-label={`Renomear sessão ${s.name}`}
                      onClick={() => setSectionForm({ id: s.id, name: s.name })}
                    >
                      <PencilIcon />
                    </button>
                    <button
                      type="button"
                      className="icon-btn danger-icon"
                      title="Excluir sessão"
                      aria-label={`Excluir sessão ${s.name}`}
                      onClick={() => setConfirm({ kind: 'section', target: s })}
                    >
                      <TrashIcon />
                    </button>
                    <button type="button" className="sm" onClick={() => setItemForm(blankItem(s.id))}>
                      + Item
                    </button>
                  </div>
                </header>

                {isOpen && (
                  s.list.length === 0 ? (
                    <p className="muted inv-section-empty">Nenhum item nesta sessão ainda.</p>
                  ) : (
                    <ul className="inv-items">
                      {s.list.map((item) => {
                        const low = Number(item.quantity) <= Number(item.min_quantity);
                        return (
                          <li key={item.id} className={`inv-item ${low ? 'is-low' : ''}`}>
                            <div className="inv-item-info">
                              <div className="inv-item-name">
                                <span>{item.name}</span>
                                {low && <span className="inv-low-tag">Repor estoque</span>}
                              </div>
                              {item.description && <div className="inv-item-desc">{item.description}</div>}
                            </div>

                            <div className="inv-stepper" role="group" aria-label={`Quantidade de ${item.name}`}>
                              <button
                                type="button"
                                aria-label="Diminuir"
                                disabled={item.quantity <= 0}
                                onClick={() => changeQty(item, -1)}
                              >
                                −
                              </button>
                              <span className="inv-qty num">
                                <strong>{item.quantity}</strong>
                                <small>un</small>
                              </span>
                              <button type="button" aria-label="Aumentar" onClick={() => changeQty(item, 1)}>
                                +
                              </button>
                            </div>

                            <button
                              type="button"
                              className="icon-btn"
                              title="Editar item"
                              aria-label={`Editar ${item.name}`}
                              onClick={() => setItemForm({ ...item, description: item.description || '' })}
                            >
                              <PencilIcon />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )
                )}
              </section>
            );
          })}
        </div>
      )}

      {sectionForm && (
        <Modal
          title={sectionForm.id ? 'Renomear sessão' : 'Nova sessão'}
          size="sm"
          onClose={() => setSectionForm(null)}
        >
          <form onSubmit={saveSection} className="dialog-form">
            <label>
              Nome da sessão
              <input
                autoFocus
                required
                maxLength={80}
                placeholder="Ex.: Cílios Volume Y"
                value={sectionForm.name}
                onChange={(e) => setSectionForm({ ...sectionForm, name: e.target.value })}
              />
            </label>
            <div className="dialog-actions">
              <button type="button" className="ghost" onClick={() => setSectionForm(null)}>
                Cancelar
              </button>
              <button type="submit" disabled={busy}>
                {busy ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {itemForm && (
        <Modal
          title={itemForm.id ? 'Editar item' : 'Adicionar item'}
          onClose={() => setItemForm(null)}
        >
          <form onSubmit={saveItem} className="dialog-form">
            <label>
              Sessão
              <select
                required
                value={itemForm.section_id}
                onChange={(e) => setItemForm({ ...itemForm, section_id: e.target.value })}
              >
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nome do item
              <input
                autoFocus={!itemForm.id}
                required
                maxLength={120}
                placeholder="Ex.: Volume Y - número 8"
                value={itemForm.name}
                onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
              />
            </label>
            <div className="dialog-grid-2">
              <label>
                Quantidade atual (un)
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  required
                  value={itemForm.quantity}
                  onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })}
                />
              </label>
              <label>
                Quantidade mínima (alerta de reposição)
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={itemForm.min_quantity}
                  onChange={(e) => setItemForm({ ...itemForm, min_quantity: e.target.value })}
                />
              </label>
            </div>
            <label>
              Observação (opcional)
              <input
                maxLength={300}
                placeholder="Ex.: curvatura D, espessura 0.07"
                value={itemForm.description}
                onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
              />
            </label>

            <div className="dialog-actions">
              {itemForm.id && (
                <button
                  type="button"
                  className="ghost danger-ghost dialog-actions-left"
                  onClick={() => setConfirm({ kind: 'item', target: itemForm })}
                >
                  Excluir item
                </button>
              )}
              <button type="button" className="ghost" onClick={() => setItemForm(null)}>
                Cancelar
              </button>
              <button type="submit" disabled={busy}>
                {busy ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {confirm && (
        <ConfirmDialog
          tone="danger"
          busy={busy}
          title={confirm.kind === 'section' ? `Excluir a sessão "${confirm.target.name}"?` : `Excluir "${confirm.target.name}"?`}
          message={
            confirm.kind === 'section'
              ? 'Todos os itens desta sessão também serão removidos do estoque. Essa ação não pode ser desfeita.'
              : 'O item será removido do estoque. Essa ação não pode ser desfeita.'
          }
          confirmLabel="Sim, excluir"
          cancelLabel="Cancelar"
          onConfirm={runConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
