// Travaux: homework, hand-ins, assessments and projects declared by students and checked together.
// Pure rules shared by the API and the interface (validation, scopes, links, deadlines, ICS).
import { groupById, groupOptions, type GroupOption } from './selection.js';
import { GROUP_TO_FEDERATION } from './groups.js';
import { TIMETABLE_TIME_ZONE } from './courses.js';

export const WORK_TYPES = ['rendu', 'eval', 'devoir', 'projet'] as const;
export type WorkType = typeof WORK_TYPES[number];
export const WORK_TYPE_LABELS: Record<WorkType, string> = { rendu: 'Rendu', eval: 'Éval', devoir: 'Devoir', projet: 'Projet' };
export const isWorkType = (value: unknown): value is WorkType => WORK_TYPES.includes(value as WorkType);

/** Who a work is for: one final group (B1), a wide group (B = B1 + B2), or the whole promotion (MMI-2). */
export type ScopeKind = 'group' | 'wide' | 'promo';
export interface WorkScope { kind: ScopeKind; key: string }

/** Wide group of a final group label: the label without its trailing number (B1 → B, FA A2 → FA A). */
export const wideLabel = (label: string) => label.replace(/\s*\d+$/, '').trim() || label;
export function scopeFor(group: GroupOption, kind: ScopeKind): WorkScope {
  if (kind === 'group') return { kind, key: group.id };
  if (kind === 'wide') return { kind, key: `${group.promotion}|${wideLabel(group.label)}` };
  return { kind, key: group.promotion };
}
export function scopeMembers(scope: WorkScope): GroupOption[] {
  if (scope.kind === 'group') { const group = groupById(scope.key); return group ? [group] : []; }
  if (scope.kind === 'wide') { const [promotion, wide] = scope.key.split('|'); return groupOptions.filter(group => group.promotion === promotion && wideLabel(group.label) === wide); }
  return groupOptions.filter(group => group.promotion === scope.key);
}
export const scopeIncludes = (scope: WorkScope, groupId: string) => scopeMembers(scope).some(group => group.id === groupId);
export function validScope(value: unknown): value is WorkScope {
  const scope = value as WorkScope;
  return !!scope && ['group', 'wide', 'promo'].includes(scope.kind) && typeof scope.key === 'string' && scope.key.length < 120 && scopeMembers(scope).length > 0;
}
export function scopeLabel(scope: WorkScope): string {
  const members = scopeMembers(scope);
  if (scope.kind === 'group') return members[0] ? `${members[0].label}` : 'Groupe';
  if (scope.kind === 'wide') return `Groupe ${scope.key.split('|')[1] ?? ''}`;
  return scope.key;
}
/** Audience of a course from its CELCAT groups ("MMI2" whole promotion, "MMI2-B" wide group, "MMI2-B1" final group). */
export function audienceScope(audience: string | undefined, group: GroupOption): WorkScope | undefined {
  const federation = GROUP_TO_FEDERATION[group.id]?.toUpperCase();
  if (!audience || !federation) return undefined;
  const tokens = audience.split(/[;,]/).map(token => token.trim().toUpperCase().replace(/\s+/g, ''));
  const promotion = federation.split('-')[0]!, wide = federation.replace(/\d+$/, '');
  if (tokens.includes(promotion)) return scopeFor(group, 'promo');
  if (wide !== federation && tokens.includes(wide)) return scopeFor(group, 'wide');
  if (tokens.includes(federation)) return scopeFor(group, 'group');
  return undefined;
}
const SCOPE_RANK: Record<ScopeKind, number> = { group: 0, wide: 1, promo: 2 };
/** The wider of two scopes of the same author. */
export const widerScope = (a: WorkScope, b?: WorkScope) => b && SCOPE_RANK[b.kind] > SCOPE_RANK[a.kind] ? b : a;
/** Scope choices offered to an author: the wide group is skipped when it is the final group itself. */
export function scopeChoices(group: GroupOption): { scope: WorkScope; label: string; detail: string }[] {
  const choices = (['group', 'wide', 'promo'] as ScopeKind[]).map(kind => ({ scope: scopeFor(group, kind), label: '', detail: '' }));
  return choices.filter((choice, index) => index !== 1 || scopeMembers(choice.scope).length > 1).map(choice => ({ ...choice, label: scopeLabel(choice.scope), detail: choice.scope.kind === 'wide' ? scopeMembers(choice.scope).map(group => group.label).join(' + ') : choice.scope.kind === 'promo' ? 'toute la promo' : 'mon sous-groupe' }));
}
/** Short tag of a scope: #B1, #B, #MMI-2. */
export function scopeTag(scope: WorkScope): string {
  if (scope.kind === 'group') return groupById(scope.key)?.label.replace(/\s+/g, '') ?? '';
  if (scope.kind === 'wide') return (scope.key.split('|')[1] ?? '').replace(/\s+/g, '');
  return scope.key;
}

