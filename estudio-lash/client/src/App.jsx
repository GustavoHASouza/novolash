import { Route, Routes } from 'react-router-dom';
import Booking from './pages/Booking.jsx';
import Admin from './pages/Admin.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Booking />} />
      <Route path="/admin" element={<Admin />} />
    </Routes>
  );
}
