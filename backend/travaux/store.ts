import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// Document store of the Travaux section. One table, one row per document:
// Postgres (Neon, Vercel Marketplace) when DATABASE_URL is set, otherwise memory with a local JSON file
// (development only: a serverless instance cannot keep files).
export interface DocStore {
  get<T>(col: string, id: string): Promise<T | undefined>;
  put<T>(col: string, id: string, doc: T): Promise<void>;
  delete(col: string, id: string): Promise<void>;
  list<T>(col: string, prefix?: string): Promise<T[]>;
  /** Documents whose top-level field equals a value (filtered by the database, not after loading everything). */
  find<T>(col: string, field: string, value: string): Promise<T[]>;
  /** Several documents by id, in one query. */
  getMany<T>(col: string, ids: string[]): Promise<T[]>;
  /** Deletes the documents whose top-level date field is older than `before` (ISO); returns how many. */
  purge(col: string, field: string, before: string): Promise<number>;
}
const FIELD = /^[A-Za-z][A-Za-z0-9]*$/;

class FileStore implements DocStore {
  private data = new Map<string, Map<string, unknown>>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private file?: string) {
    if (!file) return;
    try {
      const saved = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<string, unknown>>;
      for (const [col, docs] of Object.entries(saved)) this.data.set(col, new Map(Object.entries(docs)));
    } catch { /* First start: empty store. */ }
  }
  private col(name: string) { let col = this.data.get(name); if (!col) this.data.set(name, col = new Map()); return col; }
  private save() {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      const out = Object.fromEntries([...this.data].map(([col, docs]) => [col, Object.fromEntries(docs)]));
      mkdirSync(dirname(this.file!), { recursive: true });
      writeFileSync(this.file + '.tmp', JSON.stringify(out));
      renameSync(this.file + '.tmp', this.file!);
    }, 200);
  }
  async get<T>(col: string, id: string) { const doc = this.col(col).get(id); return doc === undefined ? undefined : structuredClone(doc) as T; }
  async put<T>(col: string, id: string, doc: T) { this.col(col).set(id, structuredClone(doc)); this.save(); }
  async delete(col: string, id: string) { this.col(col).delete(id); this.save(); }
  async list<T>(col: string, prefix = '') { return [...this.col(col)].filter(([id]) => id.startsWith(prefix)).map(([, doc]) => structuredClone(doc) as T); }
  async find<T>(col: string, field: string, value: string) { return [...this.col(col).values()].filter(doc => (doc as Record<string, unknown>)[field] === value).map(doc => structuredClone(doc) as T); }
  async getMany<T>(col: string, ids: string[]) { return ids.flatMap(id => { const doc = this.col(col).get(id); return doc === undefined ? [] : [structuredClone(doc) as T]; }); }
  async purge(col: string, field: string, before: string) {
    let count = 0;
    for (const [id, doc] of [...this.col(col)]) { const value = (doc as Record<string, unknown>)[field]; if (typeof value === 'string' && value < before) { this.col(col).delete(id); count++; } }
    if (count) this.save();
    return count;
  }
}

