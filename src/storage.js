import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

// Descobre se a pasta de dados fica num volume que sobrevive ao deploy.
// Sem volume, cada Implantar apaga banco, usuarios e login do navegador.
export function storageInfo() {
  try {
    const target = path.resolve(config.dataDir);
    const lines = fs.readFileSync('/proc/self/mountinfo', 'utf8').split('\n');
    let best = null;
    for (const ln of lines) {
      const f = ln.split(' ');
      const mnt = (f[4] || '').replace(/\\040/g, ' ');
      if (!mnt) continue;
      if (target === mnt || target.startsWith(mnt + '/')) {
        if (!best || mnt.length > best.mnt.length) best = { mnt, root: f[3] || '' };
      }
    }
    if (!best) return { persistent: null };
    if (best.mnt === '/') return { persistent: false, why: 'sem-volume' };
    if (/\/volumes\/[0-9a-f]{64}\/_data/.test(best.root)) return { persistent: false, why: 'anonimo' };
    return { persistent: true };
  } catch {
    return { persistent: null };
  }
}

// contador de boots guardado em /data: se voltar a 1 depois de um deploy, a pasta foi apagada
export function bootInfo() {
  const f = path.join(config.dataDir, '.boot.json');
  let cur = { since: new Date().toISOString(), boots: 0 };
  try {
    cur = JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {}
  cur.boots = (Number(cur.boots) || 0) + 1;
  try {
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.writeFileSync(f, JSON.stringify(cur));
  } catch {}
  return cur;
}
