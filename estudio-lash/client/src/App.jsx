import { useEffect, useState } from 'react';
import { Route, Routes, useLocation, Link } from 'react-router-dom';
import Booking from './pages/Booking.jsx';
import Admin from './pages/Admin.jsx';
import { api, STUDIO, StudioContext, useStudio } from './api.js';

function getInitials(name) {
  const parts = String(name || 'NL').trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.slice(0, 2) || 'NL').toUpperCase();
}

function PublicHeader() {
  const { studioName, avatarUrl } = useStudio();
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link to="/" className="header-brand">
          {avatarUrl ? (
            <img src={avatarUrl} alt={studioName} className="header-avatar" />
          ) : (
            <span className="header-monogram">{getInitials(studioName)}</span>
          )}
          <div>
            <div className="header-name">{studioName}</div>
            <div className="header-tagline">Lash & Brow Boutique</div>
          </div>
        </Link>
        <nav className="header-nav">
          <Link to="/">Agendar</Link>
          <Link to="/admin">Área da Profissional</Link>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  const { studioName } = useStudio();
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand">{studioName}</div>
        <div className="footer-tagline">Especialistas em Extensão de Cílios & Design de Sobrancelhas</div>
        <div className="footer-divider" />
        <div className="footer-info">
          Atendimento com hora marcada · Todos os direitos reservados
        </div>
      </div>
    </footer>
  );
}

export default function App() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');
  const [studioSettings, setStudioSettingsState] = useState({
    studioName: localStorage.getItem('studio_name') || STUDIO,
    avatarUrl: localStorage.getItem('studio_avatar') || '',
  });

  const setStudioSettings = (next) => {
    setStudioSettingsState((prev) => {
      const updated = {
        studioName: next.studioName ?? next.studio_name ?? prev.studioName,
        avatarUrl: next.avatarUrl ?? next.avatar_url ?? prev.avatarUrl,
      };
      localStorage.setItem('studio_name', updated.studioName);
      localStorage.setItem('studio_avatar', updated.avatarUrl || '');
      return updated;
    });
  };

  useEffect(() => {
    api
      .settings()
      .then((s) => {
        if (s?.studio_name) {
          setStudioSettings({
            studioName: s.studio_name,
            avatarUrl: s.avatar_url || '',
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.title = `${studioSettings.studioName} — Agendamento`;
  }, [studioSettings.studioName]);

  return (
    <StudioContext.Provider
      value={{
        studioName: studioSettings.studioName,
        avatarUrl: studioSettings.avatarUrl,
        setStudioSettings,
      }}
    >
      {isAdmin ? (
        <Routes>
          <Route path="/admin" element={<Admin />} />
        </Routes>
      ) : (
        <div className="app-layout">
          <PublicHeader />
          <main>
            <Routes>
              <Route path="/" element={<Booking />} />
            </Routes>
          </main>
          <Footer />
        </div>
      )}
    </StudioContext.Provider>
  );
}