class NeonStore implements DocStore {
  private ready: Promise<void> | undefined;
  private sql: ((query: string, params?: unknown[]) => Promise<Record<string, unknown>[]>) | undefined;
  constructor(private url: string, private table = 'vencat_docs') {}
  private async db() {
    if (!this.sql) {
      const { neon } = await import('@neondatabase/serverless');
      const client = neon(this.url);
      this.sql = (query, params = []) => client.query(query, params) as Promise<Record<string, unknown>[]>;
    }
    // A failed creation (Neon waking up, network blip) is not kept: the next call tries again.
    this.ready ??= this.sql(`CREATE TABLE IF NOT EXISTS ${this.table} (col text NOT NULL, id text NOT NULL, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (col, id))`).then(() => undefined, error => { this.ready = undefined; throw error; });
    await this.ready;
    return this.sql;
  }
  async get<T>(col: string, id: string) { const rows = await (await this.db())(`SELECT data FROM ${this.table} WHERE col = $1 AND id = $2`, [col, id]); return rows[0]?.data as T | undefined; }
  async put<T>(col: string, id: string, doc: T) { await (await this.db())(`INSERT INTO ${this.table} (col, id, data) VALUES ($1, $2, $3) ON CONFLICT (col, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [col, id, JSON.stringify(doc)]); }
  async delete(col: string, id: string) { await (await this.db())(`DELETE FROM ${this.table} WHERE col = $1 AND id = $2`, [col, id]); }
  async list<T>(col: string, prefix = '') {
    const escaped = prefix.replace(/[\\%_]/g, match => '\\' + match);
    return (await (await this.db())(`SELECT data FROM ${this.table} WHERE col = $1 AND id LIKE $2`, [col, escaped + '%'])).map(row => row.data as T);
  }
  async find<T>(col: string, field: string, value: string) {
    if (!FIELD.test(field)) throw new Error('Invalid field');
    return (await (await this.db())(`SELECT data FROM ${this.table} WHERE col = $1 AND data->>'${field}' = $2`, [col, value])).map(row => row.data as T);
  }
  async getMany<T>(col: string, ids: string[]) {
    if (!ids.length) return [];
    return (await (await this.db())(`SELECT data FROM ${this.table} WHERE col = $1 AND id = ANY($2)`, [col, ids])).map(row => row.data as T);
  }
  async purge(col: string, field: string, before: string) {
    if (!FIELD.test(field)) throw new Error('Invalid field');
    const rows = await (await this.db())(`DELETE FROM ${this.table} WHERE col = $1 AND data->>'${field}' < $2 RETURNING 1`, [col, before]);
    return rows.length;
  }
}

/** Short per-instance cache of the list of accounts (read by almost every request for names), cleared at every write on accounts. */
class CachedStore implements DocStore {
  private users: { at: number; docs: unknown[] } | undefined;
  constructor(private inner: DocStore, private ttlMs = 5000) {}
  get<T>(col: string, id: string) { return this.inner.get<T>(col, id); }
  async put<T>(col: string, id: string, doc: T) { if (col === 'users') this.users = undefined; await this.inner.put(col, id, doc); }
  async delete(col: string, id: string) { if (col === 'users') this.users = undefined; await this.inner.delete(col, id); }
  async list<T>(col: string, prefix?: string) {
    if (col !== 'users' || prefix) return this.inner.list<T>(col, prefix);
    if (!this.users || Date.now() - this.users.at > this.ttlMs) this.users = { at: Date.now(), docs: await this.inner.list<unknown>('users') };
    return structuredClone(this.users.docs) as T[];
  }
  find<T>(col: string, field: string, value: string) { return this.inner.find<T>(col, field, value); }
  getMany<T>(col: string, ids: string[]) { return this.inner.getMany<T>(col, ids); }
  async purge(col: string, field: string, before: string) { if (col === 'users') this.users = undefined; return this.inner.purge(col, field, before); }
}

let instance: DocStore | undefined, planning: DocStore | undefined;
export function store(): DocStore {
  if (instance) return instance;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (url) return instance = new CachedStore(new NeonStore(url));
  // Automated tests never touch the local data file.
  const testing = process.env.NODE_ENV === 'test' || !!process.env.NODE_TEST_CONTEXT;
  const file = testing ? undefined : process.env.TRAVAUX_DATA_FILE ?? resolve(process.cwd(), '.data/travaux.json');
  return instance = new CachedStore(new FileStore(file));
}
/** Timetable data that can be rebuilt from CELCAT (reference weeks, change history) lives in its own table,
 *  apart from the accounts and contributions: purges, exports and backups of people never touch it. */
export function planningStore(): DocStore {
  if (planning) return planning;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  return planning = url ? new NeonStore(url, 'vencat_planning') : store();
}
/** Tests use a fresh in-memory store. */
export function useMemoryStore() { instance = new CachedStore(new FileStore()); planning = undefined; return instance; }
export const persistentStore = () => !!(process.env.DATABASE_URL || process.env.POSTGRES_URL);
