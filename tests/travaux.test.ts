import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { useMemoryStore, store } from '../backend/travaux/store.js';
import { sentMails } from '../backend/travaux/mail.js';
import { resetLimits, userForEmail, type User } from '../backend/travaux/auth.js';
import { eraseAccount } from '../backend/travaux/common.js';
import app from '../backend/app.js';
import { audienceScope, voteState, scopeMembers, scopeChoices, checkLink, parisInstant, countdown, isStudentEmail, nameFromEmail, similarWorks, worksToIcs, parseWorkInput, type Vote, type WorkView } from '../shared/travaux.js';
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
  assert.deepEqual(scopeChoices(b1).map(choice => choice.label), ['B1', 'Groupe B', 'MMI-2']);
  assert.deepEqual(scopeMembers({ kind: 'wide', key: 'MMI-2|B' }).map(group => group.id), [B1, B2]);
  assert.equal(scopeChoices(groupById('G1-BV1RUTBT5956')!).length, 2);
  assert.deepEqual(checkLink('https://www.figma.com/file/x'), { url: 'https://www.figma.com/file/x', domain: 'figma.com' });
  assert.ok('error' in checkLink('https://bit.ly/abc'));
  assert.ok('error' in checkLink('javascript:alert(1)'));
  assert.equal(parisInstant('2026-11-23'), '2026-11-23T22:59:00.000Z');
  assert.equal(parisInstant('2026-06-10', '14:00'), '2026-06-10T12:00:00.000Z');
  // Month and year ends, daylight saving days.
  assert.equal(parisInstant('2026-01-31'), '2026-01-31T22:59:00.000Z');
  assert.equal(parisInstant('2026-06-30'), '2026-06-30T21:59:00.000Z');
  assert.equal(parisInstant('2026-12-31'), '2026-12-31T22:59:00.000Z');
  assert.equal(parisInstant('2026-01-31', '00:30'), '2026-01-30T23:30:00.000Z');
  assert.equal(parisInstant('2026-03-29', '12:00'), '2026-03-29T10:00:00.000Z');
  assert.equal(parisInstant('2026-10-25', '12:00'), '2026-10-25T11:00:00.000Z');
  assert.equal(countdown('2026-11-26', '2026-11-23').label, 'J-3');
  assert.equal(countdown('2026-11-24', '2026-11-23').label, 'demain');
  assert.equal(countdown('2026-11-20', '2026-11-23').label, '', 'nothing once past');
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
    const set = response.headers.getSetCookie().find(item => item.startsWith('vencat_session=') || item.startsWith('vencat_admin='));
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
  assert.ok(sentMails.some(mail => mail.to === "lea.martin@ens.uvsq.fr" && /\d{6}/.test(mail.subject) && !!mail.html));

  // Wrong code: attempts are counted.
  const other = client();
  // Even with a connected device, the mail (code + link) goes out at once: no number to pick.
  const before = sentMails.length;
  const again = await other('/auth/start', { body: { email: 'lea.martin@ens.uvsq.fr' } });
  assert.equal(again.body.mailSent, true);
  assert.equal(again.body.number, undefined);
  assert.ok(sentMails.length > before);
  assert.equal((await lea.browser('/auth/pending')).status, 404, 'the number mechanic is gone');
  assert.equal((await other('/auth/verify', { body: { requestId: again.body.requestId, poll: again.body.poll, code: again.body.devCode } })).status, 200);
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
  assert.equal((await lea.browser('/account/marks', { method: 'PUT', body: { done: { [work.body.id]: true }, notes: { [work.body.id]: 'Demander le format' } } })).status, 200);
  const kept = (await lea.browser('/account/marks')).body;
  assert.deepEqual(Object.keys(kept.done), [work.body.id]);
  assert.equal(kept.notes[work.body.id], 'Demander le format');
  assert.equal((await lea.browser('/account', { method: 'DELETE' })).status, 200);
  assert.equal((await lea.browser('/auth/me')).body.me, null);
  assert.equal((await anonymous(`/travaux/work/${work.body.id}`)).body.work.author, 'Ancien étudiant');
});

