const redisCredentials = () => process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? { url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN }
  : { url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN };
export const configured = () => { const { url, token } = redisCredentials(); return !!(url && token); };
export async function redis<T>(...command: (string | number)[]): Promise<T> {
  const { url, token } = redisCredentials();
  const response = await fetch(url!, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(command), signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Stockage indisponible');
  const result = await response.json() as { result: T; error?: string }; if (result.error) throw new Error(result.error); return result.result;
}
