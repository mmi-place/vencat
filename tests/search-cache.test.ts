import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchDataset, type SearchDataset } from '../backend/search.js';
import { searchScopes } from '../shared/search.js';

test('Redis search caches use remaining data lifetime for every requested scope', async () => {
  const names = ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'] as const;
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  for (const name of names) delete process.env[name];
  process.env.KV_REST_API_URL = 'https://redis.test'; process.env.KV_REST_API_TOKEN = 'test-only';
  const writes: (string | number)[][] = [];
  globalThis.fetch = async (_input, init) => {
    const command = JSON.parse(String(init?.body)) as (string | number)[];
    assert.ok(command[0] === 'GET' || command[0] === 'SET');
    if (command[0] === 'SET') writes.push(command);
    return Response.json({ result: command[0] === 'GET' ? null : 'OK' });
  };
  try {
    for (const scope of searchScopes) {
      const seed: SearchDataset = { version: 1, groupId: 'test-cache-' + scope.id, start: '2026-09-01', end: '2027-08-31', fetchedAt: new Date(Date.now() - 60000).toISOString(), courses: [] };
      const data = await searchDataset(seed.groupId, scope.id, '2026-10-05', seed);
      assert.equal(data.fetchedAt, seed.fetchedAt);
      const write = writes.at(-1)!;
      assert.equal(write[3], 'EX');
      assert.ok(Number(write[4]) <= scope.ttl - 60 && Number(write[4]) >= scope.ttl - 62);
      await searchDataset(seed.groupId, scope.id, '2026-10-05', seed);
    }
    assert.equal(writes.length, searchScopes.length);
    let now = originalNow(); Date.now = () => now;
    const seed: SearchDataset = { version: 1, groupId: 'test-index-version', start: '2026-09-01', end: '2027-08-31', fetchedAt: new Date(now).toISOString(), courses: [{ uid: 'c', start: '2026-10-05T06:00:00Z', end: '2026-10-05T08:00:00Z', summary: 'Web', module: 'R101', location: 'E57', type: 'TD', source: 'post', teachers: ['Dupont'], rooms: ['E57'] }] };
    const first = await searchDataset(seed.groupId, 'week', '2026-10-05', seed);
    assert.equal(first.index!.facets.teacher[0]!.value, 'Dupont');
    now += 620000;
    const second = await searchDataset(seed.groupId, 'week', '2026-10-05', { ...seed, fetchedAt: new Date(now).toISOString(), courses: seed.courses.map(course => ({ ...course, teachers: ['Martin'] })) });
    assert.notEqual(first.index!.version, second.index!.version);
    assert.equal(second.index!.facets.teacher[0]!.value, 'Martin');
  } finally {
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
  }
});
