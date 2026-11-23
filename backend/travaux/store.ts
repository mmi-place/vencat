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
}

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
}

class NeonStore implements DocStore {
  private ready: Promise<void> | undefined;
  private sql: ((query: string, params?: unknown[]) => Promise<Record<string, unknown>[]>) | undefined;
  constructor(private url: string) {}
  private async db() {
    if (!this.sql) {
      const { neon } = await import('@neondatabase/serverless');
      const client = neon(this.url);
      this.sql = (query, params = []) => client.query(query, params) as Promise<Record<string, unknown>[]>;
    }
    this.ready ??= this.sql(`CREATE TABLE IF NOT EXISTS vencat_docs (col text NOT NULL, id text NOT NULL, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (col, id))`).then(() => undefined);
    await this.ready;
    return this.sql;
  }
  async get<T>(col: string, id: string) { const rows = await (await this.db())('SELECT data FROM vencat_docs WHERE col = $1 AND id = $2', [col, id]); return rows[0]?.data as T | undefined; }
  async put<T>(col: string, id: string, doc: T) { await (await this.db())('INSERT INTO vencat_docs (col, id, data) VALUES ($1, $2, $3) ON CONFLICT (col, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()', [col, id, JSON.stringify(doc)]); }
  async delete(col: string, id: string) { await (await this.db())('DELETE FROM vencat_docs WHERE col = $1 AND id = $2', [col, id]); }
  async list<T>(col: string, prefix = '') {
    const escaped = prefix.replace(/[\\%_]/g, match => '\\' + match);
    return (await (await this.db())('SELECT data FROM vencat_docs WHERE col = $1 AND id LIKE $2', [col, escaped + '%'])).map(row => row.data as T);
  }
}

let instance: DocStore | undefined;
export function store(): DocStore {
  if (instance) return instance;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (url) return instance = new NeonStore(url);
  // Automated tests never touch the local data file.
  const testing = process.env.NODE_ENV === 'test' || !!process.env.NODE_TEST_CONTEXT;
  const file = testing ? undefined : process.env.TRAVAUX_DATA_FILE ?? resolve(process.cwd(), '.data/travaux.json');
  return instance = new FileStore(file);
}
/** Tests use a fresh in-memory store. */
export function useMemoryStore() { instance = new FileStore(); return instance; }
export const persistentStore = () => !!(process.env.DATABASE_URL || process.env.POSTGRES_URL);
