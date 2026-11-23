import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { configured, redis } from './storage.js';

// Anonymous device token: a random identifier signed by the server. It carries no personal data,
// is not linked to an address, and lets limits apply per device instead of per network
// (a whole campus often shares one public address). The `kind` field leaves room for future
// identities (for example accounts) without changing the format.
export interface TokenPayload { v: 1; kind: 'anon'; id: string; iat: number }
const TOKEN_HEADER = 'x-vencat-token';
const MAX_AGE_S = 180 * 86400;

const secret = () => process.env.TOKEN_SECRET && process.env.TOKEN_SECRET.length >= 32 ? process.env.TOKEN_SECRET : undefined;
/** Tokens are only issued when a shared secret is configured (every server instance must accept them). */
export const tokensEnabled = () => !!secret();
const sign = (body: string) => createHmac('sha256', secret()!).update(body).digest('base64url');

export function issueToken(now = Date.now()): { token: string; expiresAt: string } | undefined {
  if (!tokensEnabled()) return undefined;
  const payload: TokenPayload = { v: 1, kind: 'anon', id: randomBytes(16).toString('hex'), iat: Math.floor(now / 1000) };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { token: `${body}.${sign(body)}`, expiresAt: new Date((payload.iat + MAX_AGE_S) * 1000).toISOString() };
}

export function verifyToken(token: unknown, now = Date.now()): TokenPayload | undefined {
  if (!tokensEnabled() || typeof token !== 'string' || token.length > 300) return undefined;
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra !== undefined) return undefined;
  const expected = Buffer.from(sign(body)), given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as TokenPayload;
    const age = now / 1000 - payload.iat;
    if (payload.v !== 1 || payload.kind !== 'anon' || !/^[a-f0-9]{32}$/.test(payload.id) || age < -300 || age > MAX_AGE_S) return undefined;
    return payload;
  } catch { return undefined; }
}

const address = (req: Request) => createHash('sha256').update(String(req.headers['x-vercel-forwarded-for'] ?? req.ip ?? 'unknown')).digest('hex');
const window = () => Math.floor(Date.now() / 600_000);
async function count(key: string) {
  const value = await redis<number>('INCR', key);
  if (value === 1) await redis('EXPIRE', key, 600);
  return value;
}
/** Budgets per ten minutes. A device with a token has its own budget; the address limit stays as a wide safety net. */
export const LIMITS = { device: 180, address: 1500, anonymousAddress: 180, tokens: 30 } as const;

/** True when the request exceeds its budget. Without Redis there is no shared counter, hence no limit. */
export async function rateLimited(req: Request): Promise<boolean> {
  if (!configured()) return false;
  const device = verifyToken(req.headers[TOKEN_HEADER]), place = address(req);
  // Requests without a token keep the former per-address budget, counted apart from devices with tokens.
  if (!device) return await count(`vencat:rate:anon:${place}:${window()}`) > LIMITS.anonymousAddress;
  if (await count(`vencat:rate:ip:${place}:${window()}`) > LIMITS.address) return true;
  return await count(`vencat:rate:device:${device.id}:${window()}`) > LIMITS.device;
}

/** Limits how many tokens one address can obtain, so tokens cannot be minted to escape the budget. */
export async function tokenRequestLimited(req: Request): Promise<boolean> {
  if (!configured()) return false;
  return await count(`vencat:rate:token:${address(req)}:${window()}`) > LIMITS.tokens;
}

// ---------------------------------------------------------------------------
// Account sessions (Travaux): the same signed format with `kind: 'user'`. The payload only carries
// the session identifier; the session itself (account, device) is stored server side and can be revoked.
// ---------------------------------------------------------------------------
export interface SessionPayload { v: 1; kind: 'user'; id: string; iat: number }
export const SESSION_MAX_AGE_S = 180 * 86400;
let developmentSecret: string | undefined;
/** TOKEN_SECRET in production. In development a random secret is generated so sign-in works out of the box. */
function sessionSecret() {
  const configured = secret();
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') throw new Error('TOKEN_SECRET doit être configuré pour les comptes.');
  return developmentSecret ??= randomBytes(32).toString('hex');
}
const signSession = (body: string) => createHmac('sha256', sessionSecret()).update('session:' + body).digest('base64url');
export function issueSessionToken(id: string, now = Date.now()) {
  const payload: SessionPayload = { v: 1, kind: 'user', id, iat: Math.floor(now / 1000) };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${signSession(body)}`;
}
export function verifySessionToken(token: unknown, now = Date.now()): SessionPayload | undefined {
  if (typeof token !== 'string' || token.length > 300) return undefined;
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra !== undefined) return undefined;
  const expected = Buffer.from(signSession(body)), given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as SessionPayload;
    const age = now / 1000 - payload.iat;
    if (payload.v !== 1 || payload.kind !== 'user' || !/^[a-f0-9]{32}$/.test(payload.id) || age < -300 || age > SESSION_MAX_AGE_S) return undefined;
    return payload;
  } catch { return undefined; }
}
export const hashedAddress = address;