test('a QR code is approved from a connected device, and ICS renders', async () => {
  resetLimits();
  const sam = await signIn('sam.l@ens.uvsq.fr');
  const thief = client();
  // A mail request cannot be approved by a device: only a QR code can.
  const request = await thief('/auth/start', { body: { email: 'sam.l@ens.uvsq.fr' } });
  assert.equal((await sam.browser('/auth/approve', { body: { requestId: request.body.requestId } })).status, 404);
  const qr = await thief('/auth/qr', { body: {} });
  assert.equal((await thief('/auth/poll', { body: { requestId: qr.body.requestId, poll: qr.body.poll } })).body.status, 'waiting');
  assert.equal((await sam.browser('/auth/approve', { body: { requestId: qr.body.requestId } })).status, 200);
  assert.equal((await thief('/auth/poll', { body: { requestId: qr.body.requestId, poll: qr.body.poll } })).body.status, 'approved');
  assert.equal((await thief('/auth/me')).body.me.email, 'sam.l@ens.uvsq.fr');
  const view = { id: 'x', type: 'eval', title: 'DS, maths; ch. 3', due: '2026-11-25T13:00:00.000Z', hasTime: true, state: 'validated', details: { where: '', format: '', mode: '', info: '' }, links: [] } as unknown as WorkView;
  assert.match(worksToIcs('MMI-2 B1', [view], 'https://vencat.mmi.place'), /SUMMARY:Éval · DS\\, maths\\; ch. 3/);
});

test('personal works stay private and are edited directly', async () => {
  resetLimits();
  const owner = await signIn('perso.owner@ens.uvsq.fr');
  const other = await signIn('perso.other@ens.uvsq.fr');
  const work = await owner.browser('/travaux/works', { body: { type: 'devoir', title: 'Relire mes notes', day: '2026-12-03', scope: { kind: 'group', key: B1 }, details: { where: '', format: '', mode: '', info: '' }, links: [], personal: true } });
  assert.equal(work.status, 201);
  assert.equal(work.body.personal, true);
  assert.equal(work.body.state, 'validated');
  assert.ok(!(await other.browser(`/travaux/group/${B1}`)).body.some((item: { id: string }) => item.id === work.body.id));
  assert.ok((await owner.browser(`/travaux/group/${B1}`)).body.some((item: { id: string }) => item.id === work.body.id));
  assert.equal((await other.browser(`/travaux/work/${work.body.id}`)).status, 404);
  assert.equal((await other.browser(`/travaux/work/${work.body.id}/vote`, { body: { value: 1 } })).status, 400);
  const edited = await owner.browser(`/travaux/work/${work.body.id}/proposal`, { body: { kind: 'edit', changes: { title: 'Relire mes notes de cours' } } });
  assert.equal(edited.body.title, 'Relire mes notes de cours');
  assert.doesNotMatch((await client()(`/travaux/ics/${B1}.ics`)).body, /Relire mes notes/);
});

test('administration has its own mail-code sign-in and session cookie', async () => {
  resetLimits();
  process.env.ADMIN_EMAILS = 'chef.admin@gmail.com';
  process.env.MAIL_LOG_ONLY = '@gmail\\.com$';
  const admin = client();
  assert.equal((await admin('/admin/overview')).status, 401);
  const refused = await admin('/admin/start', { body: { email: 'intrus@gmail.com' } });
  assert.equal(refused.status, 200, 'same answer for unknown addresses');
  assert.equal(refused.body.devCode, undefined);
  const start = await admin('/admin/start', { body: { email: 'chef.admin@gmail.com' } });
  assert.equal((await admin('/admin/verify', { body: { requestId: start.body.requestId, code: '000000' } })).status, 400);
  const verify = await admin('/admin/verify', { body: { requestId: start.body.requestId, code: start.body.devCode } });
  assert.equal(verify.status, 200, JSON.stringify(verify.body));
  const overview = await admin('/admin/overview');
  assert.equal(overview.status, 200);
  assert.ok(overview.body.stats.accounts > 0);
  // A student account is not an administrator.
  const student = await signIn('pas.admin@ens.uvsq.fr');
  assert.equal((await student.browser('/travaux/moderation')).status, 403);
  delete process.env.ADMIN_EMAILS; delete process.env.MAIL_LOG_ONLY;
});

