# ✨ Novolash Studio

Sistema completo de agendamento para estúdio de extensão de cílios e design de sobrancelha.

## 🌟 Funcionalidades

### Para Clientes
- 📱 Agendamento online responsivo (mobile + desktop)
- 💅 Seleção de serviços com preços e descrições
- 📅 Escolha de data e horário em tempo real
- ✅ Confirmação instantânea

### Para a Profissional (Painel Admin)
- 📋 Agenda semanal com gestão de status
- 💰 Controle financeiro (receitas e despesas)
- ⚙️ Gerenciamento de serviços e horários
- 📱 Link direto para WhatsApp do cliente

## 🚀 Deploy Rápido

### Backend (Render)
1. Faça fork ou push deste repositório no GitHub
2. Acesse [render.com](https://render.com) → New → Blueprint
3. Conecte o repositório — o `render.yaml` faz o resto
4. No dashboard do Render, configure:
   - `ADMIN_EMAIL` → seu email de login
   - `ADMIN_PASSWORD` → sua senha
   - `CORS_ORIGIN` → URL do frontend (ex: `https://novolash.vercel.app`)

### Frontend (Vercel)
1. Acesse [vercel.com](https://vercel.com) → Import Project
2. Selecione o repositório, defina `Root Directory` como `estudio-lash/client`
3. Configure a variável de ambiente:
   - `VITE_API_URL` → URL do backend no Render (ex: `https://novolash-api.onrender.com`)
   - `VITE_STUDIO_NAME` → Nome do estúdio (ex: `Novolash Studio`)

## 💻 Desenvolvimento Local

```bash
# Backend
cd estudio-lash/server
cp .env.example .env  # edite com suas configurações
npm install
npm run migrate       # cria as tabelas no PostgreSQL
npm run dev

# Frontend  
cd estudio-lash/client
cp .env.example .env
npm install
npm run dev           # abre em http://localhost:5173
```

## 🛠️ Stack

- **Frontend:** React 18 + Vite + React Router
- **Backend:** Express 5 + Node.js 20
- **Banco:** PostgreSQL (Neon / Render / local)
- **Auth:** JWT
- **Deploy:** Render (API + DB) + Vercel (Frontend)
