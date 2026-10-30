# Estúdio de Cílios e Sobrancelhas — agendamento + gestão

- **client/** React (Vite) → Vercel
- **server/** Node.js (Express) + PostgreSQL → Render

## Funcionalidades
- **Clientes** (`/`): escolhem serviço, data e horário livre e confirmam o agendamento.
- **Profissional** (`/admin`, com login): agenda semanal, agendamento manual,
  concluir/cancelar/faltou, cadastro de serviços e preços, horário de funcionamento.
- **Financeiro**: receitas e despesas por mês, saldo, resumo por categoria.
  Ao marcar um atendimento como *Concluído*, a receita entra sozinha.
- Conflitos de horário são bloqueados no próprio banco (constraint de exclusão),
  então duas clientes não conseguem pegar o mesmo horário.

## Rodando localmente
```bash
# 1) banco
createdb estudio

# 2) API
cd server
cp .env.example .env      # ajuste DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD, JWT_SECRET
npm install
npm run migrate           # cria tabelas e serviços de exemplo
npm run dev               # http://localhost:3001

# 3) Front (outro terminal)
cd client
cp .env.example .env
npm install
npm run dev               # http://localhost:5173  (admin em /admin)
```

## Deploy
1. Suba esta pasta para um repositório no GitHub.
2. **Render**: *New → Blueprint* e selecione o repositório (usa o `render.yaml`).
   Preencha `ADMIN_EMAIL` e `ADMIN_PASSWORD`. Deixe `CORS_ORIGIN` para depois.
   Anote a URL da API (ex.: `https://estudio-api.onrender.com`).
3. **Vercel**: *Add New Project*, escolha o repositório e defina **Root Directory = `client`**.
   Variáveis: `VITE_API_URL` = URL da API do Render, `VITE_STUDIO_NAME` = nome do estúdio.
4. Volte no Render e defina `CORS_ORIGIN` = URL da Vercel (sem barra no final) → *Save* (redeploy automático).

## Limites dos planos gratuitos (importante)
- **Render Postgres grátis expira 30 dias após a criação** (14 dias de carência, depois os dados são apagados).
  Para uso real, faça upgrade do banco ou migre para um Postgres gratuito que não expira
  (ex.: Neon ou Supabase): basta trocar `DATABASE_URL` e rodar `npm run migrate`.
- **API grátis do Render dorme após 15 min sem uso**; o primeiro acesso pode levar cerca de 1 minuto.
- **Vercel Hobby é só para uso pessoal/não comercial.** Um estúdio que cobra por atendimento é uso
  comercial; para ficar dentro dos termos, use o plano Pro ou hospede o front como site estático
  em outro serviço (o front é só arquivos estáticos).

## Próximos passos sugeridos
Limite de tentativas no login, confirmação por WhatsApp/e-mail, bloqueio de datas (folgas/feriados)
e cancelamento pela própria cliente com link.
