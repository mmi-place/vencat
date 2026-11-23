import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import app from '../backend/app.js';
import { parisClock, prefetchGroups, PREFETCH_HOURS } from '../backend/prefetch.js';

const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Missing test server');
after(() => server.close());

test('the scheduled refresh follows Paris time in winter and summer', () => {
  assert.deepEqual(PREFETCH_HOURS, [2, 14]);
  assert.equal(parisClock(new Date('2026-12-01T13:00:00Z')).hour, 14);
  assert.equal(parisClock(new Date('2026-07-01T12:00:00Z')).hour, 14);
  assert.equal(parisClock(new Date('2026-12-01T01:00:00Z')).hour, 2);
  assert.ok(prefetchGroups().length > 40);
});

test('the prefetch route needs the cron secret', async () => {
  const base = `http://127.0.0.1:${address.port}/api/prefetch`;
  assert.equal((await fetch(base)).status, 401);
  process.env.CRON_SECRET = 'test-secret';
  assert.equal((await fetch(base + '?index=999', { headers: { authorization: 'Bearer test-secret' } })).status, 400);
  delete process.env.CRON_SECRET;
});
