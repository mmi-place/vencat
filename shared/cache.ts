export class TTLCache {
  private entries = new Map<string, { value: unknown; expires: number }>();
  constructor(private ttlMs: number, private maxKeys = 1000, private now = Date.now) {}

  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= this.now()) { this.entries.delete(key); return undefined; }
    return entry.value as T;
  }

  set(key: string, value: unknown): void {
    const now = this.now();
    for (const [key, entry] of this.entries) if (entry.expires <= now) this.entries.delete(key);
    this.entries.delete(key);
    if (this.entries.size >= this.maxKeys) this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(key, { value, expires: now + this.ttlMs });
  }
}