test('links built behind chained proxies use the client protocol and host only', async () => {
  resetLimits();
  const response = await fetch(base + '/auth/qr', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'vencat', 'x-forwarded-proto': 'https,http', 'x-forwarded-host': 'vencat.example,127.0.0.1:5173', origin: 'https://vencat.example' }, body: '{}' });
  assert.equal(response.status, 200);
  assert.match((await response.json() as { url: string }).url, /^https:\/\/vencat\.example\/\?qr=[a-f0-9]{32}$/);
});

test('a mail code stays valid for a few sign-ins after its first use', async () => {
  resetLimits();
  const first = client();
  const start = await first('/auth/start', { body: { email: 'reuse.code@ens.uvsq.fr' } });
  for (let index = 0; index < 3; index++) {
    const again = await client()('/auth/verify', { body: { requestId: start.body.requestId, poll: start.body.poll, code: start.body.devCode } });
    assert.equal(again.status, 200, JSON.stringify(again.body));
  }
  const login = (await store().get<{ uses: number; firstUsedAt: string }>('logins', start.body.requestId))!;
  assert.equal(login.uses, 3);
  await store().put('logins', start.body.requestId, { ...login, firstUsedAt: new Date(Date.now() - 4 * 60000).toISOString() });
  assert.equal((await client()('/auth/verify', { body: { requestId: start.body.requestId, poll: start.body.poll, code: start.body.devCode } })).status, 410);
});

test('a work linked to a promotion lecture reaches the whole promotion', async () => {
  const b1 = groupById(B1)!;
  assert.deepEqual(audienceScope('MMI2', b1), { kind: 'promo', key: 'MMI-2' });
  assert.deepEqual(audienceScope('MMI2-B', b1), { kind: 'wide', key: 'MMI-2|B' });
  assert.deepEqual(audienceScope('MMI2-B1', b1), { kind: 'group', key: B1 });
  assert.equal(audienceScope('MMI1', b1), undefined);
  resetLimits();
  const author = await signIn('cm.author@ens.uvsq.fr');
  const work = await author.browser('/travaux/works', { body: { type: 'rendu', title: 'Rendu du CM', day: '2026-12-02', scope: { kind: 'group', key: B1 }, course: { uid: 'cm-1', start: '2026-12-02T08:00:00.000Z', module: 'R 3.17', summary: 'Economie', type: 'CM', audience: 'MMI2' }, details: { where: '', format: '', mode: '', info: '' }, links: [] } });
  assert.equal(work.status, 201, JSON.stringify(work.body));
  assert.deepEqual(work.body.scope, { kind: 'promo', key: 'MMI-2' });
  assert.ok((await client()(`/travaux/group/${A1}`)).body.some((item: { id: string }) => item.id === work.body.id));
});

