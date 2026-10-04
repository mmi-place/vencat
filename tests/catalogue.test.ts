import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { catalogueCode, catalogueFiles, courseDescription, validCatalogue, type CatalogueDepartment, type CourseCatalogue } from '../shared/catalogue.js';
import { loadCourseCatalogue } from '../src/scripts/catalogue.js';

function release(department: CatalogueDepartment, version: number, description = 'Description vérifiée'): CourseCatalogue {
  return { department, version, entries: { 'R1.01': { title: department === 'INF' ? 'Initiation au développement' : 'Anglais', description, confidence: 2, aliases: [] } } };
}
test('catalogue codes preserve departments, semesters and specialised tracks', () => {
  for (const [raw, expected] of [['R 1.01', 'R1.01'], ['R201', 'R2.01'], ['MM4R05CN', 'R4.05CN'], ['R5.Crea.06', 'R5.CREA.06'], ['APPR5.AII.10', 'R5.AII.10'], ['R5.AII.11 -Reseaux et supervision', 'R5.AII.11'], ['SAE 6.Crea.01 â€“ Realiser', 'SAE6.CREA.01']]) assert.equal(catalogueCode(raw!), expected);
  assert.equal(catalogueCode('inconnu'), '');
  assert.equal(catalogueCode('R1.011'), '');
});
test('descriptions are hidden for conflicting or mixed subjects rather than selected by code alone', () => {
  const mmi = release('MMI', 1);
  assert.equal(courseDescription(mmi, { module: 'R 1.01', summary: 'Anglais' }), 'Description vérifiée');
  assert.equal(courseDescription(mmi, { module: 'R 1.01', summary: 'Cours Magistraux (CM)' }), 'Description vérifiée');
  assert.equal(courseDescription(mmi, { module: 'R 1.01', summary: 'Mathématiques / Anglais' }), '');
  assert.equal(courseDescription(mmi, { module: 'R 1.01', summary: 'Initiation au développement' }), '');
  assert.equal(courseDescription(release('INF', 1), { module: 'R 1.01', summary: 'Initiation au développement' }), 'Description vérifiée');
});
test('published files have one confidence score, bounded descriptions and a numeric release version', async () => {
  const manifest = JSON.parse(await readFile('public/catalogues/manifest.json', 'utf8'));
  for (const [department, file] of Object.entries(catalogueFiles)) {
    const catalogue = JSON.parse(await readFile(`public/catalogues/${file}.json`, 'utf8'));
    assert.ok(validCatalogue(catalogue, department as CatalogueDepartment, manifest.version));
    for (const entry of Object.values(catalogue.entries) as CourseCatalogue['entries'][string][]) {
      if (entry.confidence === 2) assert.ok(entry.description.split(/\s+/).length >= 18 && entry.description.split(/\s+/).length <= 30);
      assert.equal('sources' in entry, false);
      assert.equal('originalConfidence' in entry, false);
    }
  }
  assert.equal(validCatalogue(release('INF', 1), 'MMI'), false);
  assert.equal(validCatalogue({ ...release('MMI', 1), entries: { 'R1.01': { ...release('MMI', 1).entries['R1.01'], confidence: 1 } } }, 'MMI'), false);
});
test('IndexedDB reuses current catalogue, refreshes by version, isolates departments and survives invalid releases/offline', async () => {
  const originalFetch = globalThis.fetch;
  let version = 1, offline = false, invalid = false;
  const calls: string[] = [];
  globalThis.fetch = async input => {
    const url = String(input); calls.push(url);
    if (offline) throw new Error('offline');
    if (url === '/catalogues/manifest.json') return Response.json({ version });
    const department = Object.entries(catalogueFiles).find(([, file]) => url.startsWith(`/catalogues/${file}.json`))?.[0] as CatalogueDepartment;
    return Response.json(invalid ? { ...release(department, version), entries: {} } : release(department, version, `Description ${department} ${version}`));
  };
  try {
    assert.equal((await loadCourseCatalogue('MMI'))?.version, 1);
    calls.length = 0;
    assert.equal((await loadCourseCatalogue('MMI'))?.version, 1);
    assert.deepEqual(calls, ['/catalogues/manifest.json']);
    version = 2;
    assert.equal((await loadCourseCatalogue('MMI'))?.version, 2);
    assert.equal((await loadCourseCatalogue('INF'))?.entries['R1.01']?.description, 'Description INF 2');
    version = 3; invalid = true;
    assert.equal((await loadCourseCatalogue('MMI'))?.version, 2);
    offline = true;
    let instant: number | undefined;
    assert.equal((await loadCourseCatalogue('MMI', catalogue => { instant = catalogue.version; }))?.version, 2);
    assert.equal(instant, 2);
    assert.equal((await loadCourseCatalogue('INF'))?.entries['R1.01']?.title, 'Initiation au développement');
    assert.equal(await loadCourseCatalogue('unknown'), undefined);
  } finally { globalThis.fetch = originalFetch; }
});
