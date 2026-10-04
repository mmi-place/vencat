import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import app from '../backend/app.js';
import { fetchCourses } from '../src/scripts/api.js';

const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Missing test server');
const base = `http://127.0.0.1:${address.port}/api`;
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; server.close(); });

test('annual server search validates input, fetches bounded chunks and reuses data across queries', async () => {
  for (const query of ['', '?q=web&scope=nope', '?q=web&date=2026-02-30', '?q=web&teacher=a&teacher=b', '?q=web&start=2028-01-01', '?q=web&start=2028-01-01&end=2030-01-01']) assert.equal((await originalFetch(`${base}/search/G1-QJ2DMFYC5987${query}`)).status, 400);
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input).startsWith('http://127.0.0.1:')) return originalFetch(input, init);
    calls++;
    const body = new URLSearchParams(String(init?.body));
    assert.ok((Date.parse(body.get('end')!) - Date.parse(body.get('start')!)) / 86400000 <= 59);
    return Response.json([{ id: 'search-' + calls, start: body.get('start') + 'T08:00:00', end: body.get('start') + 'T10:00:00', allDay: false, description: 'Jean Dupont\r\n<br />MMI1-A1\r\n<br />E57 - VEL\r\n<br />R101 - Développement Web [MM1R01]', eventCategory: 'Travaux Dirigés (TD)', modules: ['MM1R01'], sites: ['VEL'] }]);
  };
  try {
    const first = await fetch(`${base}/search/G1-QJ2DMFYC5987?q=developpement&scope=year&date=2028-10-05`);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('cache-control'), 'no-store');
    const result = await first.json() as { courses: unknown[]; ttl: number; start: string; end: string; version: string; facetsVersion: string; facets: { teacher: { value: string }[] } };
    assert.equal(result.ttl, 1209600); assert.equal(result.start, '2028-09-01'); assert.equal(result.end, '2029-08-31');
    assert.equal(result.courses.length, 7); assert.equal(calls, 7);
    assert.equal(result.facets.teacher[0]!.value, 'Jean Dupont');
    const second = await (await fetch(`${base}/search/G1-QJ2DMFYC5987?q=absent&scope=year&date=2028-10-05`)).json() as { courses: unknown[]; version: string; facetsVersion: string };
    assert.equal(second.courses.length, 0); assert.equal(calls, 7);
    assert.equal(result.version, second.version); assert.notEqual(result.facetsVersion, second.facetsVersion);
    const browse = await (await fetch(`${base}/search/G1-QJ2DMFYC5987?q=&date=2028-10-05`)).json() as { courses: unknown[]; facets: { teacher: { value: string }[] } };
    assert.equal(browse.courses.length, 7); assert.equal(browse.facets.teacher[0]!.value, 'Jean Dupont'); assert.equal(calls, 7);
    const custom = await (await fetch(`${base}/search/G1-QJ2DMFYC5987?q=web&date=2028-10-05&start=2028-09-15&end=2028-09-16`)).json() as { courses: unknown[]; start: string; end: string; ttl: number };
    assert.equal(custom.start, '2028-09-15'); assert.equal(custom.end, '2028-09-16'); assert.equal(custom.ttl, 600); assert.equal(custom.courses.length, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('health and invalid input', async () => {
  assert.equal(await (await fetch(`${base}/ping`)).text(), 'pong');
  for (const query of ['', '?start=2026-02-30', '?start=2026-01-31&end=2026-01-01', '?start=2026-01-01&end=2026-12-31', '?start=2026-01-01&start=2026-01-02']) {
    const response = await fetch(`${base}/edt/test${query}`);
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.ok((await response.json() as { error: string }).error);
  }
});

test('short planning windows are persisted in Redis and keep their original freshness', async () => {
  const names = ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'] as const;
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  process.env.KV_REST_API_URL = 'https://redis.test'; process.env.KV_REST_API_TOKEN = 'test-only';
  const saved = new Map<string, string>(); let upstream = 0, writes = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input).startsWith('http://127.0.0.1:')) return originalFetch(input, init);
    if (String(input) === 'https://redis.test') {
      const command = JSON.parse(String(init?.body));
      if (command[0] === 'GET') return Response.json({ result: saved.get(command[1]) ?? null });
      assert.equal(command[0], 'SET'); assert.equal(command[3], 'EX');
      assert.ok(command[4] <= 600 && command[4] >= 598);
      saved.set(command[1], command[2]); writes++;
      return Response.json({ result: 'OK' });
    }
    upstream++; return Response.json([]);
  };
  try {
    const url = `${base}/edt/G1-QJ2DMFYC5987?start=2029-10-01&end=2029-10-07&format=snapshot`;
    const first = await (await fetch(url)).json();
    const second = await (await fetch(url)).json();
    assert.equal(second.fetchedAt, first.fetchedAt); assert.equal(upstream, 1); assert.equal(writes, 1);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
  }
});

