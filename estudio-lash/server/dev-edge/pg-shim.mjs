// Localmente a conexão com o banco do Supabase exige SSL.
import pg from 'pg';

class Pool extends pg.Pool {
  constructor(options = {}) {
    super({ ssl: { rejectUnauthorized: false }, max: 5, ...options });
  }
}

export default Object.assign(Object.create(pg), { Pool });