test('review fixes: no reliability farming, no personal flip, idempotent creation, link and closing rules', async () => {
  resetLimits();
  const author = await signIn('fix.author@ens.uvsq.fr');
  const voters = [await signIn('fix.v1@ens.uvsq.fr'), await signIn('fix.v2@ens.uvsq.fr'), await signIn('fix.v3@ens.uvsq.fr')];
  const body = { type: 'rendu', title: 'Rendu de contrôle', day: '2026-12-05', scope: { kind: 'group', key: B1 }, details: { where: '', format: '', mode: '', info: '' }, links: [], clientId: 'client-fix-0001' };
  const work = await author.browser('/travaux/works', { body });
  assert.equal(work.status, 201);
  const again = await author.browser('/travaux/works', { body });
  assert.equal(again.status, 200); assert.equal(again.body.id, work.body.id, 'same clientId, same work');
  for (const voter of voters) await voter.browser(`/travaux/work/${work.body.id}/vote`, { body: { value: 1 } });
  const reliability = async () => (await store().get<User>('users', (await author.browser('/auth/me')).body.me.id))!.reliability;
  const before = await reliability();
  for (let round = 0; round < 3; round++) { await voters[2]!.browser(`/travaux/work/${work.body.id}/vote`, { body: { value: 0 } }); await voters[2]!.browser(`/travaux/work/${work.body.id}/vote`, { body: { value: 1 } }); }
  assert.equal(await reliability(), before, 'validated again without new reward');
  // A shared work cannot become personal through a proposal, and the reverse.
  const flip = await voters[0]!.browser(`/travaux/work/${work.body.id}/proposal`, { body: { kind: 'edit', changes: { title: 'Rendu de contrôle (modifié)', personal: true } } });
  assert.equal(flip.status, 201); assert.notEqual(flip.body.personal, true);
  const own = await author.browser('/travaux/works', { body: { ...body, clientId: undefined, title: 'Perso', personal: true } });
  const out = await author.browser(`/travaux/work/${own.body.id}/proposal`, { body: { kind: 'edit', changes: { personal: false, scope: { kind: 'promo', key: 'MMI-1' }, title: 'Perso public' } } });
  assert.equal(out.body.personal, true); assert.equal(out.body.scope.key, B1);
  // The mail link: GET only opens the app, POST signs in the device that opens it.
  const login = await client()('/auth/start', { body: { email: 'fix.link@ens.uvsq.fr' } });
  const link = sentMails.filter(mail => mail.to === 'fix.link@ens.uvsq.fr').pop()!.text.match(/\?lien=([a-f0-9]+)&t=([\w-]+)/)!;
  const redirect = await client()(`/auth/magic?r=${link[1]}&t=${link[2]}`);
  assert.equal(redirect.status, 302);
  assert.equal((await client()('/auth/poll', { body: { requestId: login.body.requestId, poll: login.body.poll } })).body.status, 'waiting');
  const opener = client();
  assert.equal((await opener('/auth/magic', { body: { r: link[1], t: link[2] } })).status, 200);
  assert.ok((await opener('/auth/me')).body.me);
  assert.equal((await client()('/auth/poll', { body: { requestId: login.body.requestId, poll: login.body.poll } })).body.status, 'waiting', 'the requester is not signed in by the link');
  // Closing a correction needs a member of the group.
  assert.equal((await client()('/travaux/correction/whatever/close', { body: { reason: 'celcat' } })).status, 401);
});

test('calendar links: group subscription by id or path, single course and work events', async () => {
  const anonymous = client();
  for (const file of [`${B1}.ics`, `${B1.toLowerCase()}.ics`, 'mmi-2-b1.ics']) {
    const answer = await anonymous(`/travaux/ics/${file}`);
    assert.equal(answer.status, 200, file); assert.match(answer.body, /BEGIN:VCALENDAR/);
  }
  const unknown = await fetch(`${base}/travaux/ics/inconnu.ics`);
  assert.equal(unknown.status, 404); assert.match(await unknown.text(), /Groupe introuvable/);
  const { courseToIcs } = await import('../shared/travaux.js');
  const ics = courseToIcs({ uid: 'u1', summary: 'Web, avancé', type: 'TD', start: '2026-12-01T08:00:00.000Z', end: '2026-12-01T10:00:00.000Z', location: 'E57', teachers: ['A. Martin'], module: 'R 3.01' }, 'https://vencat.example');
  assert.match(ics, /SUMMARY:TD · Web\\, avancé/); assert.match(ics, /LOCATION:E57/); assert.match(ics, /TRIGGER:-PT15M/);
});

