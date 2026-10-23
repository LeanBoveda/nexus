import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const db = new DatabaseSync(':memory:');
const journal = JSON.parse(
  await readFile(
    new URL('../drizzle/meta/_journal.json', import.meta.url),
    'utf8',
  ),
);
for (const migration of journal.entries)
  db.exec(
    await readFile(
      new URL(`../drizzle/${migration.tag}.sql`, import.meta.url),
      'utf8',
    ),
  );
let failBatch = false;
const wrap = (sql, values = []) => ({
  bind: (...params) => wrap(sql, params),
  first: async () => db.prepare(sql).get(...values) ?? null,
  all: async () => ({ results: db.prepare(sql).all(...values) }),
  run: async () => ({
    meta: { changes: db.prepare(sql).run(...values).changes },
  }),
});
globalThis.__filesDB = {
  prepare: wrap,
  batch: async (statements) => {
    if (failBatch) throw new Error('database failure');
    db.exec('BEGIN');
    try {
      const result = [];
      for (const statement of statements) result.push(await statement.run());
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  },
};
const objects = new Map();
globalThis.__filesEnv = {
  FILES: {
    put: async (key, body) =>
      objects.set(key, await new Response(body).arrayBuffer()),
    get: async (key) => (objects.has(key) ? { body: objects.get(key) } : null),
    delete: async (key) => objects.delete(key),
  },
};
globalThis.__filesUser = {
  id: 'pf',
  role: 'coach',
  trainerAccountId: 't1',
  athleteId: null,
};
async function load(path) {
  const source = (await readFile(new URL(path, import.meta.url), 'utf8'))
    .replace(
      "import { env } from 'cloudflare:workers';",
      'const env=globalThis.__filesEnv;',
    )
    .replace(
      "import { getD1 } from '@/db';",
      'const getD1=()=>globalThis.__filesDB;',
    )
    .replace(
      /import \{ getSessionFromRequest(?:, isSameOrigin)? \} from '@\/lib\/auth';/,
      'const getSessionFromRequest=async()=>globalThis.__filesUser; const isSameOrigin=r=>r.headers.get("origin")===new URL(r.url).origin;',
    );
  return import(
    `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`
  );
}
const api = await load('../app/api/routine-files/route.ts');
const download = await load('../app/api/routine-files/[id]/route.ts');
db.exec(`INSERT INTO trainer_accounts(id,business_name,slug,contact_email) VALUES ('t1','One','one','one@example.com'),('t2','Two','two','two@example.com');
INSERT INTO athletes(id,trainer_account_id,first_name,last_name,email) VALUES ('a1','t1','A','One','a@example.com'),('a2','t1','B','Two','b@example.com');
INSERT INTO routines(id,trainer_account_id,name,status,created_by) VALUES ('r1','t1','Routine','published','pf'),('r2','t2','Foreign','published','pf');
INSERT INTO routine_versions(id,routine_id,version_number,content) VALUES ('v1','r1',1,'{}');
INSERT INTO routine_assignments(id,routine_version_id,target_type,target_id,starts_on,assigned_by) VALUES ('ra1','v1','athlete','a1','2020-01-01','pf');
INSERT INTO athlete_routine_instances(id,assignment_id,athlete_id,status) VALUES ('i1','ra1','a1','active');`);
const upload = (
  routineId,
  file = new File(['%PDF-fixture'], 'sesión.pdf', { type: 'application/pdf' }),
  origin = 'https://nexo.test',
) => {
  const form = new FormData();
  form.set('routineId', routineId);
  form.set('file', file);
  return api.POST(
    new Request('https://nexo.test/api/routine-files', {
      method: 'POST',
      headers: { origin },
      body: form,
    }),
  );
};
const list = (query) =>
  api.GET(new Request(`https://nexo.test/api/routine-files?${query}`));
const get = (id, query = '') =>
  download.GET(
    new Request(`https://nexo.test/api/routine-files/${id}${query}`),
    { params: Promise.resolve({ id }) },
  );
assert.equal((await upload('r2')).status, 404);
assert.equal(objects.size, 0);
assert.equal((await upload('r1', undefined, 'https://evil.test')).status, 403);
assert.equal(
  (
    await upload(
      'r1',
      new File(['data'], 'bad.exe', { type: 'application/pdf' }),
    )
  ).status,
  400,
);
assert.equal(
  (await upload('r1', new File(['data'], 'bad.pdf', { type: 'text/html' })))
    .status,
  400,
);
assert.equal(
  (
    await upload(
      'r1',
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.pdf', {
        type: 'application/pdf',
      }),
    )
  ).status,
  413,
);
const response = await upload('r1');
assert.equal(response.status, 201);
const { file } = await response.json();
assert.equal(objects.size, 1);
assert.equal((await (await list('routineId=r1')).json()).files.length, 1);
const downloaded = await get(file.id);
assert.equal(downloaded.status, 200);
assert.equal(await downloaded.text(), '%PDF-fixture');
assert.equal(downloaded.headers.get('x-content-type-options'), 'nosniff');
assert.match(downloaded.headers.get('content-disposition'), /^attachment;/);
failBatch = true;
assert.equal((await upload('r1')).status, 500);
failBatch = false;
assert.equal(objects.size, 1, 'R2 upload cleaned after failed DB batch');
assert.equal(db.prepare('SELECT count(*) AS n FROM files').get().n, 1);
globalThis.__filesUser = {
  id: 'ath',
  role: 'athlete',
  trainerAccountId: 't1',
  athleteId: 'a1',
};
assert.equal((await upload('r1')).status, 401);
assert.equal((await list('routineId=r1')).status, 404);
assert.equal((await list('instanceId=i1')).status, 200);
assert.equal((await get(file.id)).status, 404);
assert.equal((await get(file.id, '?instanceId=i1')).status, 200);
globalThis.__filesUser.athleteId = 'a2';
assert.equal((await list('instanceId=i1')).status, 404);
assert.equal((await get(file.id, '?instanceId=i1')).status, 404);
globalThis.__filesUser = {
  id: 'pf2',
  role: 'coach',
  trainerAccountId: 't2',
  athleteId: null,
};
assert.equal((await list('routineId=r1')).status, 404);
assert.equal((await get(file.id)).status, 404);
globalThis.__filesUser = null;
assert.equal((await get(file.id)).status, 401);
db.close();
console.log(
  'PASS: attachment upload/list/download, MIME/extension/size, CSRF, R2 cleanup, tenant and athlete-instance isolation, private downloads.',
);
