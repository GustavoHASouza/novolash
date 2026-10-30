import { useState } from 'react';
import Login from './Login.jsx';
import Agenda from './Agenda.jsx';
import Finance from './Finance.jsx';
import Settings from './Settings.jsx';

const TABS = { agenda: 'Agenda', financeiro: 'Financeiro', config: 'Serviços e horários' };

export default function Admin() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [tab, setTab] = useState('agenda');

  if (!token) {
    return <Login onLogin={(t) => { localStorage.setItem('token', t); setToken(t); }} />;
  }
  return (
    <div className="wrap">
      <div className="row between">
        <h1>Painel</h1>
        <button className="ghost sm" onClick={() => { localStorage.removeItem('token'); setToken(null); }}>Sair</button>
      </div>
      <div className="tabs">
        {Object.entries(TABS).map(([k, v]) => (
          <button key={k} className={tab === k ? '' : 'ghost'} onClick={() => setTab(k)}>{v}</button>
        ))}
      </div>
      {tab === 'agenda' && <Agenda />}
      {tab === 'financeiro' && <Finance />}
      {tab === 'config' && <Settings />}
    </div>
  );
}