test('delegates are declared by the elected students and confirmed by the administration', async () => {
  resetLimits();
  const student = await signIn('delegue.elu@ens.uvsq.fr');
  assert.equal((await student.browser('/travaux/delegates/request', { body: { title: 'suppléant', note: 'élu le 2 octobre' } })).status, 400, 'date and certification required');
  assert.equal((await student.browser('/travaux/delegates/request', { body: { title: 'suppléant', note: 'élu le 2 octobre', electedOn: '2026-10-02', certified: true } })).status, 201);
  assert.equal((await student.browser('/travaux/delegates/request', { body: { electedOn: '2026-10-02', certified: true } })).status, 409);
  // The group gives its opinion from the queue: yes, don't know, no.
  const classmate = await signIn('camarade.delegue@ens.uvsq.fr');
  const queued = (await classmate.browser('/travaux/queue')).body.declarations.find((item: { note: string }) => item.note === 'élu le 2 octobre');
  assert.ok(queued, 'declaration in the classmate queue');
  assert.equal((await classmate.browser(`/travaux/delegates/${queued.id}/answer`, { body: { value: 'yes' } })).body.answers.yes, 1);
  assert.equal((await classmate.browser('/travaux/queue')).body.declarations.some((item: { id: string }) => item.id === queued.id), false);
  assert.equal((await student.browser(`/travaux/delegates/${queued.id}/answer`, { body: { value: 'yes' } })).status, 400, 'not on one’s own declaration');
  const before = await client()(`/travaux/delegates/${B1}`);
  assert.equal(before.body.active.some((item: { name: string }) => /Delegue/i.test(item.name)), false, 'not listed before confirmation');
  process.env.ADMIN_EMAILS = 'chef.admin@gmail.com'; process.env.MAIL_LOG_ONLY = '@gmail\\.com$';
  const admin = client();
  const start = await admin('/admin/start', { body: { email: 'chef.admin@gmail.com' } });
  await admin('/admin/verify', { body: { requestId: start.body.requestId, code: start.body.devCode } });
  const queue = await admin('/admin/overview');
  const declaration = queue.body.delegates.find((item: { title: string; note: string }) => item.note === 'élu le 2 octobre');
  assert.equal(declaration.title, 'suppléant'); assert.equal(declaration.answers.yes, 1);
  assert.equal((await admin('/admin/action', { body: { kind: 'delegate', id: declaration.id, action: 'accept' } })).status, 200);
  const after = await client()(`/travaux/delegates/${B1}`);
  const listed = after.body.active.find((item: { title: string }) => item.title === 'suppléant');
  assert.ok(listed); assert.match(listed.until, /-08-31T/);
  assert.equal((await student.browser('/travaux/delegates/mine', { method: 'DELETE' })).status, 200);
  delete process.env.ADMIN_EMAILS; delete process.env.MAIL_LOG_ONLY;
});

test('planning only: the administration switches off every user content, then restores it', async () => {
  resetLimits();
  process.env.ADMIN_EMAILS = 'chef.admin@gmail.com'; process.env.MAIL_LOG_ONLY = '@gmail\\.com$';
  const admin = client();
  const start = await admin('/admin/start', { body: { email: 'chef.admin@gmail.com' } });
  await admin('/admin/verify', { body: { requestId: start.body.requestId, code: start.body.devCode } });
  const student = await signIn('pendant.coupure@ens.uvsq.fr');
  assert.equal((await admin('/admin/settings', { body: { planningOnly: true, message: 'Maintenance des Travaux' } })).body.planningOnly, true);
  const config = await client()('/travaux/config');
  assert.equal(config.body.planningOnly, true); assert.equal(config.body.message, 'Maintenance des Travaux');
  const blocked = await client()(`/travaux/group/${B1}`);
  assert.equal(blocked.status, 503); assert.equal(blocked.body.error, 'Maintenance des Travaux');
  assert.equal((await student.browser('/travaux/works', { body: { type: 'rendu', title: 'Pendant la coupure', day: '2026-12-05', scope: { kind: 'group', key: B1 }, details: { where: '', format: '', mode: '', info: '' }, links: [] } })).status, 503);
  assert.equal((await client()('/auth/start', { body: { email: 'x.y@ens.uvsq.fr' } })).status, 503);
  const ics = await fetch(`${base}/travaux/ics/${B1}.ics`);
  assert.equal(ics.status, 200); assert.doesNotMatch(await ics.text(), /VEVENT/);
  assert.equal((await admin('/admin/overview')).status, 200, 'the administration keeps working');
  assert.equal((await admin('/admin/settings', { body: { planningOnly: false } })).body.planningOnly, false);
  assert.equal((await client()(`/travaux/group/${B1}`)).status, 200);
  delete process.env.ADMIN_EMAILS; delete process.env.MAIL_LOG_ONLY;
});

