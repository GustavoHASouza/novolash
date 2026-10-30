import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';

const app = express();
const origins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim());

app.use(cors({ origin: origins }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api', publicRoutes);
app.use('/api/admin', adminRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`API rodando na porta ${port}`));
