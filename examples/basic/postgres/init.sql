-- Seed data for the example's Postgres (EXAMPLE_HYPERDRIVE=1). Runs once,
-- when `bun run db:up` creates the container.
CREATE TABLE customers (
  id serial PRIMARY KEY,
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  plan text NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invoices (
  id serial PRIMARY KEY,
  customer_id int NOT NULL REFERENCES customers(id),
  amount_cents int NOT NULL,
  status text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO customers (name, email, plan) VALUES
  ('Ada Lovelace', 'ada@example.com', 'pro'),
  ('Grace Hopper', 'grace@example.com', 'team'),
  ('Lin Clark', 'lin@example.com', 'free'),
  ('Katherine Johnson', 'katherine@example.com', 'pro');

INSERT INTO invoices (customer_id, amount_cents, status, issued_at)
SELECT 1 + (i % 4), 900 + (i * 137) % 9000, (ARRAY['paid', 'paid', 'open', 'void'])[1 + i % 4], now() - (i || ' days')::interval
FROM generate_series(1, 40) AS i;