test('feedback is always kept; it is mailed only to the list chosen in the administration, never to every admin', async () => {
  resetLimits();
  process.env.ADMIN_EMAILS = 'chef.admin@gmail.com';
  process.env.MAIL_LOG_ONLY = '@gmail\\.com$';
  const anyone = client();
  assert.equal((await anyone('/travaux/feedback', { body: { kind: 'bug', message: 'x' } })).status, 400, 'too short');
  // No list yet: nobody is mailed (not even the administrators), but the message is kept.
  const before = sentMails.length;
  const sent = await anyone('/travaux/feedback', { body: { kind: 'bug', message: 'Le bouton ne répond pas', email: 'lea@ens.uvsq.fr', context: { page: '/', version: '2.3.0', inconnu: 'ignoré' } } });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.equal(sentMails.length, before, 'administrators are not mailed by default');
  const stored = (await store().list<{ message: string; context: Record<string, string> }>('feedback')).find(item => item.message === 'Le bouton ne répond pas')!;
  assert.ok(stored && stored.context.page === '/' && !stored.context.inconnu);
  // Recipients chosen by an administrator.
  const admin = client();
  const start = await admin('/admin/start', { body: { email: 'chef.admin@gmail.com' } });
  await admin('/admin/verify', { body: { requestId: start.body.requestId, code: start.body.devCode } });
  assert.equal((await admin('/admin/notifications', { body: { topic: 'feedback', emails: ['pas un mail'] } })).status, 400);
  assert.equal((await admin('/admin/notifications', { body: { topic: 'constructor', emails: [] } })).status, 400);
  const saved = await admin('/admin/notifications', { body: { topic: 'feedback', emails: ['equipe@gmail.com', 'EQUIPE@gmail.com'] } });
  assert.deepEqual(saved.body.topics.find((topic: { id: string }) => topic.id === 'feedback').emails, ['equipe@gmail.com']);
  assert.deepEqual(saved.body.topics.find((topic: { id: string }) => topic.id === 'important').emails, [], 'other topics keep the administrators');
  const count = sentMails.length;
  assert.equal((await anyone('/travaux/feedback', { body: { kind: 'idea', message: 'Ajouter un mode compact', email: 'lea@ens.uvsq.fr' } })).status, 200);
  const mail = sentMails.slice(count);
  assert.deepEqual(mail.map(item => item.to), ['equipe@gmail.com']);
  assert.ok(/bêta/i.test(mail[0]!.subject) && mail[0]!.replyTo === 'lea@ens.uvsq.fr');
  assert.ok((await admin('/admin/feedback')).body.length >= 2, 'the administration lists the feedback');
  // The planning-only switch (which keeps the recipients) does not block feedback.
  await admin('/admin/settings', { body: { planningOnly: true } });
  assert.equal((await anyone('/travaux/feedback', { body: { kind: 'bug', message: 'Même en mode planning seul' } })).status, 200);
  await admin('/admin/settings', { body: { planningOnly: false } });
  assert.deepEqual((await admin('/admin/notifications')).body.topics.find((topic: { id: string }) => topic.id === 'feedback').emails, ['equipe@gmail.com']);
  // « Important » goes to its own list; the test mail too.
  await admin('/admin/notifications', { body: { topic: 'important', emails: ['urgent@gmail.com'] } });
  const mails = sentMails.length;
  assert.equal((await admin('/admin/notifications/test', { body: { topic: 'important' } })).body.sent, 1);
  assert.deepEqual(sentMails.slice(mails).map(item => item.to), ['urgent@gmail.com']);
  await admin('/admin/settings', { body: { planningOnly: true } });
  await admin('/admin/settings', { body: { planningOnly: false } });
  assert.ok(sentMails.slice(mails).some(item => item.to === 'urgent@gmail.com' && /planning seul/.test(item.subject)));
});

