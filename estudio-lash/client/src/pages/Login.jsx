import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, STUDIO } from '../api.js';

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
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <span className="login-logo">✨</span>
          <h2>Painel Profissional</h2>
          <p>{STUDIO}</p>
        </div>
        {err && <div className="msg err">{err}</div>}
        <form onSubmit={submit}>
          <label>
            E-mail
            <input
              type="email"
              required
              placeholder="seu@email.com"
              value={f.email}
              onChange={(e) => setF({ ...f, email: e.target.value })}
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              required
              placeholder="••••••••"
              value={f.password}
              onChange={(e) => setF({ ...f, password: e.target.value })}
            />
          </label>
          <button type="submit" style={{ width: '100%' }}>Entrar</button>
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Link to="/" className="muted" style={{ textDecoration: 'none' }}>← Voltar para página de agendamento</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
