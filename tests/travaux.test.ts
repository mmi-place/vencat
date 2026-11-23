import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { useMemoryStore, store } from '../backend/travaux/store.js';
import { sentMails } from '../backend/travaux/mail.js';
import { resetLimits, type User } from '../backend/travaux/auth.js';
import app from '../backend/app.js';
import { voteState, scopeMembers, scopeChoices, checkLink, parisInstant, countdown, isStudentEmail, nameFromEmail, similarWorks, worksToIcs, parseWorkInput, type Vote, type WorkView } from '../shared/travaux.js';
import { groupById } from '../shared/selection.js';

useMemoryStore();
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Missing test server');
const base = `http://127.0.0.1:${address.port}/api`;
after(() => server.close());
const B1 = 'G1-AE2BGJHX5997', B2 = 'G1-TM2VJCBU5998', A1 = 'G1-QS2QEJVB5994';

test('validation needs 3 upvotes and twice as many up as down, the author does not count', () => {
  const v = (value: 1 | -1, weight = 1): Vote => ({ value, weight, at: '' });
  const old = new Date(Date.now() - 3600000).toISOString();
  assert.equal(voteState({ author: v(1), a: v(1), b: v(1) }, 'author', old, 0), 'pending');
  assert.equal(voteState({ a: v(1), b: v(1), c: v(1) }, 'author', old, 0), 'validated');
  assert.equal(voteState({ a: v(1), b: v(1), c: v(1), d: v(-1), e: v(-1) }, 'author', old, 0), 'pending');
  assert.equal(voteState({ a: v(1), d: v(-1), e: v(-1) }, 'author', old, 0), 'contested');
  assert.equal(voteState({ a: v(1) }, 'author', new Date(Date.now() - 49 * 3600000).toISOString(), 0), 'probable');
  assert.equal(voteState({ a: v(1) }, 'author', old, 12), 'validated');
  assert.equal(voteState({ a: v(1, .5), b: v(1, .5), c: v(1, .5) }, 'author', old, 0), 'pending');
});

test('scopes, links, deadlines and addresses', () => {
  const b1 = groupById(B1)!;
  assert.deepEqual(scopeChoices(b1).map(choice => choice.label), ['B1', 'B (B1 + B2)', 'MMI-2']);
  assert.deepEqual(scopeMembers({ kind: 'wide', key: 'MMI-2|B' }).map(group => group.id), [B1, B2]);
  assert.equal(scopeChoices(groupById('G1-BV1RUTBT5956')!).length, 2);
  assert.deepEqual(checkLink('https://www.figma.com/file/x'), { url: 'https://www.figma.com/file/x', domain: 'figma.com' });
  assert.ok('error' in checkLink('https://bit.ly/abc'));
  assert.ok('error' in checkLink('javascript:alert(1)'));
  assert.equal(parisInstant('2026-11-23'), '2026-11-23T22:59:00.000Z');
  assert.equal(parisInstant('2026-06-10', '14:00'), '2026-06-10T12:00:00.000Z');
  assert.equal(countdown('2026-11-26', '2026-11-23').label, 'J-3');
  assert.equal(countdown('2026-11-24', '2026-11-23').label, 'demain');
  assert.ok(countdown('2026-11-20', '2026-11-23').late);
  assert.ok(isStudentEmail('lea.martin@ens.uvsq.fr'));
  assert.ok(!isStudentEmail('lea.martin@uvsq.fr.evil.com'));
  assert.ok(!isStudentEmail('lea@gmail.com'));
  assert.deepEqual(nameFromEmail('jean-marc.dupont2@ens.uvsq.fr'), { firstName: 'Jean-Marc', lastName: 'Dupont' });
  const works = [{ type: 'rendu' as const, day: '2026-11-23', title: 'Rendu UX maquette', state: 'pending' as const }];
  assert.equal(similarWorks({ type: 'rendu', day: '2026-11-23', title: 'rendu ux' }, works).length, 1);
  assert.equal(similarWorks({ type: 'eval', day: '2026-11-23', title: 'rendu ux' }, works).length, 0);
  assert.ok('error' in parseWorkInput({ type: 'rendu', title: 'x', day: '2026-11-23', scope: { kind: 'group', key: B1 }, details: {} }));
});

