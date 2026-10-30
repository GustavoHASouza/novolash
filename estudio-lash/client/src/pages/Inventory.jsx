import { useCallback, useEffect, useState } from 'react';
import { api, money } from '../api.js';

const today = () => new Date().toLocaleDateString('en-CA');

const CATEGORIES = [
  'Fios e Caixas de Cílios',
  'Adesivos e Químicos',
  'Descartáveis',
  'Pinças e Acessórios',
  'Sobrancelhas e Henna',
  'Outros',
];

const UNITS = [
  { value: 'cx', label: 'Caixas (cx)' },
  { value: 'un', label: 'Unidades (un)' },
  { value: 'pct', label: 'Pacotes (pct)' },
  { value: 'fr', label: 'Frascos (fr)' },
  { value: 'par', label: 'Pares (par)' },
];

const blankNewItem = () => ({
  name: '',
  category: 'Fios e Caixas de Cílios',
  description: '',
  unit: 'cx',
  quantity: 1,
  min_quantity: 1,
  cost: '',
  occurred_on: today(),
});

export default function Inventory() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [openAddModal, setOpenAddModal] = useState(false);
  const [newItem, setNewItem] = useState(blankNewItem());
  const [restockItem, setRestockItem] = useState(null);
  const [restockForm, setRestockForm] = useState({
    quantity: 1,
    cost: '',
    occurred_on: today(),
  });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await api.admin('/inventory');
      setItems(list);
    } catch (e) {
      setMsg({ err: e.message });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreateItem(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api.admin('/inventory', {
        method: 'POST',
        body: newItem,
      });
      const hasCost = Number(newItem.cost) > 0;
      setMsg({
        ok: hasCost
          ? `Item "${newItem.name}" adicionado ao estoque e despesa de ${money(
              Math.round(Number(newItem.cost) * 100)
            )} registrada no Financeiro.`
          : `Item "${newItem.name}" adicionado ao estoque.`,
      });
      setNewItem(blankNewItem());
      setOpenAddModal(false);
      load();
    } catch (err) {
      setMsg({ err: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function handleRestockSubmit(e) {
    e.preventDefault();
    if (!restockItem) return;
    setBusy(true);
    setMsg(null);
    try {
      await api.admin(`/inventory/${restockItem.id}/movements`, {
        method: 'POST',
        body: {
          type: 'entrada',
          quantity: Number(restockForm.quantity),
          cost: restockForm.cost,
          occurred_on: restockForm.occurred_on,
        },
      });
      const hasCost = Number(restockForm.cost) > 0;
      setMsg({
        ok: hasCost
          ? `Entrada de +${restockForm.quantity} ${restockItem.unit} em "${
              restockItem.name
            }" registrada e lançada nas despesas do Financeiro (${money(
              Math.round(Number(restockForm.cost) * 100)
            )}).`
          : `Entrada de +${restockForm.quantity} ${restockItem.unit} em "${restockItem.name}" registrada.`,
      });
      setRestockItem(null);
      load();
    } catch (err) {
      setMsg({ err: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function handleConsumeOne(item) {
    if (item.quantity <= 0) return;
    setMsg(null);
    try {
      await api.admin(`/inventory/${item.id}/movements`, {
        method: 'POST',
        body: { type: 'saida', quantity: 1, occurred_on: today() },
      });
      load();
    } catch (err) {
      setMsg({ err: err.message });
    }
  }

  async function handleDeleteItem(item) {
    if (!confirm(`Deseja remover "${item.name}" da lista de estoque?`)) return;
    setMsg(null);
    try {
      await api.admin(`/inventory/${item.id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setMsg({ err: err.message });
    }
  }

  const filtered = items.filter((i) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      i.name.toLowerCase().includes(q) ||
      i.category.toLowerCase().includes(q) ||
      i.description.toLowerCase().includes(q)
    );
  });

  const totalUnits = items.reduce((acc, i) => acc + Number(i.quantity || 0), 0);
  const lowStockCount = items.filter((i) => i.quantity <= i.min_quantity).length;
  const totalInvestedCents = items.reduce(
    (acc, i) => acc + Number(i.invested_cents || 0),
    0
  );

  return (
    <div className="step-screen">
      {msg?.ok && <div className="msg ok">{msg.ok}</div>}
      {msg?.err && <div className="msg err">{msg.err}</div>}

      {/* Resumo do Estoque */}
      <div className="stats">
        <div className="stat">
          <span className="muted">Materiais Cadastrados</span>
          <b>{items.length} itens ({totalUnits} un/cx)</b>
        </div>
        <div className="stat">
          <span className="muted">Estoque Baixo / Reposição</span>
          <b className={lowStockCount > 0 ? 'neg' : 'pos'}>
            {lowStockCount} {lowStockCount === 1 ? 'material' : 'materiais'}
          </b>
        </div>
        <div className="stat">
          <span className="muted">Total Investido em Compras</span>
          <b>{money(totalInvestedCents)}</b>
        </div>
      </div>

      {/* Barra de ações e busca */}
      <div className="inventory-toolbar">
        <div className="service-search-wrap" style={{ marginBottom: 0, flex: 1 }}>
          <svg
            className="service-search-icon"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            className="service-search-input"
            placeholder="Filtrar materiais por nome, volume ou categoria"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <button
          type="button"
          onClick={() => {
            setOpenAddModal(!openAddModal);
            setRestockItem(null);
          }}
        >
          {openAddModal ? 'Fechar cadastro' : 'Adicionar itens ao estoque'}
        </button>
      </div>

      {/* Formulário: Adicionar novo material + integração Financeiro */}
      {openAddModal && (
        <form className="card" onSubmit={handleCreateItem} style={{ marginTop: 16 }}>
          <h3>Adicionar Material ao Estoque</h3>
          <p className="muted" style={{ marginBottom: 16 }}>
            Ao informar o valor total pago, o lançamento entra automaticamente como Despesa de Material no Financeiro.
          </p>

          <div className="grid">
            <label>
              Material / Descrição principal
              <input
                required
                placeholder="Ex.: Caixa de Cílios 0.07 D Mix"
                value={newItem.name}
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              />
            </label>

            <label>
              Categoria
              <input
                list="inv-cats"
                required
                value={newItem.category}
                onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
              />
              <datalist id="inv-cats">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>

            <label>
              Especificações / Detalhes (opcional)
              <input
                placeholder="Ex.: Curvatura D, 8-14mm, marca..."
                value={newItem.description}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
              />
            </label>

            <label>
              Unidade
              <select
                value={newItem.unit}
                onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
              >
                {UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Quantidade inicial
              <input
                type="number"
                min="0"
                required
                value={newItem.quantity}
                onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
              />
            </label>

            <label>
              Alerta de estoque mínimo
              <input
                type="number"
                min="0"
                required
                value={newItem.min_quantity}
                onChange={(e) => setNewItem({ ...newItem, min_quantity: e.target.value })}
              />
            </label>

            <label>
              Valor total pago (R$ — integra ao Financeiro)
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00 (opcional)"
                value={newItem.cost}
                onChange={(e) => setNewItem({ ...newItem, cost: e.target.value })}
              />
            </label>

            <label>
              Data da compra
              <input
                type="date"
                required
                value={newItem.occurred_on}
                onChange={(e) => setNewItem({ ...newItem, occurred_on: e.target.value })}
              />
            </label>
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <button type="submit" disabled={busy}>
              {busy ? 'Salvando...' : 'Salvar no estoque e lançar despesa'}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => setOpenAddModal(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Modal/Card de Reposição de um item já existente */}
      {restockItem && (
        <form className="card" onSubmit={handleRestockSubmit} style={{ marginTop: 16 }}>
          <h3>Repor Estoque: {restockItem.name}</h3>
          <p className="muted" style={{ marginBottom: 16 }}>
            Estoque atual: <strong>{restockItem.quantity} {restockItem.unit}</strong>. O valor informado abaixo será somado automaticamente às despesas do Financeiro.
          </p>

          <div className="grid">
            <label>
              Quantidade comprada ({restockItem.unit})
              <input
                type="number"
                min="1"
                required
                value={restockForm.quantity}
                onChange={(e) =>
                  setRestockForm({ ...restockForm, quantity: e.target.value })
                }
              />
            </label>

            <label>
              Valor total pago na compra (R$)
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={restockForm.cost}
                onChange={(e) =>
                  setRestockForm({ ...restockForm, cost: e.target.value })
                }
              />
            </label>

            <label>
              Data da compra
              <input
                type="date"
                required
                value={restockForm.occurred_on}
                onChange={(e) =>
                  setRestockForm({ ...restockForm, occurred_on: e.target.value })
                }
              />
            </label>
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <button type="submit" disabled={busy}>
              {busy ? 'Registrando...' : 'Confirmar entrada e lançar no Financeiro'}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => setRestockItem(null)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Lista de Materiais em Estoque (sem fotos, foco em descrição e quantidades) */}
      <div className="card" style={{ marginTop: 16 }}>
        <h2>Materiais em Estoque</h2>
        <p className="muted" style={{ marginBottom: 16 }}>
          Controle de caixas de cílios por volume/curvatura, colas, removedores e descartáveis.
        </p>

        {filtered.length === 0 ? (
          <p className="muted">Nenhum material encontrado.</p>
        ) : (
          <div className="inventory-list">
            {filtered.map((item) => {
              const isLow = item.quantity <= item.min_quantity;
              return (
                <div key={item.id} className="inventory-row">
                  <div className="inventory-info">
                    <div className="inventory-title-line">
                      <strong>{item.name}</strong>
                      <span className="inventory-cat-tag">{item.category}</span>
                      {isLow && (
                        <span className="badge faltou">Repor estoque</span>
                      )}
                    </div>
                    {item.description && (
                      <div className="muted" style={{ fontSize: '0.84rem' }}>
                        {item.description}
                      </div>
                    )}
                  </div>

                  <div className="inventory-qty-box">
                    <span className={`inventory-qty-num ${isLow ? 'neg' : ''}`}>
                      {item.quantity}
                    </span>
                    <span className="inventory-qty-unit">{item.unit}</span>
                  </div>

                  <div className="inventory-actions">
                    <button
                      type="button"
                      className="sm"
                      onClick={() => {
                        setOpenAddModal(false);
                        setRestockItem(item);
                        setRestockForm({
                          quantity: 1,
                          cost: '',
                          occurred_on: today(),
                        });
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    >
                      + Adicionar / Comprar
                    </button>
                    <button
                      type="button"
                      className="ghost sm"
                      disabled={item.quantity <= 0}
                      onClick={() => handleConsumeOne(item)}
                      title="Dar baixa de 1 unidade utilizada"
                    >
                      − 1 {item.unit}
                    </button>
                    <button
                      type="button"
                      className="ghost sm"
                      onClick={() => handleDeleteItem(item)}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
