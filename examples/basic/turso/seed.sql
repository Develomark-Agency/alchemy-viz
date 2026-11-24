INSERT OR IGNORE INTO notebooks (id, title) VALUES
  (1, 'Ideas'),
  (2, 'Reading list');

INSERT OR IGNORE INTO notes (id, notebook_id, body, tags, pinned) VALUES
  (1, 1, 'A dashboard for every Alchemy resource', '["viz","alchemy"]', 1),
  (2, 1, 'Local libSQL server for alchemy dev', '["turso"]', 0),
  (3, 2, 'Hrana over HTTP spec', '["libsql","spec"]', 1);