// A small browser: keeps the session cookie and sends the same-origin header.
function client() {
  let cookie = '';
  return async (path: string, init: { method?: string; body?: unknown; header?: boolean } = {}) => {
    const response = await fetch(base + path, { method: init.method ?? (init.body ? 'POST' : 'GET'), redirect: 'manual', headers: { 'content-type': 'application/json', ...(init.header === false ? {} : { 'x-requested-with': 'vencat' }), ...(cookie ? { cookie } : {}) }, body: init.body ? JSON.stringify(init.body) : undefined });
    const set = response.headers.getSetCookie().find(item => item.startsWith('vencat_session='));
    if (set) cookie = set.split(';')[0]!.endsWith('=') ? '' : set.split(';')[0]!;
    const text = await response.text();
    return { status: response.status, body: text && response.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text, location: response.headers.get('location') };
  };
}
async function signIn(email: string, groupId = B1, oldAccount = true) {
  const browser = client();
  const start = await browser('/auth/start', { body: { email } });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const verify = await browser('/auth/verify', { body: { requestId: start.body.requestId, poll: start.body.poll, code: start.body.devCode } });
  assert.equal(verify.status, 200, JSON.stringify(verify.body));
  const onboard = await browser('/account/onboard', { body: { groupId, cgu: true } });
  assert.equal(onboard.status, 200);
  if (oldAccount) { const user = (await store().get<User>('users', onboard.body.me.id))!; user.createdAt = new Date(Date.now() - 30 * 86400000).toISOString(); await store().put('users', user.id, user); }
  return { browser, me: onboard.body.me };
}

