import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useStudio } from '../api.js';

function getInitials(name) {
  const parts = String(name || 'NL').trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.slice(0, 2) || 'NL').toUpperCase();
}

export default function Login({ onLogin }) {
  const { studioName, avatarUrl } = useStudio();
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
          {avatarUrl ? (
            <img src={avatarUrl} alt={studioName} className="login-avatar" />
          ) : (
            <span className="header-monogram lg">{getInitials(studioName)}</span>
          )}
          <h2>Painel da Profissional</h2>
          <p>{studioName}</p>
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
            <Link to="/" className="muted" style={{ textDecoration: 'none' }}>Voltar para página de agendamento</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
