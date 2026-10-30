import pg from "npm:pg@8.12.0";
import jwt from "npm:jsonwebtoken@9.0.2";

const pool = new pg.Pool({ connectionString: Deno.env.get("SUPABASE_DB_URL") });
const q = (text: string, params?: unknown[]) => pool.query(text, params);

const OFFSET = "-03:00";
const STEP_MIN = 30;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const STATUSES = ["agendado", "concluido", "cancelado", "faltou"];
const JWT_SECRET = Deno.env.get("APP_JWT_SECRET") || "novolash_jwt_secret_key_2026_super_secure";
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") || "admin@novolash.com";
const DEFAULT_PASSWORD = Deno.env.get("ADMIN_PASSWORD") || "novolash123";

const offMs = -3 * 60 * 60000;
const toInstant = (date: string, time: string) => new Date(`${date}T${time}:00${OFFSET}`);
const localDate = (d: Date) => new Date(d.getTime() + offMs).toISOString().slice(0, 10);
const todayLocal = () => localDate(new Date());
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const fmt = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const toCents = (v: unknown) => Math.round(Number(v || 0) * 100);

/* ---------- Senha (PBKDF2) ---------- */
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
  return new Uint8Array(bits);
}

async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 100000;
  return `pbkdf2$${iterations}$${b64(salt)}$${b64(await derive(password, salt, iterations))}`;
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function sameText(a: string, b: string) {
  return sameBytes(new TextEncoder().encode(a), new TextEncoder().encode(b));
}

async function checkPassword(password: string) {
  const { rows: [s] } = await q("SELECT password_hash FROM public.studio_settings WHERE id = 1");
  const stored: string | null = s?.password_hash || null;
  if (!stored) return sameText(password, DEFAULT_PASSWORD);
  const [, iter, salt, hash] = stored.split("$");
  return sameBytes(await derive(password, unb64(salt), Number(iter)), unb64(hash));
}

/* ---------- Agenda ---------- */
async function slotsFor(date: string, durationMin: number) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const { rows: [h] } = await q(
    `SELECT is_open, to_char(open_time,'HH24:MI') AS open_time, to_char(close_time,'HH24:MI') AS close_time
     FROM public.business_hours WHERE weekday = $1`, [weekday]);
  if (!h?.is_open) return [];

  const dayStart = toInstant(date, "00:00");
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const { rows: busy } = await q(
    `SELECT starts_at, ends_at FROM public.appointments
     WHERE status = 'agendado' AND starts_at < $2 AND ends_at > $1`, [dayStart, dayEnd]);

  const now = new Date();
  const out: string[] = [];
  for (let m = toMin(h.open_time); m + durationMin <= toMin(h.close_time); m += STEP_MIN) {
    const s = toInstant(date, fmt(m));
    const e = new Date(s.getTime() + durationMin * 60000);
    if (s <= now) continue;
    if (busy.some((b: any) => s < new Date(b.ends_at) && e > new Date(b.starts_at))) continue;
    out.push(fmt(m));
  }
  return out;
}

async function book(b: any, { force = false } = {}): Promise<[number, unknown]> {
  const { date, time, name, phone, email, notes } = b || {};
  const serviceId = Number(b?.serviceId) || 0;
  if (!name?.trim() || !phone?.trim() || !DATE.test(date || "") || !TIME.test(time || "")) {
    return [400, { error: "Preencha nome, telefone, data e horário" }];
  }
  const { rows: [svc] } = await q(
    "SELECT duration_min FROM public.services WHERE id = $1 AND active", [serviceId]);
  if (!svc) return [404, { error: "Serviço não encontrado" }];

  const start = toInstant(date, time);
  if (isNaN(start.getTime())) return [400, { error: "Data inválida" }];
  if (!force && !(await slotsFor(date, svc.duration_min)).includes(time)) {
    return [409, { error: "Este horário não está mais disponível" }];
  }
  const end = new Date(start.getTime() + svc.duration_min * 60000);
  try {
    const { rows: [a] } = await q(
      `INSERT INTO public.appointments (service_id, client_name, client_phone, client_email, notes, starts_at, ends_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, starts_at, ends_at`,
      [serviceId, name.trim(), phone.trim(), email?.trim() || null, notes?.trim() || null, start, end]);
    return [201, a];
  } catch (e: any) {
    if (e.code === "23P01") return [409, { error: "Este horário não está mais disponível" }];
    throw e;
  }
}

