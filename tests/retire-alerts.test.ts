import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const code = readFileSync(new URL('../public/retire-device-alerts.js', import.meta.url), 'utf8');
test('service worker migration retires existing device alerts without subscribing or requesting permission', async () => {
  let activate: (event: { waitUntil: (work: Promise<void>) => void }) => void = () => {};
  let unsubscribed = 0, closed = 0;
  runInNewContext(code, { self: {
    addEventListener: (name: string, handler: typeof activate) => { assert.equal(name, 'activate'); activate = handler; },
    registration: {
      pushManager: { getSubscription: async () => ({ unsubscribe: async () => { unsubscribed++; } }) },
      getNotifications: async () => [{ close: () => { closed++; } }],
    },
  } });
  let pending: Promise<void> = Promise.resolve();
  activate({ waitUntil: work => { pending = work; } });
  await pending;
  assert.equal(unsubscribed, 1);
  assert.equal(closed, 1);
});

test('retirement supports browsers without push and does not break worker activation on failure', async () => {
  for (const registration of [
    { getNotifications: async () => [] },
    { pushManager: { getSubscription: async () => { throw new Error('Unavailable'); } } },
  ]) {
    let activate: (event: { waitUntil: (work: Promise<void>) => void }) => void = () => {};
    runInNewContext(code, { self: { registration, addEventListener: (_: string, handler: typeof activate) => { activate = handler; } } });
    let pending: Promise<void> = Promise.resolve();
    activate({ waitUntil: work => { pending = work; } });
    await assert.doesNotReject(pending);
  }
});
