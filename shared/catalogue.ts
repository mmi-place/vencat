import type { CourseDTO } from './courses';
import { repairText } from './text.js';

export const catalogueFiles = { MMI: 'mmi', INF: 'info', RT: 'rt', GEII: 'geii' } as const;
export type CatalogueDepartment = keyof typeof catalogueFiles;
export interface CatalogueEntry {
  title: string;
  description: string;
  confidence: 2 | 3;
  aliases: string[];
}
export interface CourseCatalogue {
  department: CatalogueDepartment;
  version: number;
  entries: Record<string, CatalogueEntry>;
}
export interface CatalogueManifest {
  version: number;
}
export function catalogueDepartment(value: string): CatalogueDepartment | undefined {
  return Object.prototype.hasOwnProperty.call(catalogueFiles, value) ? value as CatalogueDepartment : undefined;
}
// Canonicalisation is scoped to catalogues: it never changes CELCAT course data.
export function catalogueCode(value: string): string {
  const compact = value.toUpperCase().replace(/\s+/g, '').replace(/^APP(?=R)/, '');
  const legacy = compact.match(/^MM([1-6])(R|SA)(\d{2})(CN|DWDI)?/);
  if (legacy) return `${legacy[2] === 'SA' ? 'SAE' : 'R'}${legacy[1]}.${legacy[3]}${legacy[4] ?? ''}`;
  const match = compact.match(/^(R|SAE)([1-6])\.?((?:(?:CREA|DWEB-DI|STRAT-UX|REAL|CYBER|AII|ESE|EME|A)\.)?\d{2}(?:CN|DWDI|ESE)?)(?!\d)/);
  return match ? `${match[1]}${match[2]}.${match[3]}` : '';
}
export function catalogueTitle(value: string): string {
  return repairText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\bapp\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
export function validCatalogue(value: unknown, department: CatalogueDepartment, version?: number): value is CourseCatalogue {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as CourseCatalogue;
  if (candidate.department !== department || !Number.isSafeInteger(candidate.version) || candidate.version < 1 || (version !== undefined && candidate.version !== version)) return false;
  if (!candidate.entries || typeof candidate.entries !== 'object' || Array.isArray(candidate.entries)) return false;
  return Object.keys(candidate.entries).length > 0 && Object.entries(candidate.entries).every(([code, entry]) => code === catalogueCode(code) && entry &&
    typeof entry.title === 'string' && !!entry.title.trim() && typeof entry.description === 'string' && !!entry.description.trim() &&
    [2, 3].includes(entry.confidence) && Array.isArray(entry.aliases) && entry.aliases.every(alias => typeof alias === 'string'));
}
export function courseDescription(catalogue: CourseCatalogue | undefined, course: Pick<CourseDTO, 'module' | 'summary'>): string {
  const entry = catalogue?.entries[catalogueCode(course.module)];
  if (!entry) return '';
  const title = catalogueTitle(course.summary);
  // A known module is enough for generic CELCAT labels, but not for a conflicting named subject.
  const generic = /^(cours magistraux cm|cours magistral cm|travaux diriges td|travaux pratiques tp|cm|td|tp|ds|projet|projets|evaluation|examen)$/.test(title);
  return generic || [entry.title, ...entry.aliases].some(alias => catalogueTitle(alias) === title) ? entry.description : '';
}
