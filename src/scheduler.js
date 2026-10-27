import { openDb, getSettings, setSettings, num, now } from './db.js';
import { config } from './config.js';
import { isRunning, startRun } from './miner.js';

function localParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  const hour = get('hour') === '24' ? '00' : get('hour');
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${hour}:${get('minute')}` };
}

export function tick() {
  if (isRunning()) return;
  const s = getSettings();
  const mode = s.schedule_mode;
  if (mode === 'daily') {
    const { date, time } = localParts();
    if (s.last_scheduled_date !== date && time >= (s.schedule_time || '03:00')) {
      setSettings({ last_scheduled_date: date });
      startRun({ trigger: 'agendada' });
    }
  } else if (mode === 'interval') {
    const hours = Math.max(1, num(s, 'schedule_every_hours'));
    const last = openDb().prepare('SELECT MAX(started_at) AS t FROM runs').get();
    if (!last.t || now() - last.t >= hours * 3600) startRun({ trigger: 'agendada' });
  }
}

export function startScheduler() {
  setInterval(() => {
    try {
      tick();
    } catch (err) {
      console.error('Falha no agendador', err);
    }
  }, 60 * 1000);
}