test('sign-in, proposals, votes, modifications and the ICS feed', async () => {
  resetLimits();
  const anonymous = client();
  assert.equal((await anonymous('/auth/start', { body: { email: 'lea@gmail.com' } })).status, 400);
  assert.equal((await anonymous('/auth/start', { body: { email: 'lea.martin@ens.uvsq.fr' }, header: false })).status, 403);
  const lea = await signIn('lea.martin@ens.uvsq.fr');
  assert.equal(lea.me.firstName, 'Lea');
  assert.ok(sentMails.some(mail => mail.to === 'lea.martin@ens.uvsq.fr' && /\d{6}/.test(mail.subject)));

  // Wrong code: attempts are counted.
  const other = client();
  const again = await other('/auth/start', { body: { email: 'lea.martin@ens.uvsq.fr' } });
  assert.equal(again.body.mailSent, false, 'a connected device exists: approval first');
  const pending = await lea.browser('/auth/pending');
  assert.equal(pending.body.length, 1);
  assert.ok(pending.body[0].choices.includes(again.body.number));
  assert.equal((await other('/auth/poll', { body: { requestId: again.body.requestId, poll: again.body.poll } })).body.status, 'waiting');
  assert.equal((await lea.browser('/auth/approve', { body: { requestId: again.body.requestId, number: again.body.number } })).status, 200);
  const approved = await other('/auth/poll', { body: { requestId: again.body.requestId, poll: again.body.poll } });
  assert.equal(approved.body.status, 'approved');
  assert.equal((await other('/account/devices')).body.length, 2);

  const work = await lea.browser('/travaux/works', { body: { type: 'rendu', title: 'Rendu maquette Figma', day: '2026-12-02', scope: { kind: 'wide', key: 'MMI-2|B' }, details: { where: 'Moodle', format: 'lien Figma', mode: 'seul', info: '' }, links: ['https://figma.com/file/abc'] } });
  assert.equal(work.status, 201, JSON.stringify(work.body));
  assert.equal(work.body.state, 'pending');
  assert.equal(work.body.time, '23:59');
  assert.equal((await lea.browser(`/travaux/work/${work.body.id}/vote`, { body: { value: 1 } })).status, 400);

  const tom = await signIn('tom.robert@ens.uvsq.fr', B2);
  const ines = await signIn('ines.k@ens.uvsq.fr');
  const hugo = await signIn('hugo.p@ens.uvsq.fr');
  const outsider = await signIn('zoe.a@ens.uvsq.fr', A1);
  assert.equal((await outsider.browser(`/travaux/work/${work.body.id}/vote`, { body: { value: 1 } })).status, 403);
  assert.equal((await tom.browser(`/travaux/work/${work.body.id}/vote`, { body: { value: -1 } })).status, 400, 'a reason is required');
  const queue = await tom.browser('/travaux/queue');
  assert.equal(queue.body.works.length, 1);
  for (const person of [tom, ines]) assert.equal((await person.browser(`/travaux/work/${work.body.id}/vote`, { body: { value: 1 } })).body.state, 'pending');
  const validated = await hugo.browser(`/travaux/work/${work.body.id}/vote`, { body: { value: 1 } });
  assert.equal(validated.body.state, 'validated');
  assert.equal(validated.body.voters, undefined, 'votes are anonymous between students');
  assert.equal((await store().get<User>('users', lea.me.id))!.reliability, 1);

  // One open modification at a time, applied after the same vote.
  const proposal = await hugo.browser(`/travaux/work/${work.body.id}/proposal`, { body: { kind: 'edit', changes: { day: '2026-12-04', details: { where: 'par mail au prof', format: 'lien Figma', mode: 'seul', info: '' } } } });
  assert.equal(proposal.status, 201, JSON.stringify(proposal.body));
  assert.deepEqual(proposal.body.proposal.changes.map((change: { field: string }) => change.field), ['day', 'where']);
  assert.equal((await tom.browser(`/travaux/work/${work.body.id}/proposal`, { body: { kind: 'delete', reason: 'N’existe pas' } })).status, 409);
  for (const person of [lea, tom]) await person.browser(`/travaux/proposal/${proposal.body.proposal.id}/vote`, { body: { value: 1 } });
  const changed = await ines.browser(`/travaux/proposal/${proposal.body.proposal.id}/vote`, { body: { value: 1 } });
  assert.equal(changed.body.day, '2026-12-04');
  assert.equal(changed.body.details.where, 'par mail au prof');
  assert.equal(changed.body.proposal, undefined);
  const detail = await anonymous(`/travaux/work/${work.body.id}`);
  assert.ok(detail.body.history.some((entry: { action: string }) => entry.action === 'modification validée'));

  const list = await anonymous(`/travaux/group/${B2}`);
  assert.equal(list.body.length, 1);
  assert.equal((await anonymous(`/travaux/group/${A1}`)).body.length, 0);
  const ics = await anonymous(`/travaux/ics/${B1}.ics`);
  assert.match(ics.body, /SUMMARY:Rendu · Rendu maquette Figma/);
  assert.match(ics.body, /TRIGGER:-P1D/);

  // Private marks and account deletion keep contributions under "Ancien étudiant".
  assert.deepEqual(Object.keys((await lea.browser('/account/marks', { method: 'PUT', body: { done: { [work.body.id]: true }, notes: { [work.body.id]: 'Demander le format' } } })).body.done), [work.body.id]);
  assert.equal((await lea.browser('/account', { method: 'DELETE' })).status, 200);
  assert.equal((await lea.browser('/auth/me')).body.me, null);
  assert.equal((await anonymous(`/travaux/work/${work.body.id}`)).body.work.author, 'Ancien étudiant');
});

test('a wrong number denies a device request, and ICS renders', async () => {
  resetLimits();
  const sam = await signIn('sam.l@ens.uvsq.fr');
  const thief = client();
  const request = await thief('/auth/start', { body: { email: 'sam.l@ens.uvsq.fr' } });
  const wrong = (request.body.number % 89) + 10 === request.body.number ? request.body.number + 1 : (request.body.number % 89) + 10;
  assert.equal((await sam.browser('/auth/approve', { body: { requestId: request.body.requestId, number: wrong } })).status, 400);
  assert.equal((await thief('/auth/poll', { body: { requestId: request.body.requestId, poll: request.body.poll } })).body.status, 'denied');
  const view = { id: 'x', type: 'eval', title: 'DS, maths; ch. 3', due: '2026-11-25T13:00:00.000Z', hasTime: true, state: 'validated', details: { where: '', format: '', mode: '', info: '' }, links: [] } as unknown as WorkView;
  assert.match(worksToIcs('MMI-2 B1', [view], 'https://vencat.mmi.place'), /SUMMARY:Éval · DS\\, maths\\; ch. 3/);
});
