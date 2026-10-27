import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config } from './config.js';
import { openDb, getSettings, setSettings, now } from './db.js';

const BACKUP_DIR = path.join(config.dataDir, 'backups');
const KEEP_LOCAL = 7;

export function driveConfigured() {
  return !!(config.backupWebhookUrl && config.backupKey);
}

function stamp() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const g = (t) => parts.find((p) => p.type === t).value;
  const hh = g('hour') === '24' ? '00' : g('hour');
  return `${g('year')}${g('month')}${g('day')}-${hh}${g('minute')}${g('second')}`;
}

// copia consistente do banco (VACUUM INTO) comprimida em .db.gz
export function createBackup() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const base = `garimpo-${stamp()}`;
  const rawPath = path.join(BACKUP_DIR, `${base}.db`);
  const gzPath = `${rawPath}.gz`;
  openDb().exec(`VACUUM INTO '${rawPath.replace(/'/g, "''")}'`);
  fs.writeFileSync(gzPath, zlib.gzipSync(fs.readFileSync(rawPath)));
  fs.unlinkSync(rawPath);
  const old = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => /^garimpo-.*\.db\.gz$/.test(f))
    .sort()
    .reverse()
    .slice(KEEP_LOCAL);
  for (const f of old) fs.unlinkSync(path.join(BACKUP_DIR, f));
  return { path: gzPath, name: path.basename(gzPath) };
}

export async function sendToDrive() {
  if (!driveConfigured()) throw new Error('Drive nao configurado (faltam BACKUP_WEBHOOK_URL e BACKUP_KEY).');
  const b = createBackup();
  const data = fs.readFileSync(b.path).toString('base64');
  const res = await fetch(config.backupWebhookUrl, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ key: config.backupKey, name: b.name, data }),
    signal: AbortSignal.timeout(120000),
  });
  let out = null;
  try {
    out = await res.json();
  } catch {
    throw new Error('Resposta inesperada do Google (confira se a implantacao permite acesso para "Qualquer pessoa").');
  }
  if (!out || !out.ok) throw new Error('O Google recusou: ' + ((out && out.error) || 'sem detalhe'));
  return { name: b.name };
}

function localDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const g = (t) => parts.find((p) => p.type === t).value;
  const hh = g('hour') === '24' ? '00' : g('hour');
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${hh}:${g('minute')}` };
}

export function recordBackup(ok, message) {
  setSettings({ last_backup_info: JSON.stringify({ at: now(), ok, message: String(message).slice(0, 200) }) });
}

export function lastBackupInfo() {
  try {
    return JSON.parse(getSettings().last_backup_info || 'null');
  } catch {
    return null;
  }
}

// chamado a cada minuto pelo agendador: uma vez por dia, depois das 04:30
export async function backupTick() {
  if (!driveConfigured()) return;
  const { date, time } = localDate();
  if (getSettings().last_backup_date === date || time < '04:30') return;
  setSettings({ last_backup_date: date });
  try {
    const r = await sendToDrive();
    recordBackup(true, 'Enviado: ' + r.name);
  } catch (err) {
    recordBackup(false, err.message);
    console.error('Falha no backup para o Drive:', err.message);
  }
}