test('release fixes: inherited keys, sanctions kept after deletion, personal data erased, resend extends the request', async () => {
  resetLimits();
  process.env.ADMIN_EMAILS = 'chef.admin@gmail.com';
  process.env.MAIL_LOG_ONLY = '@gmail\\.com$';
  // « constructor » is not a feedback kind.
  const anyone = client();
  const before = sentMails.length;
  assert.equal((await anyone('/travaux/feedback', { body: { kind: 'constructor', message: 'Type inventé par un appelant' } })).status, 200);
  assert.ok(!sentMails.slice(before).some(mail => /function|native code/.test(mail.subject)));
  assert.ok((await store().list<{ kind: string }>('feedback')).some(item => item.kind === 'other'), 'unknown kinds become « other »');
  // A ban survives the deletion of the account: signing up again with the same address does not clear it.
  const banned = await userForEmail('banni.test@ens.uvsq.fr');
  banned.banned = { at: new Date().toISOString(), reason: 'test' };
  await store().put('users', banned.id, banned);
  await store().put('names', 'n1', { id: 'n1', userId: banned.id, firstName: 'A', lastName: 'B', at: '', status: 'open' });
  await store().put('logins', 'l1', { id: 'l1', email: 'banni.test@ens.uvsq.fr' });
  await eraseAccount(banned);
  assert.equal(await store().get('names', 'n1'), undefined);
  assert.equal(await store().get('logins', 'l1'), undefined);
  const again = await userForEmail('banni.test@ens.uvsq.fr');
  assert.notEqual(again.id, banned.id);
  assert.ok(again.banned, 'the ban is kept');
  // A resend gives the new code its own 10 minutes.
  const login = await client()('/auth/start', { body: { email: 'renvoi.test@ens.uvsq.fr' } });
  const first = login.body.expiresAt;
  await new Promise(resolve => setTimeout(resolve, 20));
  const resent = await client()('/auth/send-mail', { body: { requestId: login.body.requestId, poll: login.body.poll } });
  assert.ok(resent.body.expiresAt > first);
});

test('NOTIFY_EMAILS gives the starting lists, until an administrator saves one', async () => {
  const { recipients } = await import('../backend/travaux/notify.js');
  const saved = process.env.NOTIFY_EMAILS;
  process.env.NOTIFY_EMAILS = 'Un@exemple.fr, deux@exemple.fr';
  try {
    assert.deepEqual(await recipients('reports'), ['un@exemple.fr', 'deux@exemple.fr']);
    assert.deepEqual(await recipients('feedback'), ['equipe@gmail.com'], 'a saved list wins');
  } finally { if (saved === undefined) delete process.env.NOTIFY_EMAILS; else process.env.NOTIFY_EMAILS = saved; }
});

