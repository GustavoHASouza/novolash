import { Route, Routes, useLocation, Link } from 'react-router-dom';
import Booking from './pages/Booking.jsx';
import Admin from './pages/Admin.jsx';
import { STUDIO } from './api.js';

function PublicHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link to="/" className="header-brand">
          <span className="header-monogram">NL</span>
          <div>
            <div className="header-name">{STUDIO}</div>
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
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand">{STUDIO}</div>
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

  if (isAdmin) {
    return (
      <Routes>
        <Route path="/admin" element={<Admin />} />
      </Routes>
    );
  }

  return (
    <div className="app-layout">
      <PublicHeader />
      <main>
        <Routes>
          <Route path="/" element={<Booking />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