/* ---------- HTTP ---------- */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
const bad = (msg = "Dados inválidos") => json({ error: msg }, 400);

const serviceValues = (b: any) => {
  const name = b?.name?.trim();
  const dur = parseInt(b?.duration_min, 10);
  const price = toCents(b?.price);
  if (!name || !(dur > 0) || !(price >= 0)) return null;
  return [name, b.description?.trim() || "", dur, price, b.active !== false, b.image_url?.trim() || ""];
};

const itemValues = (b: any) => {
  const name = b?.name?.trim();
  const min = parseInt(b?.min_quantity ?? 0, 10);
  if (!name || !(min >= 0)) return null;
  return [name, b.category?.trim() || "Outros", b.description?.trim() || "", b.unit?.trim() || "un", min];
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let path = url.pathname.replace(/^\/functions\/v1\/api/, "").replace(/^\/api/, "");
    if (!path.startsWith("/")) path = "/" + path;
    const method = req.method;
    const body: any = ["POST", "PUT", "PATCH"].includes(method)
      ? await req.json().catch(() => ({}))
      : {};

    /* ----- Rotas públicas ----- */
    if (path === "/health") return json({ ok: true });

    if (path === "/settings" && method === "GET") {
      const { rows: [s] } = await q(
        "SELECT studio_name, avatar_url FROM public.studio_settings WHERE id = 1");
      return json(s || { studio_name: "Novolash Studio", avatar_url: "" });
    }

    if (path === "/auth/login" && method === "POST") {
      const { email = "", password = "" } = body;
      const ok = sameText(String(email).trim().toLowerCase(), ADMIN_EMAIL.toLowerCase()) &&
        await checkPassword(String(password));
      if (!ok) return json({ error: "E-mail ou senha inválidos" }, 401);
      return json({ token: jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "12h" }) });
    }

    if (path === "/services" && method === "GET") {
      const { rows } = await q(
        `SELECT id, name, description, duration_min, price_cents, image_url
         FROM public.services WHERE active ORDER BY price_cents DESC`);
      return json(rows);
    }

    if (path === "/availability" && method === "GET") {
      const date = url.searchParams.get("date") || "";
      const serviceId = Number(url.searchParams.get("serviceId")) || 0;
      if (!DATE.test(date)) return bad("Data inválida");
      const { rows: [svc] } = await q(
        "SELECT duration_min FROM public.services WHERE id = $1 AND active", [serviceId]);
      if (!svc) return json({ error: "Serviço não encontrado" }, 404);
      return json({ slots: await slotsFor(date, svc.duration_min) });
    }

    if (path === "/appointments" && method === "POST") {
      const [code, resBody] = await book(body);
      return json(resBody, code);
    }

    if (!path.startsWith("/admin")) return json({ error: "Rota não encontrada" }, 404);

    /* ----- Rotas da profissional ----- */
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    try {
      jwt.verify(token, JWT_SECRET);
    } catch {
      return json({ error: "Não autorizado" }, 401);
    }
    const sub = path.replace(/^\/admin/, "") || "/";
    let m: RegExpMatchArray | null;

    // Conta
    if (sub === "/settings" && method === "GET") {
      const { rows: [s] } = await q(
        "SELECT studio_name, avatar_url FROM public.studio_settings WHERE id = 1");
      return json({ ...s, email: ADMIN_EMAIL });
    }

    if (sub === "/settings" && method === "PUT") {
      const name = String(body.studio_name || "").trim();
      if (!name || name.length > 80) return bad("Informe um nome de estúdio válido");
      const avatar = String(body.avatar_url || "");
      const { rows: [s] } = await q(
        `UPDATE public.studio_settings SET studio_name = $1, avatar_url = $2, updated_at = now()
         WHERE id = 1 RETURNING studio_name, avatar_url`, [name, avatar]);
      return json(s);
    }

    if (sub === "/password" && method === "PUT") {
      const current = String(body.current || "");
      const next = String(body.next || "");
      if (!(await checkPassword(current))) return bad("Senha atual incorreta");
      if (next.length < 8) return bad("A nova senha deve ter pelo menos 8 caracteres");
      await q("UPDATE public.studio_settings SET password_hash = $1, updated_at = now() WHERE id = 1",
        [await hashPassword(next)]);
      return json({ ok: true });
    }

    // Agenda
    if (sub === "/appointments" && method === "GET") {
      const from = url.searchParams.get("from") || "";
      const to = url.searchParams.get("to") || "";
      if (!DATE.test(from) || !DATE.test(to)) return bad();
      const start = toInstant(from, "00:00");
      const end = new Date(toInstant(to, "00:00").getTime() + 86400000);
      const { rows } = await q(
        `SELECT a.id, a.client_name, a.client_phone, a.client_email, a.notes, a.status,
                a.starts_at, a.ends_at, s.name AS service, s.price_cents
         FROM public.appointments a JOIN public.services s ON s.id = a.service_id
         WHERE a.starts_at >= $1 AND a.starts_at < $2
         ORDER BY a.starts_at`, [start, end]);
      return json(rows);
    }

    if (sub === "/appointments" && method === "POST") {
      const [code, resBody] = await book(body, { force: true });
      return json(resBody, code);
    }

    if ((m = sub.match(/^\/appointments\/(\d+)$/)) && method === "PATCH") {
      const { status } = body;
      if (!STATUSES.includes(status)) return bad();
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const { rows: [a] } = await c.query(
          `UPDATE public.appointments SET status = $1 WHERE id = $2
           RETURNING id, client_name, service_id, starts_at`, [status, Number(m[1])]);
        if (!a) {
          await c.query("ROLLBACK");
          return json({ error: "Agendamento não encontrado" }, 404);
        }
        await c.query("DELETE FROM public.transactions WHERE appointment_id = $1", [a.id]);
        if (status === "concluido") {
          await c.query(
            `INSERT INTO public.transactions (type, description, category, amount_cents, occurred_on, appointment_id)
             SELECT 'receita', $2::text || ' — ' || s.name, 'Atendimentos', s.price_cents, $3::date, $1
             FROM public.services s WHERE s.id = $4 AND s.price_cents > 0`,
            [a.id, a.client_name, localDate(new Date(a.starts_at)), a.service_id]);
        }
        await c.query("COMMIT");
        return json({ ok: true });
      } catch (e: any) {
        await c.query("ROLLBACK");
        if (e.code === "23P01") return json({ error: "Conflita com outro horário agendado" }, 409);
        throw e;
      } finally {
        c.release();
      }
    }

    // Serviços
    if (sub === "/services" && method === "GET") {
      return json((await q("SELECT * FROM public.services ORDER BY active DESC, id")).rows);
    }

    if (sub === "/services" && method === "POST") {
      const v = serviceValues(body);
      if (!v) return bad();
      const { rows: [s] } = await q(
        `INSERT INTO public.services (name, description, duration_min, price_cents, active, image_url)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, v);
      return json(s, 201);
    }

    if ((m = sub.match(/^\/services\/(\d+)$/)) && method === "PUT") {
      const v = serviceValues(body);
      if (!v) return bad();
      const { rows: [s] } = await q(
        `UPDATE public.services SET name=$1, description=$2, duration_min=$3, price_cents=$4, active=$5, image_url=$6
         WHERE id=$7 RETURNING *`, [...v, Number(m[1])]);
      if (!s) return json({ error: "Serviço não encontrado" }, 404);
      return json(s);
    }

    // Horários
    if (sub === "/hours" && method === "GET") {
      const { rows } = await q(
        `SELECT weekday, is_open, to_char(open_time,'HH24:MI') AS open_time,
                to_char(close_time,'HH24:MI') AS close_time
         FROM public.business_hours ORDER BY weekday`);
      return json(rows);
    }

    if (sub === "/hours" && method === "PUT") {
      const list = body;
      const valid = Array.isArray(list) && list.length === 7 && list.every((h: any) =>
        Number.isInteger(h.weekday) && TIME.test(h.open_time) && TIME.test(h.close_time) &&
        h.close_time > h.open_time);
      if (!valid) return bad("Horários inválidos");
      for (const h of list) {
        await q("UPDATE public.business_hours SET is_open=$2, open_time=$3, close_time=$4 WHERE weekday=$1",
          [h.weekday, !!h.is_open, h.open_time, h.close_time]);
      }
      return json({ ok: true });
    }

    // Financeiro
    if (sub === "/transactions" && method === "GET") {
      const month = url.searchParams.get("month") || "";
      if (!MONTH.test(month)) return bad();
      const { rows } = await q(
        `SELECT id, type, description, category, amount_cents, occurred_on::text AS occurred_on, appointment_id
         FROM public.transactions WHERE to_char(occurred_on,'YYYY-MM') = $1
         ORDER BY occurred_on DESC, id DESC`, [month]);
      return json(rows);
    }

    if (sub === "/transactions" && method === "POST") {
      const { type, description, category, amount, occurred_on } = body;
      const cents = toCents(amount);
      if (!["receita", "despesa"].includes(type) || !description?.trim() || !(cents > 0) ||
        !DATE.test(occurred_on || "")) return bad();
      const { rows: [t] } = await q(
        `INSERT INTO public.transactions (type, description, category, amount_cents, occurred_on)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [type, description.trim(), category?.trim() || "Outros", cents, occurred_on]);
      return json(t, 201);
    }

    if ((m = sub.match(/^\/transactions\/(\d+)$/)) && method === "DELETE") {
      await q("DELETE FROM public.transactions WHERE id = $1", [Number(m[1])]);
      return json({ ok: true });
    }

    if (sub === "/summary" && method === "GET") {
      const month = url.searchParams.get("month") || "";
      if (!MONTH.test(month)) return bad();
      const { rows } = await q(
        `SELECT type, category, SUM(amount_cents)::int AS total
         FROM public.transactions WHERE to_char(occurred_on,'YYYY-MM') = $1
         GROUP BY type, category ORDER BY total DESC`, [month]);
      const sum = (t: string) =>
        rows.filter((x: any) => x.type === t).reduce((s: number, x: any) => s + x.total, 0);
      return json({ receita: sum("receita"), despesa: sum("despesa"),
        saldo: sum("receita") - sum("despesa"), categorias: rows });
    }

    // Estoque
    if (sub === "/inventory" && method === "GET") {
      const { rows } = await q(
        `SELECT i.*,
                COALESCE((SELECT SUM(cost_cents) FROM public.inventory_movements mv
                          WHERE mv.item_id = i.id AND mv.type = 'entrada'), 0)::int AS invested_cents
         FROM public.inventory_items i ORDER BY i.category, i.name`);
      return json(rows);
    }

    if (sub === "/inventory" && method === "POST") {
      const v = itemValues(body);
      const qty = parseInt(body.quantity ?? 0, 10);
      const cost = toCents(body.cost);
      const date = DATE.test(body.occurred_on || "") ? body.occurred_on : todayLocal();
      if (!v || !(qty >= 0) || !(cost >= 0)) return bad();
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const { rows: [item] } = await c.query(
          `INSERT INTO public.inventory_items (name, category, description, unit, min_quantity, quantity)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [...v, qty]);
        let txId = null;
        if (cost > 0) {
          const { rows: [t] } = await c.query(
            `INSERT INTO public.transactions (type, description, category, amount_cents, occurred_on)
             VALUES ('despesa', $1, 'Material', $2, $3) RETURNING id`,
            [`Estoque: ${item.name} (${qty} ${item.unit})`, cost, date]);
          txId = t.id;
        }
        if (qty > 0) {
          await c.query(
            `INSERT INTO public.inventory_movements (item_id, type, quantity, cost_cents, occurred_on, transaction_id)
             VALUES ($1, 'entrada', $2, $3, $4, $5)`, [item.id, qty, cost, date, txId]);
        }
        await c.query("COMMIT");
        return json(item, 201);
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
    }

    if ((m = sub.match(/^\/inventory\/(\d+)$/)) && method === "PUT") {
      const v = itemValues(body);
      if (!v) return bad();
      const { rows: [item] } = await q(
        `UPDATE public.inventory_items SET name=$1, category=$2, description=$3, unit=$4, min_quantity=$5
         WHERE id=$6 RETURNING *`, [...v, Number(m[1])]);
      if (!item) return json({ error: "Item não encontrado" }, 404);
      return json(item);
    }

    if ((m = sub.match(/^\/inventory\/(\d+)$/)) && method === "DELETE") {
      await q("DELETE FROM public.inventory_items WHERE id = $1", [Number(m[1])]);
      return json({ ok: true });
    }

    if ((m = sub.match(/^\/inventory\/(\d+)\/movements$/)) && method === "GET") {
      const { rows } = await q(
        `SELECT id, type, quantity, cost_cents, occurred_on::text AS occurred_on
         FROM public.inventory_movements WHERE item_id = $1
         ORDER BY occurred_on DESC, id DESC LIMIT 50`, [Number(m[1])]);
      return json(rows);
    }

    if ((m = sub.match(/^\/inventory\/(\d+)\/movements$/)) && method === "POST") {
      const itemId = Number(m[1]);
      const type = body.type;
      const qty = parseInt(body.quantity, 10);
      const cost = type === "entrada" ? toCents(body.cost) : 0;
      const date = DATE.test(body.occurred_on || "") ? body.occurred_on : todayLocal();
      if (!["entrada", "saida"].includes(type) || !(qty > 0) || !(cost >= 0)) return bad();
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const { rows: [item] } = await c.query(
          "SELECT * FROM public.inventory_items WHERE id = $1 FOR UPDATE", [itemId]);
        if (!item) {
          await c.query("ROLLBACK");
          return json({ error: "Item não encontrado" }, 404);
        }
        if (type === "saida" && item.quantity < qty) {
          await c.query("ROLLBACK");
          return bad(`Quantidade indisponível. Em estoque: ${item.quantity} ${item.unit}`);
        }
        let txId = null;
        if (cost > 0) {
          const { rows: [t] } = await c.query(
            `INSERT INTO public.transactions (type, description, category, amount_cents, occurred_on)
             VALUES ('despesa', $1, 'Material', $2, $3) RETURNING id`,
            [`Estoque: ${item.name} (${qty} ${item.unit})`, cost, date]);
          txId = t.id;
        }
        await c.query(
          `INSERT INTO public.inventory_movements (item_id, type, quantity, cost_cents, occurred_on, transaction_id)
           VALUES ($1,$2,$3,$4,$5,$6)`, [itemId, type, qty, cost, date, txId]);
        const { rows: [updated] } = await c.query(
          `UPDATE public.inventory_items SET quantity = quantity + $1 WHERE id = $2 RETURNING *`,
          [type === "entrada" ? qty : -qty, itemId]);
        await c.query("COMMIT");
        return json(updated);
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
    }

    return json({ error: "Rota não encontrada" }, 404);
  } catch (err) {
    console.error(err);
    return json({ error: "Erro interno do servidor" }, 500);
  }
});
