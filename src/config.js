import fs from 'node:fs';
import path from 'node:path';

const env = process.env;

// Sem Dockerfile (build automatico do EasyPanel) o DATA_DIR nao vem definido. Se existe um volume
// em /data, usamos ele, e o Chromium baixado em runtime tambem fica la, sobrevivendo ao deploy.
if (!env.PLAYWRIGHT_BROWSERS_PATH && !env.DATA_DIR && fs.existsSync('/data')) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '/data/browsers';
}

export const config = {
  port: Number(env.PORT || 3000),
  dataDir: path.resolve(env.DATA_DIR || (fs.existsSync('/data') ? '/data' : './data')),
  adminUser: (env.ADMIN_USER || 'admin').trim() || 'admin',
  adminPassword: env.ADMIN_PASSWORD || '',
  sessionSecret: env.SESSION_SECRET || '',
  timezone: env.TZ || 'America/Sao_Paulo',
  proxyServer: env.PROXY_SERVER || '',
  proxyUser: env.PROXY_USER || '',
  proxyPass: env.PROXY_PASS || '',
  headless: env.HEADLESS !== '0',
  backupWebhookUrl: env.BACKUP_WEBHOOK_URL || '',
  backupKey: env.BACKUP_KEY || '',
  extraUsers: env.EXTRA_USERS || '',
  sessionHours: Number(env.SESSION_HOURS || 24 * 14),
};

export function assertConfig() {
  if (!config.adminPassword || config.adminPassword.length < 8) {
    console.error(
      'ERRO: defina a variavel de ambiente ADMIN_PASSWORD com pelo menos 8 caracteres. ' +
        'O painel fica exposto na internet e nao sobe sem senha.'
    );
    process.exit(1);
  }
}
