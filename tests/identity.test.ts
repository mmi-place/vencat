import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueToken, verifyToken, tokensEnabled } from '../backend/identity.js';

test('anonymous tokens are only issued with a long enough secret', () => {
  const previous = process.env.TOKEN_SECRET;
  try {
    delete process.env.TOKEN_SECRET;
    assert.equal(tokensEnabled(), false); assert.equal(issueToken(), undefined);
    process.env.TOKEN_SECRET = 'short';
    assert.equal(tokensEnabled(), false);
  } finally { if (previous === undefined) delete process.env.TOKEN_SECRET; else process.env.TOKEN_SECRET = previous; }
});

test('tokens verify, expire, and reject tampering or another secret', () => {
  const previous = process.env.TOKEN_SECRET;
  try {
    process.env.TOKEN_SECRET = 'a'.repeat(40);
    const now = Date.parse('2026-11-19T12:00:00Z'), issued = issueToken(now)!;
    const payload = verifyToken(issued.token, now)!;
    assert.equal(payload.kind, 'anon'); assert.match(payload.id, /^[a-f0-9]{32}$/);
    assert.equal(verifyToken(issued.token, now + 181 * 86400_000), undefined);
    const [body, signature] = issued.token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...payload, id: 'f'.repeat(32) })).toString('base64url');
    assert.equal(verifyToken(`${forged}.${signature}`, now), undefined);
    assert.equal(verifyToken(`${body}.${signature}.x`, now), undefined);
    assert.equal(verifyToken(undefined, now), undefined);
    process.env.TOKEN_SECRET = 'b'.repeat(40);
    assert.equal(verifyToken(issued.token, now), undefined);
  } finally { if (previous === undefined) delete process.env.TOKEN_SECRET; else process.env.TOKEN_SECRET = previous; }
});
