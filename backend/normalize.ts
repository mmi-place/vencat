import { decode } from 'he';
import { repairText } from '../shared/text.js';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { normalizeModule, TIMETABLE_TIME_ZONE, type CourseDTO } from '../shared/courses.js';

export interface CelcatPostEvent {
  id: string;
  start: string;
  end: string | null;
  allDay: boolean;
  description: string;
  eventCategory: string;
  modules: string[] | null;
  sites: string[] | null;
  department?: string;
  faculty?: string;
  backgroundColor?: string;
  textColor?: string;
}

export interface CalendarEvent {
  uid: string;
  summary: string;
  start: string;
  end: string;
  location: string;
  description: string;
  course: CourseDTO;
  [key: string]: unknown;
}

const clean = (value: string) => repairText(decode(value.replace(/<[^>]*>/g, ''))).replace(/\s+/g, ' ').trim();
const lines = (value: string) => repairText(decode(value.replace(/<[^>]*>/g, ''))).split(/\r?\n|;\s*/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
const plain = (value: unknown): string => typeof value === 'string' ? value :
  value && typeof value === 'object' && 'val' in value ? String(value.val) : '';
const isGroup = (value: string) => /^(?:MMI|INF(?:O)?|RT|GEII|ASUR)\s*\d/i.test(value);
const isModule = (value: string) => /^(?:R\s*\d|SAE\s*\d|MM\d+(?:R|SA)|Portfolio)/i.test(value) || /\[[^\]]+\]/.test(value);

export function parseType(value: string): string {
  const text = clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/entreprise/.test(text)) return 'Entreprise';
  if (/reunion/.test(text)) return 'Réunion';
  if (/tutor|autonomie/.test(text)) return 'Projet Tutoré';
  if (/integration/.test(text)) return 'Integration';
  if (/\bds\b|devoir surveille|examen|evaluation/.test(text)) return 'DS';
  if (/\btp\b|travaux pratiques/.test(text)) return 'TP';
  if (/\btd\b|travaux diriges/.test(text)) return 'TD';
  if (/\bcm\b|cours magistral/.test(text)) return 'CM';
  return 'inconnu';
}

export function parseModuleLabel(value: string, fallbackCode = '') {
  const label = clean(value);
  const bracket = label.match(/\[([^\]]+)\]/)?.[1] ?? '';
  const withoutCode = label.replace(/\s*\[[^\]]+\]\s*$/, '').trim();
  const split = withoutCode.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  const module = normalizeModule(split?.[1] ?? (isModule(withoutCode) ? withoutCode : fallbackCode));
  const summary = split?.[2] ?? (isModule(withoutCode) ? '' : withoutCode);
  return { module, summary, moduleCode: fallbackCode || bracket };
}

// CELCAT POST times have no offset: they are university wall-clock times.
export function toUtc(value: string): string {
  const date = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? new Date(value) : fromZonedTime(value, TIMETABLE_TIME_ZONE);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid CELCAT event date');
  return date.toISOString();
}

export const calendarDate = (value: string) => formatInTimeZone(value, TIMETABLE_TIME_ZONE, 'yyyy-MM-dd');

function parsePostDescription(event: CelcatPostEvent) {
  const blocks = (event.description ?? '').split(/<br\s*\/?\s*>/i).map(block => lines(block)).filter(block => block.length);
  const groupIndex = blocks.findIndex(block => block.some(isGroup));
  const teacherBlocks = groupIndex >= 0 ? blocks.slice(0, groupIndex) : blocks.slice(0, 1);
  const teachers = teacherBlocks.flat().map(value => value.replace(/^\((\d+)\s+more\.\.\.\)$/i, '$1 autres'));
  const tail = blocks.slice(groupIndex >= 0 ? groupIndex : 1).flat();
  const group = [...new Set(tail.filter(isGroup))].join('; ');
  const rest = tail.filter(value => !isGroup(value));
  let moduleIndex = rest.findIndex(isModule);
  if (moduleIndex < 0 && event.modules?.length && rest.length > (event.sites?.length ?? 0)) moduleIndex = rest.length - 1;
  const rooms = moduleIndex >= 0 ? rest.slice(0, moduleIndex) : rest;
  const moduleLabel = moduleIndex >= 0 ? rest.slice(moduleIndex).join('; ') : '';
  return { teachers: [...new Set(teachers)], group, rooms, moduleLabel };
}

