import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

export const DEFAULT_SETTINGS = {
  min_ads: '5',
  min_days: '5',
  scrolls_search: '6',
  scrolls_page: '8',
  max_deep: '30',
  deep_ttl_days: '3',
  delay_min: '3',
  delay_max: '8',
  max_searches_per_run: '60',
  default_countries: 'MX,CO,CL,PE',
  schedule_mode: 'off',
  schedule_time: '03:00',
  schedule_every_hours: '24',
  search_cursor: '0',
  last_scheduled_date: '',
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  term TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'es',
  niche TEXT NOT NULL DEFAULT '',
  countries TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  last_run_at INTEGER,
  last_ads INTEGER NOT NULL DEFAULT 0,
  UNIQUE(term, lang)
);

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  status TEXT NOT NULL DEFAULT 'rodando',
  trigger TEXT NOT NULL DEFAULT 'manual',
  searches_done INTEGER NOT NULL DEFAULT 0,
  searches_total INTEGER NOT NULL DEFAULT 0,
  deep_done INTEGER NOT NULL DEFAULT 0,
  ads_seen INTEGER NOT NULL DEFAULT 0,
  pages_found INTEGER NOT NULL DEFAULT 0,
  new_pages INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  log TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS pages (
  page_id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  profile_url TEXT NOT NULL DEFAULT '',
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  ads_active INTEGER NOT NULL DEFAULT 0,
  ads_groups INTEGER NOT NULL DEFAULT 0,
  oldest_start INTEGER,
  domain TEXT NOT NULL DEFAULT '',
  site_url TEXT NOT NULL DEFAULT '',
  sample_text TEXT NOT NULL DEFAULT '',
  sample_ad_id TEXT NOT NULL DEFAULT '',
  last_deep_at INTEGER,
  status TEXT NOT NULL DEFAULT 'new',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS ads (
  ad_id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  start_date INTEGER,
  end_date INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  body TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  cta TEXT NOT NULL DEFAULT '',
  link_url TEXT NOT NULL DEFAULT '',
  domain TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT '',
  thumb_url TEXT NOT NULL DEFAULT '',
  collation_count INTEGER NOT NULL DEFAULT 1,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS page_hits (
  page_id TEXT NOT NULL,
  term TEXT NOT NULL,
  country TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  PRIMARY KEY (page_id, term, country)
);

CREATE INDEX IF NOT EXISTS idx_ads_page ON ads(page_id);
CREATE INDEX IF NOT EXISTS idx_pages_status ON pages(status);
CREATE INDEX IF NOT EXISTS idx_hits_term ON page_hits(term);
`;

let db;

export function openDb() {
  if (db) return db;
  fs.mkdirSync(config.dataDir, { recursive: true });
  db = new DatabaseSync(path.join(config.dataDir, 'garimpo.db'));
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  const insert = db.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insert.run(k, v);
  // Rodadas que ficaram "rodando" por causa de reinicio do container
  db.prepare(
    "UPDATE runs SET status = 'interrompida', finished_at = ? WHERE status = 'rodando'"
  ).run(now());
  return db;
}

export function now() {
  return Math.floor(Date.now() / 1000);
}

export function tx(fn) {
  const d = openDb();
  d.exec('BEGIN');
  try {
    const out = fn(d);
    d.exec('COMMIT');
    return out;
  } catch (err) {
    d.exec('ROLLBACK');
    throw err;
  }
}

export function getSettings() {
  const rows = openDb().prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export function setSettings(patch) {
  const stmt = openDb().prepare(
    'INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  tx(() => {
    for (const [k, v] of Object.entries(patch)) {
      if (k in DEFAULT_SETTINGS) stmt.run(k, String(v));
    }
  });
}

export function num(settings, key) {
  const n = Number(settings[key]);
  return Number.isFinite(n) ? n : Number(DEFAULT_SETTINGS[key]);
}
