-- Kısa linkler
CREATE TABLE links (
  code       TEXT PRIMARY KEY,
  url        TEXT NOT NULL,
  clicks     INTEGER NOT NULL DEFAULT 0,
  custom     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX links_url ON links (url);

-- Otomatik kodlar için sıra sayacı (tek satır)
CREATE TABLE counter (
  id    INTEGER PRIMARY KEY CHECK (id = 1),
  value INTEGER NOT NULL
);

INSERT INTO counter (id, value) VALUES (1, 0);
