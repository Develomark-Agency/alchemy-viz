CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO users (email, name) VALUES
  ('ada@example.com', 'Ada Lovelace'),
  ('grace@example.com', 'Grace Hopper'),
  ('alan@example.com', 'Alan Turing');
