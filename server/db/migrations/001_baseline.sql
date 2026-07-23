CREATE TABLE IF NOT EXISTS flavors (
  id SERIAL PRIMARY KEY,
  brand TEXT NOT NULL,
  name TEXT NOT NULL,
  packs JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  min_stock INTEGER NOT NULL DEFAULT 1,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  low_stock BOOLEAN NOT NULL DEFAULT FALSE,
  purchase_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  excluded_from_deadstock BOOLEAN NOT NULL DEFAULT FALSE,
  strength_override TEXT
);

CREATE TABLE IF NOT EXISTS brand_settings (
  brand TEXT PRIMARY KEY,
  default_strength TEXT NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS brand_settings_brand_lower_unique
ON brand_settings (LOWER(brand));

CREATE TABLE IF NOT EXISTS supplies (
  id SERIAL PRIMARY KEY,
  supply_date DATE NOT NULL,
  supplier TEXT NOT NULL DEFAULT '',
  invoice_number TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'received',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (supply_date, supplier, invoice_number)
);

CREATE TABLE IF NOT EXISTS action_logs (
  id SERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  flavor_id INTEGER,
  brand TEXT,
  name TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  supply_id INTEGER
);

ALTER TABLE action_logs
ADD COLUMN IF NOT EXISTS supply_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'action_logs_supply_id_fkey'
      AND conrelid = 'action_logs'::regclass
  ) THEN
    ALTER TABLE action_logs
    ADD CONSTRAINT action_logs_supply_id_fkey
    FOREIGN KEY (supply_id)
    REFERENCES supplies(id)
    ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS action_logs_supply_id_idx
ON action_logs (supply_id);
