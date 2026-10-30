import { useState } from 'react';
import { api } from '../api.js';

export default function Login({ onLogin }) {
  const [f, setF] = useState({ email: '', password: '' });
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    try {
      const { token } = await api.login(f);
      onLogin(token);
    } catch (e2) {
      setErr(e2.message);
    }
  }

  return (
    <div className="wrap" style={{ maxWidth: 380 }}>
      <form className="card" onSubmit={submit}>
        <h2>Painel da profissional</h2>
        {err && <div className="msg err">{err}</div>}
        <label>E-mail<input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label>Senha<input type="password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
        <button>Entrar</button>
      </form>
    </div>
  );
}
