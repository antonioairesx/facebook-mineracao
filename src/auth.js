import crypto from 'node:crypto';
import { config } from './config.js';

const COOKIE = 'garimpo_session';

function secret() {
  return config.sessionSecret || crypto.createHash('sha256').update('garimpo:' + config.adminPassword).digest('hex');
}

function sign(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

function sha(s) {
  return crypto.createHash('sha256').update(String(s)).digest();
}

export function passwordMatches(input) {
  return crypto.timingSafeEqual(sha(input), sha(config.adminPassword));
}

// ---- senhas de usuarios (scrypt com sal)
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(password), salt, 32);
  return `s1:${salt.toString('hex')}:${key.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [tag, saltHex, keyHex] = String(stored).split(':');
    if (tag !== 's1') return false;
    const key = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), 32);
    const want = Buffer.from(keyHex, 'hex');
    return key.length === want.length && crypto.timingSafeEqual(key, want);
  } catch {
    return false;
  }
}

// gasta o mesmo tempo quando o usuario nao existe (nao revela quem tem conta)
export function fakeVerify(password) {
  verifyPassword(password, 's1:00000000000000000000000000000000:' + '00'.repeat(32));
}

// uid 0 = admin definido pelas variaveis de ambiente. v amarra a sessao a versao da senha.
export function makeSession(uid, v = '') {
  const exp = Date.now() + config.sessionHours * 3600 * 1000;
  const payload = Buffer.from(JSON.stringify({ exp, uid, v })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readCookie(header, name = COOKIE) {
  if (!header) return '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}

export function readSession(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = sign(payload);
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const { exp, uid, v } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof exp !== 'number' || exp <= Date.now() || !Number.isInteger(uid)) return null;
    return { uid, v: typeof v === 'string' ? v : '' };
  } catch {
    return null;
  }
}

export function sessionCookie(token, secure) {
  const maxAge = Math.floor(config.sessionHours * 3600);
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export function clearCookie(secure) {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

// limite simples de tentativas de login por IP
const attempts = new Map();
export function loginBlocked(ip) {
  const a = attempts.get(ip);
  return !!a && a.until > Date.now();
}
export function registerFailure(ip) {
  const a = attempts.get(ip) || { count: 0, until: 0 };
  a.count += 1;
  if (a.count >= 5) {
    a.until = Date.now() + 10 * 60 * 1000;
    a.count = 0;
  }
  attempts.set(ip, a);
}
export function registerSuccess(ip) {
  attempts.delete(ip);
}