test('device notification endpoints are removed and monitoring remains protected', async () => {
  const config = await (await fetch(`${base}/history/config`)).json() as { sharedHistory: boolean };
  assert.equal(config.sharedHistory, false);
  assert.equal((await fetch(`${base}/notifications/config`)).status, 404);
  assert.equal((await fetch(`${base}/monitor`)).status, 401);
  assert.equal((await fetch(`${base}/notifications/subscription`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 404);
});

test('Vercel Marketplace KV credentials activate history and authenticate Redis reads', async () => {
  const names = ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'] as const;
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  process.env.KV_REST_API_URL = 'https://redis.test';
  process.env.KV_REST_API_TOKEN = 'test-only-token';
  let reads = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input) !== 'https://redis.test') return originalFetch(input, init);
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer test-only-token');
    const command = JSON.parse(String(init?.body));
    if (command[0] === 'SADD') { assert.deepEqual(command, ['SADD', 'vencat:monitored', 'G1-QJ2DMFYC5987']); return Response.json({ result: 1 }); }
    assert.deepEqual(command, ['GET', 'vencat:history:G1-QJ2DMFYC5987']);
    reads++;
    return Response.json({ result: '[]' });
  };
  try {
    const config = await (await fetch(`${base}/history/config`)).json() as { sharedHistory: boolean };
    assert.equal(config.sharedHistory, true);
    const response = await fetch(`${base}/changes/G1-QJ2DMFYC5987`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), []);
    assert.equal(reads, 1);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
  }
});

test('POST normalization through the shared API contract and backend cache', async () => {
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input).startsWith('/api/')) return originalFetch(base.replace(/\/api$/, '') + input, init);
    if (String(input).startsWith('http://127.0.0.1:')) return originalFetch(input, init);
    calls++;
    assert.equal(init?.method, 'POST');
    const body = new URLSearchParams(String(init?.body));
    assert.equal(body.get('federationIds[]'), 'MMI1-A1');
    assert.equal(body.get('end'), '2026-02-05');
    return Response.json([{
      id: 'course-1', start: '2026-02-02T08:00:00Z', end: '2026-02-02T10:00:00Z',
      allDay: false, description: 'Jean Dupont\r\n<br />MMI1-A1\r\n<br />E57 - VEL\r\n<br />R101 - Web [MM1R01]',
      eventCategory: 'Travaux Dirigés (TD)', modules: ['MM1R01'], sites: ['VEL'],
    }]);
  };
  try {
    const response = await fetch(`${base}/edt/G1-QJ2DMFYC5987?start=2026-01-31`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control')!, /s-maxage=600/);
    const data = await response.json() as { roomClean: string }[];
    assert.equal(data[0].roomClean, 'E57 - VEL');
    const courses = await fetchCourses('G1-QJ2DMFYC5987', new Date(2026, 0, 31), new Date(2026, 1, 5));
    assert.equal(courses[0]!.summary, 'Web');
    assert.equal(courses[0]!.type, 'TD');
    assert.equal(courses[0]!.location, 'E57 - VEL');
    assert.ok(courses[0]!.start instanceof Date);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('failed POST falls back to iCalendar across month boundary', async () => {
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input).startsWith('http://127.0.0.1:')) return originalFetch(input, init);
    calls++;
    if (init?.method === 'POST') return new Response('unavailable', { status: 503 });
    return new Response([
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:fallback-1',
      'DTSTART:20260302T080000Z', 'DTEND:20260302T100000Z', 'SUMMARY:R101 - Web; TD',
      'LOCATION:E57', 'DESCRIPTION:Jean Dupont; MMI1-A2', 'END:VEVENT', 'END:VCALENDAR', '',
    ].join('\r\n'));
  };
  try {
    const response = await fetch(`${base}/edt/G1-PW2GUKMM5988?start=2026-02-28`);
    assert.equal(response.status, 200);
    const events = await response.json() as { uid: string }[];
    assert.equal(events.length, 1);
    assert.equal(events[0].uid, 'fallback-1');
    assert.equal(calls, 2);
  } finally { globalThis.fetch = originalFetch; }
});

test('upstream failures return uncached JSON', async () => {
  globalThis.fetch = async (input, init) => {
    if (String(input).startsWith('http://127.0.0.1:')) return originalFetch(input, init);
    return new Response('unavailable', { status: 503 });
  };
  try {
    const response = await fetch(`${base}/edt/test-unavailable?start=2026-01-31`);
    assert.equal(response.status, 502);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.ok((await response.json() as { error: string }).error);
  } finally { globalThis.fetch = originalFetch; }
});
