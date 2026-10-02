// Signed tokens and password hashing for the local stand-in of Supabase Auth.
// Production uses Supabase's own auth service; this exists so the portal can be built and tested offline.
import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const b64 = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

/** HS256 JSON Web Token, the format Supabase uses for access tokens and API keys. */
export function signJwt(payload, secret) {
  const head = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}`;
  return `${head}.${createHmac('sha256', secret).update(head).digest('base64url')}`;
}

/** The token's claims if its signature is valid and it has not expired; otherwise null. */
export function verifyJwt(token, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = createHmac('sha256', secret).update(`${h}.${p}`).digest();
  const given = Buffer.from(s, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const header = JSON.parse(Buffer.from(h, 'base64url').toString());
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
    if (header.alg !== 'HS256' || typeof claims !== 'object' || claims === null) return null;
    if (typeof claims.exp === 'number' && claims.exp <= nowSeconds) return null;
    return claims;
  } catch {
    return null;
  }
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 32);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function checkPassword(password, stored) {
  const [kind, salt, hash] = String(stored ?? '').split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scryptAsync(String(password), Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

export const randomToken = (bytes = 24) => randomBytes(bytes).toString('base64url');
