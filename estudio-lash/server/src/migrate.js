import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { pool } from './db.js';

const sql = readFileSync(new URL('../sql/schema.sql', import.meta.url), 'utf8');
await pool.query(sql);
console.log('Migração concluída');
await pool.end();
