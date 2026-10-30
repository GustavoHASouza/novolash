import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';

const app = express();
const rawOrigin = process.env.CORS_ORIGIN || '*';
const origins = rawOrigin === '*' ? '*' : rawOrigin.split(',').map((s) => s.trim());

app.use(cors({ origin: origins }));
app.use(express.json({ limit: '5mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api', publicRoutes);
app.use('/api/admin', adminRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

if (!process.env.VERCEL) {
  const port = process.env.PORT || 3001;
  app.listen(port, () => console.log(`API rodando na porta ${port}`));
}

export default app;
