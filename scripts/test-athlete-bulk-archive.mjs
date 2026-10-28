import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
const journal = JSON.parse(
  await readFile('drizzle/meta/_journal.json', 'utf8'),
);
for (const entry of journal.entries)
  db.exec(await readFile(`drizzle/${entry.tag}.sql`, 'utf8'));
const wrap = (sql, params = []) => ({
  bind: (...values) => {
    assert.ok(values.length <= 100);
    return wrap(sql, values);
  },
  first: async () => db.prepare(sql).get(...params) ?? null,
  all: async () => ({ results: db.prepare(sql).all(...params) }),
  run: async () => ({
    meta: { changes: db.prepare(sql).run(...params).changes },
  }),
});
let largestBatch = 0;
globalThis.__bulkDb = {
  prepare: wrap,
  batch: async (statements) => {
    largestBatch = Math.max(largestBatch, statements.length);
    assert.ok(statements.length <= 50);
    db.exec('BEGIN');
    try {
      const output = [];
      for (const statement of statements) output.push(await statement.run());
      db.exec('COMMIT');
      return output;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  },
};
globalThis.__bulkUser = { id: 'coach1', trainerAccountId: 'p1' };
const url = (source) =>
  `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`;
const schedule = url(await readFile('lib/routine-schedule.ts', 'utf8'));
const api = await import(
  url(
    (await readFile('app/api/athletes/route.ts', 'utf8'))
      .replace(
        "import { getD1 } from '@/db';",
        'const getD1=()=>globalThis.__bulkDb;',
      )
      .replace(
        "import { getStaffSessionFromRequest, isSameOrigin } from '@/lib/auth';",
        'const getStaffSessionFromRequest=async()=>globalThis.__bulkUser; const isSameOrigin=request=>request.headers.get("origin")==="https://nexo.test";',
      )
      .replace(
        "import { groupMembershipStatements } from '@/lib/group-memberships';",
        'const groupMembershipStatements=()=>{throw new Error("Not used");};',
      )
      .replace("'@/lib/routine-schedule'", JSON.stringify(schedule)),
  )
);
db.exec(`INSERT INTO trainer_accounts(id,business_name,slug,contact_email) VALUES('p1','PF1','p1','p1@example.test'),('p2','PF2','p2','p2@example.test');
INSERT INTO users(id,email,name,role,trainer_account_id) VALUES('coach1','coach1@example.test','Coach','coach','p1');
INSERT INTO organizations(id,name,type,trainer_account_id) VALUES('o','Club','club','p1');
INSERT INTO groups(id,organization_id,name,sport) VALUES('g','o','Grupo','General');
INSERT INTO routines(id,trainer_account_id,name,created_by) VALUES('r','p1','Plan','coach1');
INSERT INTO routine_versions(id,routine_id,version_number,content) VALUES('v','r',1,'{}');
INSERT INTO routine_assignments(id,routine_version_id,target_type,target_id,starts_on,assigned_by) VALUES('ra','v','group','g','2026-01-01','coach1');
INSERT INTO evaluation_templates(id,name,sport,created_by,trainer_account_id) VALUES('et','Test','General','coach1','p1');
INSERT INTO evaluation_metrics(id,template_id,key,label,unit,better_direction) VALUES('em','et','salto','Salto','cm','higher');`);
for (let i = 0; i < 130; i++) {
  const id = `a${i}`;
  db.prepare(
    'INSERT INTO athletes(id,first_name,last_name,email,trainer_account_id,status) VALUES(?,?,?,?,?,?)',
  ).run(
    id,
    'Alumno',
    String(i),
    `${id}@example.test`,
    'p1',
    i % 2 ? 'active' : 'paused',
  );
  db.prepare(
    'INSERT INTO group_memberships(athlete_id,group_id) VALUES(?,?)',
  ).run(id, 'g');
  db.prepare(
    "INSERT INTO athlete_routine_instances(id,assignment_id,athlete_id,status) VALUES(?,?,?,'active')",
  ).run(id, 'ra', id);
  db.prepare(
    "INSERT INTO workout_logs(id,instance_id,athlete_id,session_key,actual_values) VALUES(?,?,?,'session','{}')",
  ).run(id, id, id);
}
db.exec(`INSERT INTO athletes(id,first_name,last_name,email,trainer_account_id) VALUES('foreign','Otro','PF','foreign@example.test','p2');
INSERT INTO users(id,email,name,role,athlete_id,trainer_account_id) VALUES('shared','a0@example.test','Alumno','athlete','a0','p1');
INSERT INTO athlete_identities(athlete_id,user_id) VALUES('a0','shared');
INSERT INTO auth_sessions(token_hash,user_id,expires_at,last_seen_at,active_athlete_id) VALUES('selected-session','shared',9999999999999,0,'a0'),('other-session','shared',9999999999999,0,'foreign');
INSERT INTO athlete_access_links(id,athlete_id,token_hash,expires_at,created_by) VALUES('link','a0','test-token',9999999999999,'coach1');
INSERT INTO evaluation_sessions(id,template_id,athlete_id,evaluated_at,surface) VALUES('es','et','a0',1,'General');
INSERT INTO evaluation_results(session_id,metric_id,value) VALUES('es','em',50);`);
const request = (body, origin = 'https://nexo.test', raw = false) =>
  new Request('https://nexo.test/api/athletes', {
    method: 'DELETE',
    headers: { origin, 'content-type': 'application/json' },
    body: raw ? body : JSON.stringify(body),
  });
const remove = (body, origin) => api.DELETE(request(body, origin));
globalThis.__bulkUser = null;
assert.equal((await remove({ ids: ['a0'] })).status, 401);
globalThis.__bulkUser = { id: 'coach1', trainerAccountId: 'p1' };
assert.equal((await remove({ ids: ['a0'] }, 'https://evil.test')).status, 403);
for (const body of [
  null,
  {},
  { ids: [] },
  { ids: 'a0' },
  { ids: [null] },
  { ids: [''] },
  { ids: ['x'.repeat(141)] },
  { ids: Array(501).fill('a0') },
])
  assert.equal((await remove(body)).status, 400);
assert.equal((await api.DELETE(request('{', undefined, true))).status, 400);
assert.equal((await remove({ ids: ['a0', 'foreign'] })).status, 404);
assert.equal(
  db.prepare("SELECT status FROM athletes WHERE id='a0'").get().status,
  'paused',
);
assert.equal((await remove({ ids: ['a0', 'missing'] })).status, 404);
// Failure after the athlete update must roll back all changes.
db.exec(
  "CREATE TRIGGER simulate_failure BEFORE UPDATE ON group_memberships BEGIN SELECT RAISE(ABORT,'simulated batch failure'); END;",
);
assert.equal((await remove({ ids: ['a0', 'a1'] })).status, 500);
assert.equal(
  db.prepare("SELECT status FROM athletes WHERE id='a0'").get().status,
  'paused',
);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM auth_sessions').get().n, 2);
db.exec('DROP TRIGGER simulate_failure;');
const ids = Array.from({ length: 125 }, (_, i) => `a${i}`);
const result = await remove({ ids: [...ids, 'a0'] });
assert.equal(result.status, 200);
assert.equal((await result.json()).archivedCount, 125);
assert.equal(largestBatch, 5);
assert.equal(
  db.prepare("SELECT COUNT(*) AS n FROM athletes WHERE status='archived'").get()
    .n,
  125,
);
assert.equal(
  db
    .prepare(
      'SELECT COUNT(*) AS n FROM group_memberships WHERE ended_at IS NOT NULL',
    )
    .get().n,
  125,
);
assert.equal(
  db
    .prepare(
      "SELECT COUNT(*) AS n FROM athlete_routine_instances WHERE status='cancelled' AND ended_on IS NOT NULL",
    )
    .get().n,
  125,
);
assert.ok(
  db
    .prepare("SELECT redeemed_at FROM athlete_access_links WHERE id='link'")
    .get().redeemed_at,
);
assert.equal(
  db
    .prepare(
      "SELECT COUNT(*) AS n FROM auth_sessions WHERE token_hash='selected-session'",
    )
    .get().n,
  0,
);
assert.equal(
  db
    .prepare(
      "SELECT COUNT(*) AS n FROM auth_sessions WHERE token_hash='other-session'",
    )
    .get().n,
  1,
);
assert.equal(
  db.prepare('SELECT COUNT(*) AS n FROM users WHERE id=?').get('shared').n,
  1,
);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM workout_logs').get().n, 130);
assert.equal(
  db.prepare('SELECT COUNT(*) AS n FROM evaluation_results').get().n,
  1,
);
assert.equal(
  db.prepare("SELECT status FROM athletes WHERE id='foreign'").get().status,
  'active',
);
assert.equal(
  db
    .prepare("SELECT ended_at FROM group_memberships WHERE athlete_id='a129'")
    .get().ended_at,
  null,
);
assert.equal(
  (await (await remove({ ids })).json()).archivedCount,
  0,
  'Safe retry',
);
assert.equal(
  (await remove({ id: 'a129' })).status,
  200,
  'Single-record contract preserved',
);
assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
console.log(
  'PASS bulk archive: 125 athletes, deduplication, auth/CSRF, tenant isolation, five-statement atomic rollback, D1 limits, history preservation, access revocation, idempotent retry and single-record compatibility.',
);
