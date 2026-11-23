import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { issueSessionToken, verifySessionToken, SESSION_MAX_AGE_S, hashedAddress } from '../identity.js';
import { configured, redis } from '../storage.js';
import { store } from './store.js';
import { isStaffEmail, isStudentEmail, NEW_ACCOUNT_DAYS, normalizeEmail, nameFromEmail, reliabilityLabel, semesterOf, type Me, type Role } from '../../shared/travaux.js';
import { groupById } from '../../shared/selection.js';

export interface User {
  id: string; email: string | null; firstName: string; lastName: string; groupId?: string; groupSemester?: string; createdAt: string;
  cguAcceptedAt?: string; reliability: number; staff?: boolean; readOnlyUntil?: string; banned?: { at: string; reason: string }; deletedAt?: string;
}
export interface Session { id: string; userId: string; createdAt: string; lastSeen: string; device: string }
/** Real class representatives (elected at the IUT) declare themselves; the administration checks and confirms. No vote in Vencat. */
export interface Delegation { id: string; userId: string; groupId: string; status: 'requested' | 'active' | 'refused' | 'ended'; title?: 'titulaire' | 'suppléant'; note?: string; electedOn?: string;
  /** Opinion of the group's students on the declaration (help for the administration, not a vote). */
  answers?: Record<string, 'yes' | 'unknown' | 'no'>; supporters?: string[]; createdAt: string; alertedAt?: string; decidedAt?: string; until?: string }

export const id = () => randomBytes(16).toString('hex');
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const now = () => new Date().toISOString();
const COOKIE = 'vencat_session';

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