// ---------------------------------------------------------------------------
// Deadlines (Paris time). A deadline without a time is set to 23:59 on that day.
// ---------------------------------------------------------------------------
export const DEFAULT_DUE_TIME = '23:59';
const parisParts = new Intl.DateTimeFormat('en-GB', { timeZone: TIMETABLE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** Offset of Paris time from UTC at an instant, in ms (whole date, so month and year boundaries are right). */
function parisOffset(at: number) {
  const parts = Object.fromEntries(parisParts.formatToParts(new Date(at)).map(part => [part.type, Number(part.value)]));
  return Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!) - Math.floor(at / 60000) * 60000;
}
/** UTC instant of a Paris wall-clock time. */
export function parisInstant(day: string, time = DEFAULT_DUE_TIME): string {
  const [h, m] = time.split(':').map(Number);
  const wall = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), h!, m!);
  // Second pass: the offset of the result itself (correct around daylight saving changes).
  const first = wall - parisOffset(wall);
  return new Date(wall - parisOffset(first)).toISOString();
}
export const validTime = (value: unknown): value is string => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

/** Countdown shown on labels: in the past, today, tomorrow, J-n. Level grows as the deadline nears (like change badges). */
export function countdown(dueDay: string, today: string): { label: string; level: 0 | 1 | 2 | 3 | 4; late: boolean } {
  const days = Math.round((Date.parse(dueDay + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 86400000);
  if (days < 0) return { label: 'en retard', level: 4, late: true };
  if (days === 0) return { label: 'aujourd’hui', level: 4, late: false };
  if (days === 1) return { label: 'demain', level: 3, late: false };
  return { label: `J-${days}`, level: days <= 3 ? 2 : days <= 7 ? 1 : 0, late: false };
}

// ---------------------------------------------------------------------------
// Links: every site is allowed, the domain is always shown, shorteners are refused.
// ---------------------------------------------------------------------------
export const SHORTENERS = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'cutt.ly', 'rebrand.ly', 'shorturl.at', 'tiny.cc', 'rb.gy', 'bl.ink', 'lnkd.in', 'shorte.st', 'adf.ly', 'v.gd', 's.id', 'urlz.fr', 'qrco.de', 'tr.ee', 'x.gd', 'short.io', 'u.to', 'clck.ru'];
export function checkLink(value: string): { url: string; domain: string } | { error: string } {
  let url: URL;
  try { url = new URL(value.trim()); } catch { return { error: 'Lien invalide : il doit commencer par https://' }; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { error: 'Seuls les liens web (https://) sont acceptés.' };
  if (url.username || url.password) return { error: 'Les liens avec identifiants sont refusés.' };
  const domain = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!domain.includes('.') || /^\d+(\.\d+){3}$/.test(domain)) return { error: 'Le lien doit pointer vers un nom de domaine.' };
  if (SHORTENERS.some(item => domain === item || domain.endsWith('.' + item))) return { error: 'Les raccourcisseurs de liens sont refusés : collez l’adresse complète.' };
  if (url.href.length > 500) return { error: 'Lien trop long.' };
  return { url: url.href, domain };
}
export const linkDomain = (value: string) => { try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return value; } };

