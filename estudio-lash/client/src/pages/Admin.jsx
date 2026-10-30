import { useState } from 'react';
import { Link } from 'react-router-dom';
import Login from './Login.jsx';
import Agenda from './Agenda.jsx';
import Finance from './Finance.jsx';
import Settings from './Settings.jsx';
import { STUDIO } from '../api.js';

const TABS = {
  agenda: { label: 'Agenda', icon: '📅' },
  financeiro: { label: 'Financeiro', icon: '💰' },
  config: { label: 'Serviços e Horários', icon: '⚙️' },
};

export default function Admin() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [tab, setTab] = useState('agenda');

  if (!token) {
    return <Login onLogin={(t) => { localStorage.setItem('token', t); setToken(t); }} />;
  }

  return (
    <div className="admin-layout">
      <header className="admin-header">
        <div className="admin-header-inner">
          <h1><span>✨</span> {STUDIO} — Painel</h1>
          <div className="row">
            <Link to="/" className="admin-logout" style={{ textDecoration: 'none' }}>Ver Site</Link>
            <button
              className="admin-logout"
              onClick={() => { localStorage.removeItem('token'); setToken(null); }}
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <div className="admin-wrap">
        <div className="admin-tabs">
          {Object.entries(TABS).map(([k, v]) => (
            <button
              key={k}
              className={tab === k ? 'active-tab' : ''}
              onClick={() => setTab(k)}
            >
              {v.icon} {v.label}
            </button>
          ))}
        </div>

        {tab === 'agenda' && <Agenda />}
        {tab === 'financeiro' && <Finance />}
        {tab === 'config' && <Settings />}
      </div>
    </div>
  );
}
