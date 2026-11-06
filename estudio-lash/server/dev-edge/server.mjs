// Servidor local que executa exatamente a mesma Edge Function de produção
// (supabase/functions/api/index.ts) no Node, para testar sem fazer deploy.
//
// Uso:  cd server  &&  npm run dev:api      ->  http://localhost:54321/api
import 'dotenv/config';
import http from 'node:http';
import { register } from 'node:module';

register('./loader.mjs', import.meta.url);

process.env.SUPABASE_DB_URL ||= process.env.DATABASE_URL;
process.env.APP_JWT_SECRET ||= process.env.JWT_SECRET;

let handler = null;
globalThis.Deno = {
  env: { get: (key) => process.env[key] },
  serve: (fn) => {
    handler = fn;
  },
};

await import('../../supabase/functions/api/index.ts');
if (!handler) throw new Error('A Edge Function não registrou um handler via Deno.serve');

const PORT = Number(process.env.EDGE_PORT) || 54321;

http
  .createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const hasBody = !['GET', 'HEAD'].includes(req.method) && chunks.length > 0;
      const request = new Request(`http://localhost:${PORT}${req.url}`, {
        method: req.method,
        headers: req.headers,
        body: hasBody ? Buffer.concat(chunks) : undefined,
      });
      const response = await handler(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (err) {
      console.error(err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Erro interno do servidor local' }));
    }
  })
  .listen(PORT, () => console.log(`API local (Edge Function) em http://localhost:${PORT}/api`));