export function postEventToCalendarEvent(event: CelcatPostEvent): CalendarEvent | null {
  if (event.allDay) return null;
  const meta = parsePostDescription(event);
  const parsed = parseModuleLabel(meta.moduleLabel, event.modules?.[0] ?? '');
  const multipleLabels = meta.moduleLabel.split('; ').filter(isModule).map(label => parseModuleLabel(label));
  const category = clean(event.eventCategory ?? '');
  const type = parseType(category || meta.moduleLabel);
  const special = type === 'Entreprise' || type === 'Réunion';
  const module = special ? type : parsed.module;
  const summary = (multipleLabels.length > 1 ? multipleLabels.map(label => label.summary || label.module).join(' / ') : parsed.summary) || (special ? type : category) || 'Cours';
  const start = toUtc(event.start);
  const end = toUtc(event.end ?? event.start);
  if (end < start) throw new Error('CELCAT event ends before it starts');
  const location = meta.rooms.join(' / ');
  const course: CourseDTO = {
    uid: event.id, start, end, summary, type, module, teachers: meta.teachers,
    rooms: meta.rooms, location, group: meta.group, moduleCode: parsed.moduleCode, source: 'post',
  };
  return {
    uid: event.id, start, end,
    summary: meta.moduleLabel ? `${meta.moduleLabel}; ${category}` : category || summary,
    description: `${meta.teachers.join('; ')}; ${meta.group}\n\nEvent id: ${event.id}`,
    location, course, eventCategory: category, modules: event.modules, sites: event.sites,
    department: event.department, faculty: event.faculty, allDay: false,
    backgroundColor: event.backgroundColor, textColor: event.textColor,
    teacher: meta.teachers.join('; '), group: meta.group, roomClean: location,
    moduleCode: parsed.moduleCode, codeSimplifier: module,
    moduleLabel: meta.moduleLabel, summaryLabel: summary,
  };
}

export function icalEventToCalendarEvent(event: Record<string, unknown>): CalendarEvent | null {
  if (event.type !== 'VEVENT' || !(event.start instanceof Date) || !(event.end instanceof Date)) return null;
  if ('dateOnly' in event.start && event.start.dateOnly) return null;
  const start = event.start.toISOString();
  const end = event.end.toISOString();
  if (end < start) throw new Error('CELCAT event ends before it starts');
  const rawSummary = repairText(plain(event.summary));
  const [title = '', ...categories] = rawSummary.split(';');
  const parsed = parseModuleLabel(title);
  const type = parseType(categories.join(';') || title);
  const special = type === 'Entreprise' || type === 'Réunion';
  const description = repairText(plain(event.description));
  const people = lines(description.split(/\r?\n\r?\n/)[0] ?? '');
  const teachers = [...new Set(people.filter(value => !isGroup(value)))];
  const group = people.filter(isGroup).join('; ');
  const rooms = lines(plain(event.location));
  const uid = plain(event.uid);
  return {
    uid, start, end, summary: rawSummary, description, location: rooms.join(' / '),
    course: {
      uid, start, end, type, summary: parsed.summary || (special ? type : clean(title)) || 'Cours',
      module: special ? type : parsed.module, teachers, group, rooms,
      location: rooms.join(' / '), moduleCode: parsed.moduleCode, source: 'ical',
    },
  };
}

export function prepareEvents(events: CalendarEvent[], start: string, end: string): CalendarEvent[] {
  const unique = new Map<string, CalendarEvent>();
  for (const event of events) {
    const date = calendarDate(event.start);
    if (date < start || date > end) continue;
    const key = `${event.uid || event.summary}_${event.start}_${event.end}`;
    if (!unique.has(key)) unique.set(key, event);
  }
  return [...unique.values()].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}
