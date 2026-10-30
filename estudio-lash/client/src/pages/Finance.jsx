import { useCallback, useEffect, useState } from 'react';
import { api, money } from '../api.js';

const today = () => new Date().toLocaleDateString('en-CA');
const CATS = ['Atendimentos', 'Material', 'Aluguel', 'Marketing', 'Impostos', 'Outros'];
const blank = () => ({ type: 'despesa', description: '', category: 'Material', amount: '', occurred_on: today() });

export default function Finance() {
  const [month, setMonth] = useState(today().slice(0, 7));
  const [sum, setSum] = useState(null);
  const [rows, setRows] = useState([]);
  const [f, setF] = useState(blank());
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([
        api.admin(`/summary?month=${month}`),
        api.admin(`/transactions?month=${month}`),
      ]);
      setSum(s); setRows(t);
    } catch (e) { setErr(e.message); }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  async function add(e) {
    e.preventDefault();
    setErr('');
    try {
      await api.admin('/transactions', { method: 'POST', body: f });
      setF(blank());
      load();
    } catch (e2) { setErr(e2.message); }
  }

  async function remove(id) {
    if (!confirm('Excluir este lançamento?')) return;
    await api.admin(`/transactions/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <>
      {err && <div className="msg err">{err}</div>}
      <label style={{ maxWidth: 200 }}>Mês<input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} /></label>

      {sum && (
        <div className="stats">
          <div className="stat"><span className="muted">Receitas</span><b className="pos">{money(sum.receita)}</b></div>
          <div className="stat"><span className="muted">Despesas</span><b className="neg">{money(sum.despesa)}</b></div>
          <div className="stat"><span className="muted">Saldo do mês</span><b className={sum.saldo >= 0 ? 'pos' : 'neg'}>{money(sum.saldo)}</b></div>
        </div>
      )}

      {sum?.categorias.length > 0 && (
        <div className="card">
          <h3>Por categoria</h3>
          <table><tbody>
            {sum.categorias.map((c) => (
              <tr key={c.type + c.category}>
                <td>{c.category}</td>
                <td className="muted">{c.type}</td>
                <td style={{ textAlign: 'right' }} className={c.type === 'receita' ? 'pos' : 'neg'}>{money(c.total)}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}

      <form className="card" onSubmit={add}>
        <h3>Novo lançamento</h3>
        <p className="muted">Atendimentos marcados como “Concluído” na agenda entram como receita automaticamente.</p>
        <div className="grid">
          <label>Tipo
            <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              <option value="despesa">Despesa</option>
              <option value="receita">Receita</option>
            </select>
          </label>
          <label>Descrição<input required value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
          <label>Categoria
            <input list="cats" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
            <datalist id="cats">{CATS.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <label>Valor (R$)<input required type="number" step="0.01" min="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>
          <label>Data<input required type="date" value={f.occurred_on} onChange={(e) => setF({ ...f, occurred_on: e.target.value })} /></label>
        </div>
        <button>Adicionar</button>
      </form>

      <div className="card">
        <h3>Lançamentos</h3>
        {rows.length === 0 && <p className="muted">Nenhum lançamento neste mês.</p>}
        <table><tbody>
          {rows.map((t) => (
            <tr key={t.id}>
              <td>{t.occurred_on.split('-').reverse().slice(0, 2).join('/')}</td>
              <td>{t.description}<div className="muted">{t.category}</div></td>
              <td style={{ textAlign: 'right' }} className={t.type === 'receita' ? 'pos' : 'neg'}>
                {t.type === 'receita' ? '+' : '−'}{money(t.amount_cents)}
              </td>
              <td><button className="ghost sm" onClick={() => remove(t.id)}>×</button></td>
            </tr>
          ))}
        </tbody></table>
      </div>
    </>
  );
}
