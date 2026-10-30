CREATE TABLE IF NOT EXISTS services (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  duration_min INT NOT NULL CHECK (duration_min > 0),
  price_cents INT NOT NULL CHECK (price_cents >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS business_hours (
  weekday INT PRIMARY KEY CHECK (weekday BETWEEN 0 AND 6), -- 0 = domingo
  is_open BOOLEAN NOT NULL DEFAULT TRUE,
  open_time TIME NOT NULL DEFAULT '09:00',
  close_time TIME NOT NULL DEFAULT '18:00'
);

CREATE TABLE IF NOT EXISTS appointments (
  id SERIAL PRIMARY KEY,
  service_id INT NOT NULL REFERENCES services(id),
  client_name TEXT NOT NULL,
  client_phone TEXT NOT NULL,
  client_email TEXT,
  notes TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'agendado'
    CHECK (status IN ('agendado','concluido','cancelado','faltou')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  -- impede dois agendamentos ativos sobrepostos, mesmo com requisições simultâneas
  CONSTRAINT sem_conflito EXCLUDE USING gist (tstzrange(starts_at, ends_at) WITH &&)
    WHERE (status = 'agendado')
);
CREATE INDEX IF NOT EXISTS idx_appointments_starts ON appointments (starts_at);

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('receita','despesa')),
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Outros',
  amount_cents INT NOT NULL CHECK (amount_cents > 0),
  occurred_on DATE NOT NULL,
  appointment_id INT REFERENCES appointments(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (occurred_on);

INSERT INTO business_hours (weekday, is_open, open_time, close_time) VALUES
  (0,false,'09:00','18:00'),(1,true,'09:00','18:00'),(2,true,'09:00','18:00'),
  (3,true,'09:00','18:00'),(4,true,'09:00','18:00'),(5,true,'09:00','18:00'),
  (6,true,'09:00','14:00')
ON CONFLICT (weekday) DO NOTHING;

-- serviços de exemplo (edite preços e durações no painel)
INSERT INTO services (name, description, duration_min, price_cents)
SELECT * FROM (VALUES
  ('Extensão de cílios — Fio a fio', 'Efeito natural e delicado', 120, 15000),
  ('Extensão de cílios — Volume russo', 'Mais densidade e volume', 150, 20000),
  ('Manutenção de cílios', 'Reposição dos fios', 90, 10000),
  ('Design de sobrancelha', 'Design personalizado com pinça', 45, 5000),
  ('Design com henna', 'Design + henna para preencher falhas', 60, 7000)
) AS v(name, description, duration_min, price_cents)
WHERE NOT EXISTS (SELECT 1 FROM services);