// ---------------------------------------------------------------------------
// Accounts: any address ending in .uvsq.fr (students are @ens.uvsq.fr). Staff (@uvsq.fr) may confirm later.
// ---------------------------------------------------------------------------
export const normalizeEmail = (value: string) => value.trim().toLowerCase();
export const isStudentEmail = (value: string) => /^[a-z0-9][a-z0-9._%+-]{0,63}@([a-z0-9-]+\.)+uvsq\.fr$/.test(normalizeEmail(value));
export const isStaffEmail = (value: string) => /^[a-z0-9][a-z0-9._%+-]{0,63}@uvsq\.fr$/.test(normalizeEmail(value));
const capital = (word: string) => word.split('-').map(part => part ? part[0]!.toUpperCase() + part.slice(1) : part).join('-');
/** First and last name guessed from the address (prenom.nom2@…). The person can ask for a correction. */
export function nameFromEmail(email: string): { firstName: string; lastName: string } {
  const local = normalizeEmail(email).split('@')[0]!.replace(/\d+$/, '');
  const [first = '', ...rest] = local.split(/[._]/).filter(Boolean);
  return { firstName: capital(first), lastName: rest.map(capital).join(' ') };
}

// ---------------------------------------------------------------------------
// Validation: ≥ 3 👍 and twice as many 👍 as 👎. The author's vote does not count.
// Reliable accounts need 1 or 2 👍. New accounts weigh half for 7 days.
// ---------------------------------------------------------------------------
export type WorkState = 'pending' | 'validated' | 'probable' | 'contested' | 'removed';
export const WORK_STATE_LABELS: Record<WorkState, string> = { pending: 'À confirmer', validated: 'Validé', probable: 'Probablement correct', contested: 'Contesté', removed: 'Retiré' };
export interface Vote { value: 1 | -1; reason?: string; at: string; weight: number }
export const NEW_ACCOUNT_DAYS = 7;
export const voteWeight = (accountCreatedAt: string, now = Date.now()) => now - Date.parse(accountCreatedAt) < NEW_ACCOUNT_DAYS * 86400000 ? 0.5 : 1;
/** 👍 needed by the author's reliability. */
export const requiredUpvotes = (authorReliability: number) => authorReliability >= 10 ? 1 : authorReliability >= 5 ? 2 : 3;
export function tally(votes: Record<string, Vote>, authorId: string) {
  let up = 0, down = 0, upCount = 0, downCount = 0;
  for (const [voter, vote] of Object.entries(votes)) {
    if (voter === authorId) continue;
    if (vote.value > 0) { up += vote.weight; upCount++; } else { down += vote.weight; downCount++; }
  }
  return { up, down, upCount, downCount };
}
export function voteState(votes: Record<string, Vote>, authorId: string, createdAt: string, authorReliability: number, now = Date.now()): Exclude<WorkState, 'removed'> {
  const { up, down, upCount, downCount } = tally(votes, authorId);
  if (up >= requiredUpvotes(authorReliability) && up >= 2 * down) return 'validated';
  if (downCount >= 2 && down > up) return 'contested';
  if (now - Date.parse(createdAt) >= 48 * 3600000 && upCount >= 1 && downCount === 0) return 'probable';
  return 'pending';
}
export const CONTEST_REASONS = ['N’existe pas', 'Mauvaise date', 'Doublon', 'Autre'] as const;

// ---------------------------------------------------------------------------
// Shapes exchanged with the API
// ---------------------------------------------------------------------------
/** audience: CELCAT groups of the course ("MMI2", "MMI2-B"…), so the work reaches everyone attending it. */
export interface CourseLink { uid: string; start: string; module: string; summary: string; type?: string; location?: string; audience?: string }
export interface WorkDetails { where: string; format: string; mode: '' | 'seul' | 'groupe'; info: string }
export interface DsInfo { chapters: string; allowed: string[]; duration: string; advice: string }
export const DS_ALLOWED = ['Aucun document', 'Calculatrice', 'Notes', 'Documents imprimés', 'Ordinateur'] as const;
/** personal: visible only by its author (no vote), otherwise shared with the scope. */
export interface WorkInput { type: WorkType; title: string; day: string; time?: string; scope: WorkScope; course?: CourseLink; details: WorkDetails; links: string[]; ds?: DsInfo; personal?: boolean;
  /** Chosen by the device: sending the same work twice (offline retry) creates it once. */
  clientId?: string }
