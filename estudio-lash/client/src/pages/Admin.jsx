import { useState } from 'react';
import { Link } from 'react-router-dom';
import Login from './Login.jsx';
import Agenda from './Agenda.jsx';
import Finance from './Finance.jsx';
import Settings from './Settings.jsx';
import { STUDIO } from '../api.js';

const TABS = {
  agenda: 'Agenda',
  financeiro: 'Financeiro',
  config: 'Serviços e Horários',
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
          <div className="admin-brand">
            <span className="header-monogram sm">NL</span>
            <h1>{STUDIO} <span>· Painel</span></h1>
          </div>
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
          {Object.entries(TABS).map(([k, label]) => (
            <button
              key={k}
              className={tab === k ? 'active-tab' : ''}
              onClick={() => setTab(k)}
            >
              {label}
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
