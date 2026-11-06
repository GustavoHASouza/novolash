import pg from "npm:pg@8.12.0";
import jwt from "npm:jsonwebtoken@9.0.2";

const pool = new pg.Pool({ connectionString: Deno.env.get("SUPABASE_DB_URL") });
const q = (text: string, params?: unknown[]) => pool.query(text, params);

const OFFSET = "-03:00";
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

/* ---------- Agenda & Horários ---------- */
async function getSlotIntervalMin(): Promise<number> {
  const { rows: [st] } = await q(
    "SELECT slot_interval_min FROM public.studio_settings WHERE id = 1"
  );
  const val = Number(st?.slot_interval_min);
  return val >= 15 && val <= 240 ? val : 30;
}

async function slotsFor(date: string, _durationMin?: number) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const [hoursRes, stepMin] = await Promise.all([
    q(
      `SELECT is_open,
              to_char(open_time,'HH24:MI') AS open_time,
              to_char(close_time,'HH24:MI') AS close_time,
              has_break,
              to_char(break_start,'HH24:MI') AS break_start,
              to_char(break_end,'HH24:MI') AS break_end
       FROM public.business_hours WHERE weekday = $1`,
      [weekday]
    ),
    getSlotIntervalMin(),
  ]);
  const h = hoursRes.rows[0];
  if (!h?.is_open) return [];

  const openMin = toMin(h.open_time);
  const closeMin = toMin(h.close_time);
  const hasBreak = Boolean(h.has_break && h.break_start && h.break_end && toMin(h.break_end) > toMin(h.break_start));
  const breakStartMin = hasBreak ? toMin(h.break_start) : -1;
  const breakEndMin = hasBreak ? toMin(h.break_end) : -1;

  // Gera os horários candidatos respeitando o intervalo configurado pela profissional e o horário de almoço
  const candidates: number[] = [];
  if (hasBreak && breakStartMin > openMin && breakEndMin < closeMin) {
    for (let m = openMin; m < breakStartMin && m < closeMin; m += stepMin) {
      candidates.push(m);
    }
    for (let m = breakEndMin; m < closeMin; m += stepMin) {
      candidates.push(m);
    }
  } else {
    for (let m = openMin; m < closeMin; m += stepMin) {
      if (hasBreak && m >= breakStartMin && m < breakEndMin) continue;
      candidates.push(m);
    }
  }

  const dayStart = toInstant(date, "00:00");
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const { rows: busy } = await q(
    `SELECT starts_at, ends_at FROM public.appointments
     WHERE status = 'agendado' AND starts_at < $2 AND ends_at > $1`,
    [dayStart, dayEnd]
  );

  const now = new Date();
  const out: string[] = [];
  for (const m of candidates) {
    let endMin = m + stepMin;
    if (hasBreak && m < breakStartMin && endMin > breakStartMin) {
      endMin = breakStartMin;
    }
    if (endMin > closeMin) {
      endMin = closeMin;
    }
    const blockMin = Math.max(15, endMin - m);
    const s = toInstant(date, fmt(m));
    const e = new Date(s.getTime() + blockMin * 60000);
    if (s <= now) continue;
    if (busy.some((b: any) => s < new Date(b.ends_at) && e > new Date(b.starts_at))) continue;
    out.push(fmt(m));
  }
  return out;
}

/* ---------- Valor personalizado do atendimento ---------- */
function customPrice(raw: unknown): number | null | undefined {
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const cents = toCents(String(raw).replace(",", "."));
  return Number.isFinite(cents) && cents >= 0 ? cents : undefined;
}

/* ---------- Períodos indisponíveis ("Estarei indisponível") ---------- */
function blockRange(b: any): [Date, Date] | null {
  const { start_date, start_time, end_date, end_time } = b || {};
  if (!DATE.test(start_date || "") || !TIME.test(start_time || "") ||
    !DATE.test(end_date || "") || !TIME.test(end_time || "")) return null;
  const s = toInstant(start_date, start_time);
  const e = toInstant(end_date, end_time);
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e <= s) return null;
  return [s, e];
}

