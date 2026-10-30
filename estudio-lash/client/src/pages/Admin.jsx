import { useState } from 'react';
import { Link } from 'react-router-dom';
import Login from './Login.jsx';
import Agenda from './Agenda.jsx';
import Finance from './Finance.jsx';
import Inventory from './Inventory.jsx';
import Settings from './Settings.jsx';
import Account from './Account.jsx';
import { useStudio } from '../api.js';

const TABS = {
  agenda: 'Agenda',
  financeiro: 'Financeiro',
  estoque: 'Estoque',
  config: 'Serviços e Horários',
};

function getInitials(name) {
  const parts = String(name || 'NL').trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.slice(0, 2) || 'NL').toUpperCase();
}

export default function Admin() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [tab, setTab] = useState('agenda');
  const { studioName, avatarUrl } = useStudio();

  if (!token) {
    return <Login onLogin={(t) => { localStorage.setItem('token', t); setToken(t); }} />;
  }

  return (
    <div className="admin-layout">
      <header className="admin-header">
        <div className="admin-header-inner">
          <button
            type="button"
            className={`admin-account-trigger ${tab === 'conta' ? 'active' : ''}`}
            onClick={() => setTab('conta')}
            title="Abrir configurações da conta e do estúdio"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt={studioName} className="admin-avatar-thumb" />
            ) : (
              <span className="header-monogram sm">{getInitials(studioName)}</span>
            )}
            <div className="admin-account-text">
              <span className="admin-studio-title">{studioName}</span>
              <span className="admin-account-sub">Minha conta · Editar perfil</span>
            </div>
          </button>

          <div className="row">
            <Link to="/" className="admin-logout" style={{ textDecoration: 'none' }}>
              Ver Site
            </Link>
            <button
              type="button"
              className="admin-logout"
              onClick={() => {
                localStorage.removeItem('token');
                setToken(null);
              }}
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
              type="button"
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
        {tab === 'estoque' && <Inventory />}
        {tab === 'config' && <Settings />}
        {tab === 'conta' && <Account onBack={() => setTab('agenda')} />}
      </div>
    </div>
  );
}
