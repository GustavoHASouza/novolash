import { useCallback, useEffect, useState } from 'react';
import { api, money } from '../api.js';
import { ConfirmDialog, Modal, Toast } from '../components/Dialog.jsx';

const today = () => new Date().toLocaleDateString('en-CA');
const blank = (defaultCat = 'Material') => ({
  type: 'despesa',
  description: '',
  category: defaultCat,
  amount: '',
  occurred_on: today(),
});

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

export default function Finance() {
  const [month, setMonth] = useState(today().slice(0, 7));
  const [sum, setSum] = useState(null);
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [f, setF] = useState(blank());
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);

  // Modal de gerenciamento de categorias
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [editingCat, setEditingCat] = useState(null); // { id, name }
  const [confirmDeleteCat, setConfirmDeleteCat] = useState(null);
  const [confirmDeleteTx, setConfirmDeleteTx] = useState(null);

  const closeToast = useCallback(() => setToast(null), []);

  const load = useCallback(async () => {
    try {
      const [s, t, cats] = await Promise.all([
        api.admin(`/summary?month=${month}`),
        api.admin(`/transactions?month=${month}`),
        api.admin('/finance-categories'),
      ]);
      setSum(s);
      setRows(t);
      setCategories(cats || []);
      setF((prev) => {
        if (cats?.length && !cats.some((c) => c.name === prev.category)) {
          const fallback = cats.find((c) => c.name === 'Material')?.name || cats[0].name;
          return { ...prev, category: fallback };
        }
        return prev;
      });
    } catch (e) {
      setToast({ err: e.message });
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  async function addTransaction(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.admin('/transactions', { method: 'POST', body: f });
      const defaultCat = categories.find((c) => c.name === f.category)?.name || categories[0]?.name || 'Material';
      setF(blank(defaultCat));
      setToast({ ok: 'Lançamento registrado com sucesso.' });
      await load();
    } catch (e2) {
      setToast({ err: e2.message });
    } finally {
      setBusy(false);
    }
  }

  async function removeTransaction() {
    if (!confirmDeleteTx) return;
    setBusy(true);
    try {
      await api.admin(`/transactions/${confirmDeleteTx.id}`, { method: 'DELETE' });
      setConfirmDeleteTx(null);
      setToast({ ok: 'Lançamento excluído.' });
      await load();
    } catch (e) {
      setToast({ err: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateCategory(e) {
    e.preventDefault();
    const name = newCatName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const created = await api.admin('/finance-categories', {
        method: 'POST',
        body: { name },
      });
      setNewCatName('');
      setF((prev) => ({ ...prev, category: created.name }));
      setToast({ ok: `Categoria "${created.name}" adicionada e selecionada.` });
      await load();
    } catch (err) {
      setToast({ err: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateCategory(e) {
    e.preventDefault();
    if (!editingCat || !editingCat.name.trim()) return;
    setBusy(true);
    try {
      const oldItem = categories.find((c) => c.id === editingCat.id);
      const updated = await api.admin(`/finance-categories/${editingCat.id}`, {
        method: 'PUT',
        body: { name: editingCat.name.trim() },
      });
      if (oldItem && f.category === oldItem.name) {
        setF((prev) => ({ ...prev, category: updated.name }));
      }
      setEditingCat(null);
      setToast({ ok: `Categoria atualizada para "${updated.name}".` });
      await load();
    } catch (err) {
      setToast({ err: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteCategory() {
    if (!confirmDeleteCat) return;
    setBusy(true);
    try {
      await api.admin(`/finance-categories/${confirmDeleteCat.id}`, { method: 'DELETE' });
      setToast({ ok: `Categoria "${confirmDeleteCat.name}" removida.` });
      setConfirmDeleteCat(null);
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

      <div className="finance-month">
        <label>
          Mês de referência
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </label>
      </div>

      {sum && (
        <div className="stats">
          <div className="stat">
            <span className="muted">Receitas</span>
            <b className="pos num">{money(sum.receita)}</b>
          </div>
          <div className="stat">
            <span className="muted">Despesas</span>
            <b className="neg num">{money(sum.despesa)}</b>
          </div>
          <div className="stat">
            <span className="muted">Saldo do Mês</span>
            <b className={`num ${sum.saldo >= 0 ? 'pos' : 'neg'}`}>{money(sum.saldo)}</b>
          </div>
        </div>
      )}

      {sum?.categorias.length > 0 && (
        <div className="card">
          <h3>Resumo por Categoria</h3>
          <table>
            <tbody>
              {sum.categorias.map((c) => (
                <tr key={c.type + c.category}>
                  <td>{c.category}</td>
                  <td className="muted">{c.type}</td>
                  <td style={{ textAlign: 'right' }} className={`num ${c.type === 'receita' ? 'pos' : 'neg'}`}>
                    {money(c.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form className="card" onSubmit={addTransaction}>
        <div className="finance-form-head">
          <div>
            <h3>Novo Lançamento</h3>
            <p className="muted">
              Atendimentos marcados como "Concluído" na agenda são registrados como receita automaticamente.
            </p>
          </div>
          <button
            type="button"
            className="ghost sm"
            onClick={() => {
              setEditingCat(null);
              setCatModalOpen(true);
            }}
          >
            Gerenciar categorias
          </button>
        </div>

        <div className="grid" style={{ marginTop: 14 }}>
          <label>
            Tipo
            <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              <option value="despesa">Despesa</option>
              <option value="receita">Receita</option>
            </select>
          </label>

          <label>
            Descrição
            <input
              required
              placeholder="Descrição do lançamento"
              value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value })}
            />
          </label>

          <label>
            <span className="finance-cat-label-row">
              <span>Categoria</span>
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setEditingCat(null);
                  setCatModalOpen(true);
                }}
              >
                + Nova / Editar
              </button>
            </span>
            <select
              required
              value={f.category}
              onChange={(e) => setF({ ...f, category: e.target.value })}
            >
              {categories.length === 0 ? (
                <option value="Outros">Outros</option>
              ) : (
                categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))
              )}
            </select>
          </label>

          <label>
            Valor (R$)
            <input
              required
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={f.amount}
              onChange={(e) => setF({ ...f, amount: e.target.value })}
            />
          </label>

          <label>
            Data
            <input
              required
              type="date"
              value={f.occurred_on}
              onChange={(e) => setF({ ...f, occurred_on: e.target.value })}
            />
          </label>
        </div>

        <button type="submit" disabled={busy} style={{ marginTop: 12 }}>
          {busy ? 'Salvando...' : 'Adicionar Lançamento'}
        </button>
      </form>

      <div className="card">
        <h3>Histórico de Lançamentos</h3>
        {rows.length === 0 && <p className="muted">Nenhum lançamento neste mês.</p>}
        {rows.length > 0 && (
          <table>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td style={{ whiteSpace: 'nowrap' }} className="num">
                    {t.occurred_on.split('-').reverse().slice(0, 2).join('/')}
                  </td>
                  <td>
                    {t.description}
                    <div className="muted">{t.category}</div>
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }} className={`num ${t.type === 'receita' ? 'pos' : 'neg'}`}>
                    {t.type === 'receita' ? '+' : '−'}{money(t.amount_cents)}
                  </td>
                  <td style={{ width: 60, textAlign: 'right' }}>
                    <button
                      type="button"
                      className="ghost sm"
                      onClick={() => setConfirmDeleteTx(t)}
                      title="Excluir"
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal de Categorias do Financeiro */}
      {catModalOpen && (
        <Modal
          title="Categorias do Financeiro"
          subtitle="Adicione novas categorias ou edite o nome das categorias existentes."
          size="sm"
          onClose={() => {
            setCatModalOpen(false);
            setEditingCat(null);
          }}
        >
          <div className="dialog-form">
            <form onSubmit={handleCreateCategory} className="finance-cat-add-form">
              <input
                placeholder="Nova categoria (ex.: Equipamentos)"
                maxLength={60}
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
              />
              <button type="submit" className="sm" disabled={busy || !newCatName.trim()}>
                Adicionar
              </button>
            </form>

            <ul className="finance-cat-list">
              {categories.map((cat) => {
                const isEditing = editingCat?.id === cat.id;
                return (
                  <li key={cat.id} className="finance-cat-item">
                    {isEditing ? (
                      <form onSubmit={handleUpdateCategory} className="finance-cat-edit-row">
                        <input
                          autoFocus
                          required
                          maxLength={60}
                          value={editingCat.name}
                          onChange={(e) => setEditingCat({ ...editingCat, name: e.target.value })}
                        />
                        <button type="submit" className="sm" disabled={busy}>
                          Salvar
                        </button>
                        <button
                          type="button"
                          className="ghost sm"
                          onClick={() => setEditingCat(null)}
                        >
                          Cancelar
                        </button>
                      </form>
                    ) : (
                      <>
                        <span className="finance-cat-name">{cat.name}</span>
                        <div className="finance-cat-actions">
                          <button
                            type="button"
                            className="icon-btn"
                            title="Editar nome da categoria"
                            aria-label={`Editar ${cat.name}`}
                            onClick={() => setEditingCat({ id: cat.id, name: cat.name })}
                          >
                            <PencilIcon />
                          </button>
                          <button
                            type="button"
                            className="icon-btn danger-icon"
                            title="Excluir categoria"
                            aria-label={`Excluir ${cat.name}`}
                            onClick={() => setConfirmDeleteCat(cat)}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="dialog-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setCatModalOpen(false);
                  setEditingCat(null);
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {confirmDeleteCat && (
        <ConfirmDialog
          tone="danger"
          busy={busy}
          title={`Excluir a categoria "${confirmDeleteCat.name}"?`}
          message="A categoria será removida da lista de seleção. Os lançamentos antigos que já usavam esse nome serão preservados no histórico."
          confirmLabel="Sim, excluir"
          cancelLabel="Cancelar"
          onConfirm={handleDeleteCategory}
          onCancel={() => setConfirmDeleteCat(null)}
        />
      )}

      {confirmDeleteTx && (
        <ConfirmDialog
          tone="danger"
          busy={busy}
          title="Excluir este lançamento?"
          message={`"${confirmDeleteTx.description}" (${money(confirmDeleteTx.amount_cents)}) será excluído permanentemente.`}
          confirmLabel="Sim, excluir"
          cancelLabel="Cancelar"
          onConfirm={removeTransaction}
          onCancel={() => setConfirmDeleteTx(null)}
        />
      )}
    </div>
  );
}