async function blockConflicts(s: Date, e: Date, ignoreId = 0) {
  const { rows: [r] } = await q(
    `SELECT COUNT(*) FILTER (WHERE kind = 'atendimento')::int AS appts,
            COUNT(*) FILTER (WHERE kind = 'bloqueio')::int AS blocks
     FROM public.appointments
     WHERE status = 'agendado' AND id <> $3 AND starts_at < $2 AND ends_at > $1`,
    [s, e, ignoreId]);
  return { appts: r?.appts || 0, blocks: r?.blocks || 0 };
}

function conflictMessage(c: { appts: number; blocks: number }) {
  if (c.appts > 0) {
    return c.appts === 1
      ? "Não é possível marcar este período como indisponível: existe 1 agendamento nessa janela de tempo."
      : `Não é possível marcar este período como indisponível: existem ${c.appts} agendamentos nessa janela de tempo.`;
  }
  return "Já existe um período indisponível cadastrado que se sobrepõe a esta janela de tempo.";
}

async function book(b: any, { force = false } = {}): Promise<[number, unknown]> {
  const { date, time, name, phone, email, notes } = b || {};
  const serviceId = Number(b?.serviceId) || 0;
  const price = force ? customPrice(b?.price) : null;
  if (price === undefined) return [400, { error: "Informe um valor válido para o atendimento" }];
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

  const stepMin = await getSlotIntervalMin();
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const { rows: [h] } = await q(
    `SELECT to_char(close_time,'HH24:MI') AS close_time,
            has_break,
            to_char(break_start,'HH24:MI') AS break_start
     FROM public.business_hours WHERE weekday = $1`,
    [weekday]
  );

  const startMin = toMin(time);
  let endMin = startMin + stepMin;
  if (!force && h) {
    const breakStartMin = h.has_break && h.break_start ? toMin(h.break_start) : -1;
    const closeMin = h.close_time ? toMin(h.close_time) : 1440;
    if (breakStartMin > 0 && startMin < breakStartMin && endMin > breakStartMin) {
      endMin = breakStartMin;
    }
    if (endMin > closeMin) {
      endMin = closeMin;
    }
  }
  const blockMin = Math.max(15, endMin - startMin);
  const end = new Date(start.getTime() + blockMin * 60000);

  try {
    const { rows: [a] } = await q(
      `INSERT INTO public.appointments (service_id, client_name, client_phone, client_email, notes, starts_at, ends_at, price_cents)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, starts_at, ends_at`,
      [serviceId, name.trim(), phone.trim(), email?.trim() || null, notes?.trim() || null, start, end, price]);
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
  const sectionId = Number(b?.section_id) || 0;
  const name = String(b?.name || "").trim();
  const qty = parseInt(b?.quantity ?? 0, 10);
  const min = parseInt(b?.min_quantity ?? 0, 10);
  if (!sectionId || !name || name.length > 120 || !(qty >= 0) || !(min >= 0)) return null;
  return [sectionId, name, String(b?.description || "").trim().slice(0, 300), qty, min];
};

const clientValues = (b: any): unknown[] | string => {
  const name = String(b?.name || "").trim();
  const phone = String(b?.phone || "").trim();
  const photo = String(b?.photo_url || "");
  if (!name || name.length > 120) return "Informe o nome da cliente";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13) return "Informe um telefone (WhatsApp) válido com DDD";
  if (photo && !/^data:image\/(jpeg|png|webp);base64,/.test(photo) && !/^https:\/\//.test(photo)) {
    return "Formato de foto inválido";
  }
  if (photo.length > 400000) return "A foto é muito grande";
  return [name, phone, photo];
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
        `SELECT studio_name, avatar_url, slot_interval_min, primary_color, secondary_color
         FROM public.studio_settings WHERE id = 1`);
      return json(s || { studio_name: "Novolash Studio", avatar_url: "", slot_interval_min: 30,
        primary_color: "#b76e79", secondary_color: "#261e1e" });
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
        `SELECT studio_name, avatar_url, slot_interval_min, primary_color, secondary_color
         FROM public.studio_settings WHERE id = 1`);
      return json({ ...s, email: ADMIN_EMAIL });
    }

    if (sub === "/settings" && method === "PUT") {
      const name = String(body.studio_name || "").trim();
      if (!name || name.length > 80) return bad("Informe um nome de estúdio válido");
      const avatar = String(body.avatar_url || "");
      const HEX = /^#[0-9a-fA-F]{6}$/;
      const primary = HEX.test(body.primary_color || "") ? body.primary_color : "#b76e79";
      const secondary = HEX.test(body.secondary_color || "") ? body.secondary_color : "#261e1e";
      const { rows: [s] } = await q(
        `UPDATE public.studio_settings
         SET studio_name = $1, avatar_url = $2, primary_color = $3, secondary_color = $4, updated_at = now()
         WHERE id = 1
         RETURNING studio_name, avatar_url, slot_interval_min, primary_color, secondary_color`,
        [name, avatar, primary, secondary]);
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
        `SELECT a.id, a.kind, a.service_id, a.client_name, a.client_phone, a.client_email, a.notes, a.status,
                a.starts_at, a.ends_at, s.name AS service, s.price_cents AS service_price_cents,
                COALESCE(a.price_cents, s.price_cents, 0)::int AS price_cents
         FROM public.appointments a LEFT JOIN public.services s ON s.id = a.service_id
         WHERE a.starts_at < $2 AND a.ends_at > $1
         ORDER BY a.starts_at`, [start, end]);
      return json(rows);
    }

    if (sub === "/appointments" && method === "POST") {
      if (body?.kind === "bloqueio") {
        const range = blockRange(body);
        if (!range) return bad("Informe início e término válidos (o término deve ser depois do início)");
        const conflicts = await blockConflicts(range[0], range[1]);
        if (conflicts.appts || conflicts.blocks) {
          return json({ error: conflictMessage(conflicts), conflicts: conflicts.appts }, 409);
        }
        try {
          const { rows: [a] } = await q(
            `INSERT INTO public.appointments (kind, service_id, client_name, client_phone, notes, starts_at, ends_at)
             VALUES ('bloqueio', NULL, 'Indisponível', '', $1, $2, $3) RETURNING id, starts_at, ends_at`,
            [String(body.notes || "").trim() || null, range[0], range[1]]);
          return json(a, 201);
        } catch (e: any) {
          if (e.code === "23P01") return json({ error: "Conflita com outro horário agendado" }, 409);
          throw e;
        }
      }
      const [code, resBody] = await book(body, { force: true });
      return json(resBody, code);
    }

    if ((m = sub.match(/^\/appointments\/(\d+)$/)) && method === "DELETE") {
      const { rowCount } = await q("DELETE FROM public.appointments WHERE id = $1", [Number(m[1])]);
      if (!rowCount) return json({ error: "Agendamento não encontrado" }, 404);
      return json({ ok: true });
    }

    if ((m = sub.match(/^\/appointments\/(\d+)$/)) && method === "PUT") {
      const id = Number(m[1]);
      const { rows: [cur] } = await q("SELECT * FROM public.appointments WHERE id = $1", [id]);
      if (!cur) return json({ error: "Agendamento não encontrado" }, 404);

      if (cur.kind === "bloqueio") {
        const range = blockRange(body);
        if (!range) return bad("Informe início e término válidos (o término deve ser depois do início)");
        const conflicts = await blockConflicts(range[0], range[1], id);
        if (conflicts.appts || conflicts.blocks) {
          return json({ error: conflictMessage(conflicts), conflicts: conflicts.appts }, 409);
        }
        await q(
          "UPDATE public.appointments SET starts_at = $1, ends_at = $2, notes = $3 WHERE id = $4",
          [range[0], range[1], String(body.notes || "").trim() || null, id]);
        return json({ ok: true });
      }

      const { date, time } = body;
      const name = String(body.name || "").trim();
      const phone = String(body.phone || "").trim();
      const serviceId = Number(body.serviceId) || 0;
      const price = customPrice(body.price);
      if (!name || !phone || !DATE.test(date || "") || !TIME.test(time || "")) {
        return bad("Preencha cliente, telefone, data e horário");
      }
      if (price === undefined) return bad("Informe um valor válido para o atendimento");
      const { rows: [svc] } = await q("SELECT id FROM public.services WHERE id = $1", [serviceId]);
      if (!svc) return json({ error: "Serviço não encontrado" }, 404);

      const start = toInstant(date, time);
      const durMs = new Date(cur.ends_at).getTime() - new Date(cur.starts_at).getTime();
      const end = new Date(start.getTime() + Math.max(15 * 60000, durMs));

      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const { rows: [a] } = await c.query(
          `UPDATE public.appointments
           SET client_name = $1, client_phone = $2, client_email = $3, notes = $4,
               service_id = $5, price_cents = $6, starts_at = $7, ends_at = $8
           WHERE id = $9 RETURNING id, status, client_name, service_id, starts_at`,
          [name, phone, String(body.email || "").trim() || null, String(body.notes || "").trim() || null,
            serviceId, price, start, end, id]);
        if (a.status === "concluido") {
          await c.query("DELETE FROM public.transactions WHERE appointment_id = $1", [id]);
          await c.query(
            `INSERT INTO public.transactions (type, description, category, amount_cents, occurred_on, appointment_id)
             SELECT 'receita', $2::text || ' — ' || s.name, 'Atendimentos', COALESCE($5::int, s.price_cents), $3::date, $1
             FROM public.services s WHERE s.id = $4 AND COALESCE($5::int, s.price_cents) > 0`,
            [id, a.client_name, localDate(new Date(a.starts_at)), a.service_id, price]);
        }
        await c.query("COMMIT");
        return json({ ok: true });
      } catch (e: any) {
        await c.query("ROLLBACK");
        if (e.code === "23P01") {
          return json({ error: "Este horário conflita com outro agendamento ou período indisponível" }, 409);
        }
        throw e;
      } finally {
        c.release();
      }
    }

    if ((m = sub.match(/^\/appointments\/(\d+)$/)) && method === "PATCH") {
      const { status } = body;
      if (!STATUSES.includes(status)) return bad();
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const { rows: [a] } = await c.query(
          `UPDATE public.appointments SET status = $1 WHERE id = $2
           RETURNING id, kind, client_name, service_id, starts_at, price_cents`, [status, Number(m[1])]);
        if (!a) {
          await c.query("ROLLBACK");
          return json({ error: "Agendamento não encontrado" }, 404);
        }
        await c.query("DELETE FROM public.transactions WHERE appointment_id = $1", [a.id]);
        if (status === "concluido" && a.kind === "atendimento") {
          await c.query(
            `INSERT INTO public.transactions (type, description, category, amount_cents, occurred_on, appointment_id)
             SELECT 'receita', $2::text || ' — ' || s.name, 'Atendimentos', COALESCE($5::int, s.price_cents), $3::date, $1
             FROM public.services s WHERE s.id = $4 AND COALESCE($5::int, s.price_cents) > 0`,
            [a.id, a.client_name, localDate(new Date(a.starts_at)), a.service_id, a.price_cents]);
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

    // Horários de funcionamento + intervalo de almoço + intervalo de agendamento
    if (sub === "/hours" && method === "GET") {
      const [hoursRes, intervalMin] = await Promise.all([
        q(
          `SELECT weekday, is_open,
                  to_char(open_time,'HH24:MI') AS open_time,
                  to_char(close_time,'HH24:MI') AS close_time,
                  has_break,
                  to_char(break_start,'HH24:MI') AS break_start,
                  to_char(break_end,'HH24:MI') AS break_end
           FROM public.business_hours ORDER BY weekday`
        ),
        getSlotIntervalMin(),
      ]);
      return json(
        hoursRes.rows.map((r: any) => ({
          ...r,
          slot_interval_min: intervalMin,
        }))
      );
    }

    if (sub === "/hours" && method === "PUT") {
      const list = Array.isArray(body) ? body : body?.hours;
      const rawInterval = Number(
        (Array.isArray(body) ? body[0]?.slot_interval_min : body?.slot_interval_min) ?? 30
      );
      const intervalMin = rawInterval >= 15 && rawInterval <= 240 ? Math.round(rawInterval) : 30;

      const valid =
        Array.isArray(list) &&
        list.length === 7 &&
        list.every((h: any) => {
          const basicOk =
            Number.isInteger(h.weekday) &&
            TIME.test(h.open_time || "") &&
            TIME.test(h.close_time || "") &&
            h.close_time > h.open_time;
          if (!basicOk) return false;
          if (h.has_break) {
            return (
              TIME.test(h.break_start || "") &&
              TIME.test(h.break_end || "") &&
              h.break_end > h.break_start
            );
          }
          return true;
        });

      if (!valid) return bad("Verifique os horários de abertura, fechamento e intervalo de almoço");

      await q(
        "UPDATE public.studio_settings SET slot_interval_min = $1, updated_at = now() WHERE id = 1",
        [intervalMin]
      );

      for (const h of list) {
        const bStart = TIME.test(h.break_start || "") ? h.break_start : "12:00";
        const bEnd = TIME.test(h.break_end || "") ? h.break_end : "13:00";
        await q(
          `UPDATE public.business_hours
           SET is_open = $2,
               open_time = $3,
               close_time = $4,
               has_break = $5,
               break_start = $6,
               break_end = $7
           WHERE weekday = $1`,
          [h.weekday, !!h.is_open, h.open_time, h.close_time, !!h.has_break, bStart, bEnd]
        );
      }
      return json({ ok: true, slot_interval_min: intervalMin });
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

    // Categorias do Financeiro
    if (sub === "/finance-categories" && method === "GET") {
      const { rows } = await q(
        `SELECT id, name, position FROM public.finance_categories ORDER BY position, lower(name), id`);
      return json(rows);
    }

    if (sub === "/finance-categories" && method === "POST") {
      const name = String(body.name || "").trim();
      if (!name || name.length > 60) return bad("Informe um nome de categoria válido");
      const { rows: dup } = await q(
        "SELECT id FROM public.finance_categories WHERE lower(name) = lower($1)", [name]);
      if (dup.length > 0) return bad("Já existe uma categoria com esse nome");
      const { rows: [cat] } = await q(
        `INSERT INTO public.finance_categories (name, position)
         VALUES ($1, COALESCE((SELECT MAX(position) FROM public.finance_categories), 0) + 1)
         RETURNING id, name, position`, [name]);
      return json(cat, 201);
    }

    if ((m = sub.match(/^\/finance-categories\/(\d+)$/)) && method === "PUT") {
      const id = Number(m[1]);
      const name = String(body.name || "").trim();
      if (!name || name.length > 60) return bad("Informe um nome de categoria válido");
      const { rows: [cur] } = await q("SELECT id, name FROM public.finance_categories WHERE id = $1", [id]);
      if (!cur) return json({ error: "Categoria não encontrada" }, 404);
      const { rows: dup } = await q(
        "SELECT id FROM public.finance_categories WHERE lower(name) = lower($1) AND id <> $2", [name, id]);
      if (dup.length > 0) return bad("Já existe uma categoria com esse nome");
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const { rows: [cat] } = await c.query(
          "UPDATE public.finance_categories SET name = $1 WHERE id = $2 RETURNING id, name, position",
          [name, id]);
        await c.query(
          "UPDATE public.transactions SET category = $1 WHERE lower(category) = lower($2)",
          [name, cur.name]);
        await c.query("COMMIT");
        return json(cat);
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
    }

    if ((m = sub.match(/^\/finance-categories\/(\d+)$/)) && method === "DELETE") {
      await q("DELETE FROM public.finance_categories WHERE id = $1", [Number(m[1])]);
      return json({ ok: true });
    }

    // Estoque (independente do Financeiro): seções e itens
    if (sub === "/inventory" && method === "GET") {
      const [sections, items] = await Promise.all([
        q(`SELECT id, name, position FROM public.inventory_sections ORDER BY position, id`),
        q(`SELECT id, section_id, name, description, quantity, min_quantity
           FROM public.inventory_items WHERE section_id IS NOT NULL
           ORDER BY lower(name), id`),
      ]);
      return json({ sections: sections.rows, items: items.rows });
    }

    if (sub === "/inventory/sections" && method === "POST") {
      const name = String(body.name || "").trim();
      if (!name || name.length > 80) return bad("Informe um nome de seção válido");
      const { rows: [s] } = await q(
        `INSERT INTO public.inventory_sections (name, position)
         VALUES ($1, COALESCE((SELECT MAX(position) FROM public.inventory_sections), 0) + 1)
         RETURNING id, name, position`, [name]);
      return json(s, 201);
    }

    if ((m = sub.match(/^\/inventory\/sections\/(\d+)$/)) && method === "PUT") {
      const name = String(body.name || "").trim();
      if (!name || name.length > 80) return bad("Informe um nome de seção válido");
      const { rows: [s] } = await q(
        "UPDATE public.inventory_sections SET name = $1 WHERE id = $2 RETURNING id, name, position",
        [name, Number(m[1])]);
      if (!s) return json({ error: "Seção não encontrada" }, 404);
      return json(s);
    }

    if ((m = sub.match(/^\/inventory\/sections\/(\d+)$/)) && method === "DELETE") {
      await q("DELETE FROM public.inventory_sections WHERE id = $1", [Number(m[1])]);
      return json({ ok: true });
    }

    if (sub === "/inventory" && method === "POST") {
      const v = itemValues(body);
      if (!v) return bad("Preencha o nome do item, a seção e uma quantidade válida");
      const { rows: [sec] } = await q("SELECT id FROM public.inventory_sections WHERE id = $1", [v[0]]);
      if (!sec) return json({ error: "Seção não encontrada" }, 404);
      const { rows: [item] } = await q(
        `INSERT INTO public.inventory_items (section_id, name, description, quantity, min_quantity, category, unit)
         VALUES ($1,$2,$3,$4,$5,'Outros','un')
         RETURNING id, section_id, name, description, quantity, min_quantity`, v);
      return json(item, 201);
    }

    if ((m = sub.match(/^\/inventory\/(\d+)$/)) && method === "PUT") {
      const v = itemValues(body);
      if (!v) return bad("Preencha o nome do item, a seção e uma quantidade válida");
      const { rows: [item] } = await q(
        `UPDATE public.inventory_items
         SET section_id = $1, name = $2, description = $3, quantity = $4, min_quantity = $5
         WHERE id = $6
         RETURNING id, section_id, name, description, quantity, min_quantity`, [...v, Number(m[1])]);
      if (!item) return json({ error: "Item não encontrado" }, 404);
      return json(item);
    }

    if ((m = sub.match(/^\/inventory\/(\d+)\/quantity$/)) && method === "PATCH") {
      const delta = parseInt(body.delta, 10);
      if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100000) return bad();
      const { rows: [item] } = await q(
        `UPDATE public.inventory_items SET quantity = GREATEST(0, quantity + $1)
         WHERE id = $2
         RETURNING id, section_id, name, description, quantity, min_quantity`, [delta, Number(m[1])]);
      if (!item) return json({ error: "Item não encontrado" }, 404);
      return json(item);
    }

    if ((m = sub.match(/^\/inventory\/(\d+)$/)) && method === "DELETE") {
      await q("DELETE FROM public.inventory_items WHERE id = $1", [Number(m[1])]);
      return json({ ok: true });
    }

    // Clientes
    if (sub === "/clients" && method === "GET") {
      const { rows } = await q(
        `SELECT id, name, phone, photo_url FROM public.clients ORDER BY lower(name), id`);
      return json(rows);
    }

    if (sub === "/clients" && method === "POST") {
      const v = clientValues(body);
      if (typeof v === "string") return bad(v);
      const { rows: [c] } = await q(
        `INSERT INTO public.clients (name, phone, photo_url) VALUES ($1,$2,$3)
         RETURNING id, name, phone, photo_url`, v);
      return json(c, 201);
    }

    if ((m = sub.match(/^\/clients\/(\d+)$/)) && method === "PUT") {
      const v = clientValues(body);
      if (typeof v === "string") return bad(v);
      const { rows: [c] } = await q(
        `UPDATE public.clients SET name = $1, phone = $2, photo_url = $3, updated_at = now()
         WHERE id = $4 RETURNING id, name, phone, photo_url`, [...v, Number(m[1])]);
      if (!c) return json({ error: "Cliente não encontrada" }, 404);
      return json(c);
    }

    if ((m = sub.match(/^\/clients\/(\d+)$/)) && method === "DELETE") {
      await q("DELETE FROM public.clients WHERE id = $1", [Number(m[1])]);
      return json({ ok: true });
    }

    return json({ error: "Rota não encontrada" }, 404);
  } catch (err) {
    console.error(err);
    return json({ error: "Erro interno do servidor" }, 500);
  }
});