export interface PublicLink { url: string; domain: string; active: boolean }
export interface WorkProposalView { id: string; kind: 'edit' | 'delete'; author: string; reason?: string; changes: { field: string; label: string; before: string; after: string }[]; up: number; down: number; myVote?: 1 | -1; mine: boolean; createdAt: string }
export interface WorkView {
  id: string; type: WorkType; title: string; due: string; day: string; time: string; hasTime: boolean; scope: WorkScope; scopeLabel: string;
  course?: CourseLink; details: WorkDetails; links: PublicLink[]; ds?: DsInfo; author: string; authorId?: string; createdAt: string; updatedAt: string;
  state: WorkState; up: number; down: number; required: number; myVote?: 1 | -1; mine: boolean; reasons: string[]; proposal?: WorkProposalView;
  teacherConfirmed?: string; voters?: { name: string; value: 1 | -1; reason?: string }[]; personal?: boolean;
  /** Created offline, not sent yet (client only). */
  local?: boolean;
}
export interface HistoryEntry { at: string; by: string; action: string; detail?: string }
export type Role = 'student' | 'delegate' | 'admin' | 'teacher';
export interface Me {
  id: string; email: string; firstName: string; lastName: string; groupId?: string; groupChangeAllowed: boolean; role: Role; delegateScope?: string[];
  reliability: number; reliabilityLabel: string; readOnlyUntil?: string; banned?: boolean; createdAt: string; cguAccepted: boolean; newAccount: boolean;
}
export const reliabilityLabel = (score: number) => score >= 10 ? 'excellente' : score >= 5 ? 'bonne' : score >= 0 ? 'normale' : 'faible';

export const LIMITS = { title: 120, field: 500, info: 1500, links: 5, addsPerDay: 10, votesPerHour: 60, note: 2000, reason: 300 } as const;
export const cleanText = (value: unknown, max: number) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, max) : '';

/** Validates and cleans a work sent by a person. */
export function parseWorkInput(body: unknown): WorkInput | { error: string } {
  const value = body as Partial<WorkInput>;
  if (!value || typeof value !== 'object') return { error: 'Données manquantes.' };
  if (!isWorkType(value.type)) return { error: 'Type de travail inconnu.' };
  const title = cleanText(value.title, LIMITS.title);
  if (title.length < 2) return { error: 'Le titre est trop court.' };
  if (typeof value.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.day) || new Date(value.day).toISOString().slice(0, 10) !== value.day) return { error: 'Date invalide.' };
  if (value.time !== undefined && value.time !== '' && !validTime(value.time)) return { error: 'Heure invalide.' };
  if (!validScope(value.scope)) return { error: 'Portée invalide.' };
  const details = value.details ?? {} as WorkDetails;
  const links: string[] = [];
  for (const raw of (Array.isArray(value.links) ? value.links : []).slice(0, LIMITS.links)) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const checked = checkLink(raw);
    if ('error' in checked) return checked;
    links.push(checked.url);
  }
  let course: CourseLink | undefined;
  if (value.course) {
    const c = value.course;
    if (typeof c.uid !== 'string' || typeof c.start !== 'string' || !Number.isFinite(Date.parse(c.start))) return { error: 'Cours lié invalide.' };
    course = { uid: c.uid.slice(0, 200), start: c.start, module: cleanText(c.module, 200), summary: cleanText(c.summary, 200), type: cleanText(c.type, 80), location: cleanText(c.location, 120), audience: cleanText(c.audience, 200) || undefined };
  }
  let ds: DsInfo | undefined;
  if (value.ds) ds = { chapters: cleanText(value.ds.chapters, LIMITS.field), allowed: (Array.isArray(value.ds.allowed) ? value.ds.allowed : []).filter(item => (DS_ALLOWED as readonly string[]).includes(item)), duration: cleanText(value.ds.duration, 60), advice: cleanText(value.ds.advice, LIMITS.field) };
  return {
    type: value.type, title, day: value.day, time: value.time || undefined, scope: { kind: value.scope.kind, key: value.scope.key }, course, ds, links, personal: value.personal === true || undefined,
    clientId: typeof value.clientId === 'string' && /^[a-z0-9-]{8,40}$/i.test(value.clientId) ? value.clientId : undefined,
    details: { where: cleanText(details.where, LIMITS.field), format: cleanText(details.format, LIMITS.field), mode: details.mode === 'seul' || details.mode === 'groupe' ? details.mode : '', info: cleanText(details.info, LIMITS.info) },
  };
}

