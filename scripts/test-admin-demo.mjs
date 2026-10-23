import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
const moduleUrl = (source) =>
  'data:text/javascript;base64,' +
  Buffer.from(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  ).toString('base64');
const scheduleUrl = moduleUrl(
  await readFile(
    new URL('../lib/routine-schedule.ts', import.meta.url),
    'utf8',
  ),
);
const demoUrl = moduleUrl(
  (
    await readFile(new URL('../lib/admin-demo.ts', import.meta.url), 'utf8')
  ).replace("'@/lib/routine-schedule'", JSON.stringify(scheduleUrl)),
);
const { prepareAdminDemo } = await import(demoUrl);
const sql = new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys=ON');
for (const file of (await readdir(new URL('../drizzle/', import.meta.url)))
  .filter((name) => name.endsWith('.sql'))
  .sort())
  sql.exec(
    await readFile(new URL('../drizzle/' + file, import.meta.url), 'utf8'),
  );
let failBatch = false;
const d1 = {
  prepare(query) {
    return {
      params: [],
      bind(...params) {
        assert.ok(params.length <= 100, 'D1 parameter limit');
        this.params = params;
        return this;
      },
      async first() {
        return sql.prepare(query).get(...this.params) ?? null;
      },
      async run() {
        return sql.prepare(query).run(...this.params);
      },
    };
  },
  async batch(statements) {
    sql.exec('BEGIN');
    try {
      const output = [];
      for (const statement of statements) {
        output.push(await statement.run());
        if (failBatch) throw new Error('Simulated failure');
      }
      sql.exec('COMMIT');
      return output;
    } catch (error) {
      sql.exec('ROLLBACK');
      throw error;
    }
  },
};
sql.exec(`INSERT INTO trainer_accounts(id,business_name,slug,contact_email,max_athletes) VALUES ('owner-space','Propio','propio','leandroboveda@gmail.com',30),('other-space','Otro PF','otro','other@example.test',30);
INSERT INTO users(id,email,name,role,trainer_account_id,is_platform_admin) VALUES ('admin','leandroboveda@gmail.com','Leandro','owner','owner-space',1),('other','other@example.test','Otro','owner','other-space',0);
INSERT INTO athletes(id,trainer_account_id,first_name,last_name,email) VALUES ('real','owner-space','Existente','No tocar','real@example.test'),('foreign','other-space','Ajeno','No tocar','foreign@example.test');`);
await assert.rejects(() => prepareAdminDemo(d1, 'other'));
failBatch = true;
await assert.rejects(() => prepareAdminDemo(d1, 'admin'));
assert.equal(
  sql
    .prepare("SELECT COUNT(*) AS n FROM organizations WHERE name LIKE 'DEMO%'")
    .get().n,
  0,
  'Failure rolls back marker',
);
failBatch = false;
const result = await prepareAdminDemo(
  d1,
  'admin',
  new Date('2026-10-23T18:00:00Z'),
);
assert.equal(result.athletes, 8);
assert.equal(result.evaluations, 24);
assert.equal(
  sql.prepare("SELECT COUNT(*) AS n FROM groups WHERE name LIKE 'DEMO%'").get()
    .n,
  3,
);
assert.equal(
  sql
    .prepare("SELECT COUNT(*) AS n FROM routines WHERE name LIKE 'DEMO%'")
    .get().n,
  3,
);
assert.equal(
  sql.prepare('SELECT COUNT(*) AS n FROM evaluation_results').get().n,
  72,
);
assert.ok(sql.prepare('SELECT COUNT(*) AS n FROM workout_logs').get().n > 40);
assert.equal(
  sql
    .prepare(
      "SELECT COUNT(*) AS n FROM athletes WHERE trainer_account_id='other-space'",
    )
    .get().n,
  1,
);
assert.equal(
  sql.prepare("SELECT last_name FROM athletes WHERE id='real'").get().last_name,
  'No tocar',
);
const versions = sql
  .prepare('SELECT content FROM routine_versions ORDER BY id')
  .all()
  .map((r) => JSON.parse(r.content));
assert.deepEqual(
  versions.map((c) => c.sessions.length),
  [3, 2, 4],
);
assert.ok(
  sql.prepare('SELECT MAX(trained_on) AS latest FROM workout_logs').get()
    .latest <= '2026-10-23',
);
const before = sql.prepare('SELECT COUNT(*) AS n FROM workout_logs').get().n;
sql
  .prepare(
    "UPDATE athletes SET first_name='Editado' WHERE id='nexo-demo-v1-admin-a0'",
  )
  .run();
assert.equal(
  (await prepareAdminDemo(d1, 'admin', new Date('2026-10-24T18:00:00Z')))
    .alreadyPrepared,
  true,
);
assert.equal(
  sql.prepare('SELECT COUNT(*) AS n FROM workout_logs').get().n,
  before,
);
assert.equal(
  sql
    .prepare("SELECT first_name FROM athletes WHERE id='nexo-demo-v1-admin-a0'")
    .get().first_name,
  'Editado',
);
const authUrl = moduleUrl(
  'export async function getPlatformAdminSessionFromRequest(){return globalThis.demoUser;} export function isSameOrigin(r){return r.headers.get("origin")==="http://localhost";}',
);
globalThis.demoDb = d1;
const dbUrl = moduleUrl('export function getD1(){return globalThis.demoDb;}');
const api = await import(
  moduleUrl(
    (
      await readFile(
        new URL('../app/api/admin/demo/route.ts', import.meta.url),
        'utf8',
      )
    )
      .replace("'@/db'", JSON.stringify(dbUrl))
      .replace("'@/lib/auth'", JSON.stringify(authUrl))
      .replace("'@/lib/admin-demo'", JSON.stringify(demoUrl)),
  )
);
const request = (origin = 'http://localhost') =>
  new Request('http://localhost/api/admin/demo', {
    method: 'POST',
    headers: { origin },
  });
globalThis.demoUser = null;
assert.equal((await api.POST(request())).status, 403);
globalThis.demoUser = { id: 'other', email: 'other@example.test' };
assert.equal((await api.POST(request())).status, 403);
globalThis.demoUser = { id: 'admin', email: 'leandroboveda@gmail.com' };
assert.equal((await api.POST(request('https://evil.example'))).status, 403);
assert.equal((await api.POST(request())).status, 200);
sql.close();
console.log(
  'PASS demo admin: auth, CSRF, fixed owner, transactional rollback, D1 limits, complete related data, idempotency, preservation and tenant isolation. No email sent.',
);