test('moderation settles a proposal without the 3 votes: administration and delegates, not students', async () => {
  resetLimits();
  process.env.ADMIN_EMAILS = 'chef.admin@gmail.com';
  process.env.MAIL_LOG_ONLY = '@gmail\\.com$';
  const author = await signIn('bypass.author@ens.uvsq.fr');
  const proposer = await signIn('bypass.prop@ens.uvsq.fr');
  const student = await signIn('bypass.other@ens.uvsq.fr');
  const body = { type: 'rendu', title: 'Rendu à corriger', day: '2026-12-08', scope: { kind: 'group', key: B1 }, details: { where: '', format: '', mode: '', info: '' }, links: [], clientId: 'client-bypass-1' };
  const work = (await author.browser('/travaux/works', { body })).body;
  const edit = await proposer.browser(`/travaux/work/${work.id}/proposal`, { body: { kind: 'edit', changes: { title: 'Rendu corrigé' }, reason: 'Faute de frappe' } });
  assert.equal(edit.status, 201, JSON.stringify(edit.body));
  const proposalId = edit.body.proposal.id as string;
  // A student cannot settle it.
  assert.equal((await student.browser(`/travaux/proposal/${proposalId}/decide`, { body: { action: 'accept' } })).status, 403);
  // The administration sees it in its queue and accepts it at once.
  const admin = client();
  const start = await admin('/admin/start', { body: { email: 'chef.admin@gmail.com' } });
  await admin('/admin/verify', { body: { requestId: start.body.requestId, code: start.body.devCode } });
  const queue = (await admin('/admin/overview')).body.proposals as { id: string; title: string }[];
  assert.ok(queue.some(item => item.id === proposalId && item.title === 'Rendu à corriger'));
  assert.equal((await admin('/admin/action', { body: { kind: 'proposal', id: proposalId, action: 'accept' } })).status, 200);
  assert.equal((await store().get<{ title: string }>('works', work.id))!.title, 'Rendu corrigé');
  assert.equal((await store().get<{ status: string }>('proposals', proposalId))!.status, 'accepted');
  assert.equal((await admin('/admin/action', { body: { kind: 'proposal', id: proposalId, action: 'accept' } })).status, 404, 'already closed');
  // A rejection closes the next proposal without touching the work.
  const second = await proposer.browser(`/travaux/work/${work.id}/proposal`, { body: { kind: 'edit', changes: { title: 'Autre titre' }, reason: 'Test' } });
  assert.equal((await admin('/admin/action', { body: { kind: 'proposal', id: second.body.proposal.id, action: 'reject' } })).status, 200);
  assert.equal((await store().get<{ title: string }>('works', work.id))!.title, 'Rendu corrigé');
  assert.equal((await store().get<{ status: string }>('proposals', second.body.proposal.id))!.status, 'rejected');
});

test('marks: one document per mark, the sync only adds, removals stay removed, old format migrated', async () => {
  resetLimits();
  const phone = await signIn('marks.sync@ens.uvsq.fr');
  const laptop = await phone.browser('/auth/me').then(() => phone);
  const ids = ['a', 'b', 'c', 'd'].map(letter => letter.repeat(32).replace(/[^a-f]/g, 'e'));
  const [first, second, third, fourth] = ids as [string, string, string, string];
  // Quick taps at the same time on the same account never overwrite each other.
  await Promise.all([first, second, third].map(id => phone.browser('/account/marks', { method: 'PUT', body: { done: { [id]: true } } })));
  assert.deepEqual(Object.keys((await phone.browser('/account/marks')).body.done).sort(), [first, second, third].sort());
  // A removal leaves a tombstone: an old device that still has the mark cannot bring it back.
  await phone.browser('/account/marks', { method: 'PUT', body: { done: { [second]: false } } });
  const old = new Date(Date.now() - 3600_000).toISOString();
  const merged = (await phone.browser('/account/marks', { method: 'PUT', body: { merge: { done: { [second]: old, [fourth]: old }, notes: { [first]: 'note locale' } } } })).body;
  assert.equal(merged.done[second], undefined, 'removed elsewhere, stays removed');
  assert.ok(merged.done[fourth], 'a mark only on this device is added');
  assert.ok(merged.done[first] && merged.done[third], 'nothing existing is destroyed');
  assert.equal(merged.notes[first], 'note locale');
  // A merge never overwrites what the account already has.
  const again = (await phone.browser('/account/marks', { method: 'PUT', body: { merge: { notes: { [first]: 'autre texte' } } } })).body;
  assert.equal(again.notes[first], 'note locale');
  // Marks of the old format (one document per account) are migrated.
  const user = (await store().list<User>('users')).find(item => item.email === 'marks.sync@ens.uvsq.fr')!;
  const legacyId = 'f'.repeat(32);
  await store().put('marks', user.id, { done: { [legacyId]: new Date().toISOString() }, notes: {} });
  const migrated = (await laptop.browser('/account/marks')).body;
  assert.ok(migrated.done[legacyId] && migrated.done[first]);
  assert.equal(await store().get('marks', user.id), undefined, 'the old document is gone');
  // Deleting the account removes every mark.
  await laptop.browser('/account', { method: 'DELETE' });
  assert.equal((await store().list('marks', user.id + ':')).length, 0);
});