/** Works close to a draft (same type, same scope family, within a day, similar title): offered before creating a duplicate. */
const words = (value: string) => new Set(value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 2));
export function similarWorks<T extends { type: WorkType; day: string; title: string; state: WorkState }>(draft: { type: WorkType; day: string; title?: string }, works: T[]): T[] {
  const target = words(draft.title ?? '');
  return works.filter(work => work.state !== 'removed' && work.type === draft.type && Math.abs(Date.parse(work.day) - Date.parse(draft.day)) <= 86400000)
    .map(work => { const other = words(work.title); const common = [...target].filter(word => other.has(word)).length; return { work, score: common / Math.max(1, Math.min(target.size, other.size)) + (work.day === draft.day ? 0.5 : 0) }; })
    .filter(item => item.score >= 0.5 || !target.size).sort((a, b) => b.score - a.score).map(item => item.work).slice(0, 3);
}

/** Semester of a date: September–January, then February–August. Changing group is allowed once per semester. */
export const semesterOf = (iso: string) => { const d = new Date(iso); const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1; return m >= 9 ? `${y}-S1` : m === 1 ? `${y - 1}-S1` : `${y}-S2`; };

// ---------------------------------------------------------------------------
// ICS: one subscription link per group, with a reminder the day before.
// ---------------------------------------------------------------------------
const icsText = (value: string) => value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsDate = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const fold = (line: string) => { const out: string[] = []; let rest = line; while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = ' ' + rest.slice(74); } out.push(rest); return out.join('\r\n'); };
/** includePersonal: a single personal work exported by its author. */
export function worksToIcs(groupLabel: string, works: WorkView[], origin: string, now = new Date(), includePersonal = false): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Vencat//Travaux//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsText('Travaux · ' + groupLabel)}`, 'X-WR-TIMEZONE:Europe/Paris', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H'];
  for (const work of works) {
    if (work.state === 'removed' || (work.personal && !includePersonal)) continue;
    const start = new Date(Date.parse(work.due) - (work.hasTime ? 0 : 30 * 60000)).toISOString();
    const description = [WORK_STATE_LABELS[work.state], work.details.where && 'Où : ' + work.details.where, work.details.format && 'Format : ' + work.details.format, work.details.info, ...work.links.map(link => link.url), `${origin}/?travail=${work.id}`].filter(Boolean).join('\n');
    lines.push('BEGIN:VEVENT', `UID:${work.id}@vencat`, `DTSTAMP:${icsDate(now.toISOString())}`, `DTSTART:${icsDate(start)}`, `DTEND:${icsDate(work.due)}`,
      `SUMMARY:${icsText(`${WORK_TYPE_LABELS[work.type]} · ${work.title}${work.state === 'validated' ? '' : ' (' + WORK_STATE_LABELS[work.state].toLowerCase() + ')'}`)}`,
      `DESCRIPTION:${icsText(description)}`, `URL:${origin}/travaux/${work.id}`, 'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(WORK_TYPE_LABELS[work.type] + ' demain : ' + work.title)}`, 'TRIGGER:-P1D', 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** One timetable course as an event (location, teachers, reminder 15 minutes before). */
export function courseToIcs(course: { uid: string; summary: string; type: string; start: string; end: string; location: string; teachers: string[]; module: string }, origin: string, now = new Date()): string {
  const type = course.type && course.type !== 'inconnu' ? course.type + ' · ' : '';
  const description = [course.module && course.module !== course.summary ? course.module : '', course.teachers.join(', '), origin].filter(Boolean).join('\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Vencat//Cours//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${icsText(course.uid + '-' + course.start)}@vencat`, `DTSTAMP:${icsDate(now.toISOString())}`, `DTSTART:${icsDate(new Date(course.start).toISOString())}`, `DTEND:${icsDate(new Date(course.end).toISOString())}`,
    `SUMMARY:${icsText(type + course.summary)}`, `LOCATION:${icsText(course.location)}`, `DESCRIPTION:${icsText(description)}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(type + course.summary)}`, 'TRIGGER:-PT15M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'];
  return lines.map(fold).join('\r\n') + '\r\n';
}