// ---------------------------------------------------------------------------
// Roles: admins are listed in ADMIN_EMAILS; delegates hold an active delegation.
// ---------------------------------------------------------------------------
// Administration happens on /admin with its own sign-in (ADMIN_EMAILS). A student account is never an
// administrator, unless explicitly listed in APP_ADMIN_EMAILS (kept for exceptional cases).
export const isAdmin = (user: User) => !!user.email && (process.env.APP_ADMIN_EMAILS ?? '').split(',').map(normalizeEmail).filter(Boolean).includes(user.email);
export const adminEmails = () => (process.env.ADMIN_EMAILS ?? '').split(',').map(normalizeEmail).filter(Boolean);
export async function activeDelegations(userId?: string) {
  const all = await store().list<Delegation>('delegations');
  const current = now();
  return all.filter(item => item.status === 'active' && (!item.until || item.until > current) && (!userId || item.userId === userId));
}
export async function roleOf(user: User): Promise<{ role: Role; delegateGroups: string[] }> {
  const delegateGroups = (await activeDelegations(user.id)).map(item => item.groupId);
  return { role: isAdmin(user) ? 'admin' : delegateGroups.length ? 'delegate' : user.staff ? 'teacher' : 'student', delegateGroups };
}
export const isNewAccount = (user: User) => Date.now() - Date.parse(user.createdAt) < NEW_ACCOUNT_DAYS * 86400000;
export const displayName = (user: User | undefined) => !user || user.deletedAt ? 'Ancien étudiant' : [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Étudiant';
export const shortDisplayName = (user: User | undefined) => !user || user.deletedAt ? 'Ancien étudiant' : [user.firstName, user.lastName ? user.lastName[0] + '.' : ''].filter(Boolean).join(' ');

export async function meOf(user: User): Promise<Me> {
  const { role, delegateGroups } = await roleOf(user);
  return {
    id: user.id, email: user.email ?? '', firstName: user.firstName, lastName: user.lastName, groupId: user.groupId,
    groupChangeAllowed: !user.groupId || user.groupSemester !== semesterOf(now()), role, delegateScope: delegateGroups,
    reliability: Math.round(user.reliability * 10) / 10, reliabilityLabel: reliabilityLabel(user.reliability),
    readOnlyUntil: user.readOnlyUntil && user.readOnlyUntil > now() ? user.readOnlyUntil : undefined, banned: !!user.banned,
    createdAt: user.createdAt, cguAccepted: !!user.cguAcceptedAt, newAccount: isNewAccount(user),
  };
}

// ---------------------------------------------------------------------------
// Session cookie: HttpOnly, unreadable by the page.
// ---------------------------------------------------------------------------
function cookies(req: Request) {
  return Object.fromEntries((req.headers.cookie ?? '').split(';').map(part => part.trim().split('=')).filter(pair => pair.length >= 2).map(([key, ...rest]) => [key!, decodeURIComponent(rest.join('='))]));
}
const secureCookie = (req: Request) => req.protocol === 'https' || String(req.headers['x-forwarded-proto'] ?? '').split(',')[0]?.trim() === 'https' || process.env.NODE_ENV === 'production';
export function setSessionCookie(req: Request, res: Response, token: string) {
  res.append('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_S}${secureCookie(req) ? '; Secure' : ''}`);
}
export function clearSessionCookie(req: Request, res: Response) { res.append('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureCookie(req) ? '; Secure' : ''}`); }
export function deviceLabel(req: Request) {
  const agent = String(req.headers['user-agent'] ?? '');
  const browser = /Edg\//.test(agent) ? 'Edge' : /OPR\//.test(agent) ? 'Opera' : /Firefox\//.test(agent) ? 'Firefox' : /Chrome\//.test(agent) ? 'Chrome' : /Safari\//.test(agent) ? 'Safari' : 'Navigateur';
  const system = /iPhone/.test(agent) ? 'iPhone' : /iPad/.test(agent) ? 'iPad' : /Android/.test(agent) ? 'Android' : /Windows/.test(agent) ? 'Windows' : /Mac OS X/.test(agent) ? 'Mac' : /Linux/.test(agent) ? 'Linux' : 'appareil inconnu';
  return `${browser} · ${system}`;
}
export async function createSession(req: Request, res: Response, user: User) {
  const session: Session = { id: id(), userId: user.id, createdAt: now(), lastSeen: now(), device: deviceLabel(req) };
  await store().put('sessions', session.id, session);
  setSessionCookie(req, res, issueSessionToken(session.id));
  return session;
}

export interface Authed { user?: User; session?: Session }
/** Reads the session cookie. Unknown or revoked sessions are ignored (reading needs no account). */
export async function authenticate(req: Request): Promise<Authed> {
  const payload = verifySessionToken(cookies(req)[COOKIE]);
  if (!payload) return {};
  const session = await store().get<Session>('sessions', payload.id);
  if (!session) return {};
  const user = await store().get<User>('users', session.userId);
  if (!user || user.deletedAt || !user.email) return {};
  if (Date.now() - Date.parse(session.lastSeen) > 3600000) { session.lastSeen = now(); await store().put('sessions', session.id, session); }
  return { user, session };
}
export async function requireUser(req: Request) {
  const auth = await authenticate(req);
  if (!auth.user) throw new HttpError(401, 'Connecte-toi pour continuer.');
  return auth as Required<Authed>;
}
/** Contribution rights: onboarded, not read-only, not banned. */
export async function requireContributor(req: Request) {
  const auth = await requireUser(req);
  if (auth.user.banned) throw new HttpError(403, 'Ce compte est banni. Tu peux contester par mail.');
  if (auth.user.readOnlyUntil && auth.user.readOnlyUntil > now()) throw new HttpError(403, `Compte en lecture seule jusqu’au ${new Date(auth.user.readOnlyUntil).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}.`);
  if (!auth.user.cguAcceptedAt || (!auth.user.groupId && !auth.user.staff)) throw new HttpError(403, 'Termine d’abord la création de ton compte.');
  return auth;
}

/** Changes from other sites are refused: the page must send this header, and a foreign Origin is rejected. */
export function sameOrigin(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const origin = req.headers.origin;
  if (req.headers['x-requested-with'] !== 'vencat') return res.status(403).json({ error: 'Requête refusée.' });
  const forwardedHost = String(req.headers['x-forwarded-host'] ?? '').split(',').map(item => item.trim());
  if (origin) { try { if (new URL(origin).host !== req.headers.host && !forwardedHost.includes(new URL(origin).host)) return res.status(403).json({ error: 'Origine refusée.' }); } catch { return res.status(403).json({ error: 'Origine refusée.' }); } }
  next();
}

// ---------------------------------------------------------------------------
// Limits: Redis when available (shared between instances), memory otherwise.
// ---------------------------------------------------------------------------
const memoryCounters = new Map<string, { count: number; until: number }>();
export async function overLimit(key: string, max: number, seconds: number): Promise<boolean> {
  if (configured()) {
    try {
      const value = await redis<number>('INCR', `vencat:limit:${key}`);
      if (value === 1) await redis('EXPIRE', `vencat:limit:${key}`, seconds);
      return value > max;
    } catch { /* fall back to memory */ }
  }
  const current = memoryCounters.get(key);
  if (!current || current.until < Date.now()) { memoryCounters.set(key, { count: 1, until: Date.now() + seconds * 1000 }); return 1 > max; }
  current.count++;
  return current.count > max;
}
export const resetLimits = () => memoryCounters.clear();
export const addressKey = (req: Request) => hashedAddress(req).slice(0, 24);

// ---------------------------------------------------------------------------
// Sign-in requests: 6-digit code + magic link by mail, approval on a connected device (pick 1 of 3 numbers), QR code.
// ---------------------------------------------------------------------------
export interface Login {
  id: string; email?: string; pollHash: string; codeHash?: string; magicHash?: string; number: number; decoys: number[];
  createdAt: string; expiresAt: string; attempts: number; mails: number; status: 'waiting' | 'approved' | 'denied'; approvedUserId?: string; device: string; qr?: boolean;
  /** A code (or link) already used stays valid for REUSE_MAX sign-ins during REUSE_MS, e.g. when the app was reloaded. */
  firstUsedAt?: string; uses?: number;
}
export const LOGIN_TTL_MS = 10 * 60000;
export const MAX_ATTEMPTS = 5;
export function newLogin(req: Request, email?: string) {
  const number = randomInt(10, 100);
  const decoys = new Set<number>(); while (decoys.size < 2) { const value = randomInt(10, 100); if (value !== number) decoys.add(value); }
  const poll = randomBytes(24).toString('base64url');
  const login: Login = { id: id(), email, pollHash: hash(poll), number, decoys: [...decoys], createdAt: now(), expiresAt: new Date(Date.now() + LOGIN_TTL_MS).toISOString(), attempts: 0, mails: 0, status: 'waiting', device: deviceLabel(req), qr: !email };
  return { login, poll };
}
export const REUSE_MS = 3 * 60000, REUSE_MAX = 12;
export const loginExpired = (login: Login) => login.firstUsedAt ? Date.parse(login.firstUsedAt) + REUSE_MS < Date.now() || (login.uses ?? 0) >= REUSE_MAX : login.expiresAt < now();
export function samePoll(login: Login, poll: unknown) {
  if (typeof poll !== 'string') return false;
  const a = Buffer.from(login.pollHash), b = Buffer.from(hash(poll));
  return a.length === b.length && timingSafeEqual(a, b);
}
export function newSecrets(login: Login) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const magic = randomBytes(24).toString('base64url');
  login.codeHash = hash(login.id + ':' + code); login.magicHash = hash(login.id + ':' + magic);
  return { code, magic };
}
export function checkCode(login: Login, code: unknown) {
  if (typeof code !== 'string' || !login.codeHash) return false;
  const a = Buffer.from(login.codeHash), b = Buffer.from(hash(login.id + ':' + code.replace(/\D/g, '')));
  return a.length === b.length && timingSafeEqual(a, b);
}
export function checkMagic(login: Login, magic: unknown) {
  if (typeof magic !== 'string' || !login.magicHash) return false;
  const a = Buffer.from(login.magicHash), b = Buffer.from(hash(login.id + ':' + magic));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Account of an address, created at the first sign-in (name guessed from the address). */
export async function userForEmail(email: string): Promise<User> {
  const normalized = normalizeEmail(email);
  const index = await store().get<{ userId: string }>('emails', normalized);
  if (index) { const user = await store().get<User>('users', index.userId); if (user && !user.deletedAt) return user; }
  const { firstName, lastName } = nameFromEmail(normalized);
  const user: User = { id: id(), email: normalized, firstName, lastName, createdAt: now(), reliability: 0, staff: isStaffEmail(normalized) && !isStudentEmail(normalized) };
  await store().put('users', user.id, user);
  await store().put('emails', normalized, { userId: user.id });
  return user;
}
export const allowedEmail = (email: string) => isStudentEmail(email) || (process.env.TEACHER_ACCOUNTS === 'true' && isStaffEmail(email));
export const groupExists = (groupId: unknown): groupId is string => typeof groupId === 'string' && !!groupById(groupId);
