import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
const dataUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`;
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
const wrap = (sql, values = []) => ({
  bind: (...args) => wrap(sql, args),
  first: async () => db.prepare(sql).get(...values) ?? null,
  all: async () => ({ results: db.prepare(sql).all(...values) }),
  run: async () => ({
    meta: { changes: db.prepare(sql).run(...values).changes },
  }),
});
globalThis.__versionDB = {
  prepare: wrap,
  batch: async (statements) => {
    db.exec('BEGIN');
    try {
      for (const statement of statements) await statement.run();
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  },
};
db.exec(`INSERT INTO trainer_accounts(id,business_name,slug,contact_email) VALUES('t1','PF','pf','pf@example.com');
INSERT INTO athletes(id,trainer_account_id,first_name,last_name,email) VALUES('a1','t1','A','Alumno','a@example.com');`);
const scheduleUrl = dataUrl(
  await readFile(
    new URL('../lib/routine-schedule.ts', import.meta.url),
    'utf8',
  ),
);
const api = await import(
  dataUrl(
    (
      await readFile(
        new URL('../app/api/routines/route.ts', import.meta.url),
        'utf8',
      )
    )
      .replace(
        "import { getD1 } from '@/db';",
        'const getD1=()=>globalThis.__versionDB;',
      )
      .replace(
        "import { getStaffSessionFromRequest, isSameOrigin } from '@/lib/auth';",
        "const getStaffSessionFromRequest=async()=>({id:'u1',trainerAccountId:'t1'});const isSameOrigin=()=>true;",
      )
      .replace("'@/lib/routine-schedule'", JSON.stringify(scheduleUrl)),
  )
);
async function post(body) {
  const response = await api.POST(
    new Request('https://example.com/api/routines', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  const value = await response.json();
  assert.ok(response.ok, JSON.stringify(value));
  return value;
}
const content = (name) => ({
  weekPlans: [{ number: '1', pse: '5' }],
  sessions: [1, 4].map((weekday, index) => ({
    id: `day${index}`,
    weekday,
    name: `Día${index}`,
    rows: [
      {
        id: `row${index}`,
        block: 'A',
        category: 'Trabajo',
        name,
        values: ['3x5'],
        rir: ['2'],
      },
    ],
  })),
});
const first = await post({
  action: 'save',
  name: 'Plan',
  content: content('Ejercicio original'),
});
const assignment = await post({
  action: 'assign',
  routineId: first.routineId,
  targetType: 'athlete',
  targetId: 'a1',
  startsOn: '2026-01-01',
});
const second = await post({
  action: 'save',
  routineId: first.routineId,
  name: 'Plan editado',
  content: content('Ejercicio nuevo'),
});
const copy = await post({ action: 'duplicate', routineId: first.routineId });
assert.notEqual(copy.routineId, first.routineId);
assert.equal(copy.versionNumber, 1);
db.prepare('INSERT INTO files (id,trainer_account_id,storage_key,original_name,mime_type,size_bytes,uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)').run('f1','t1','private/f1','Plan.pdf','application/pdf',100,'u1');
db.prepare('INSERT INTO routine_files (routine_id,file_id) VALUES (?,?)').run(first.routineId,'f1');
const attachedCopy=await post({action:'duplicate',routineId:first.routineId});
assert.equal(db.prepare('SELECT file_id FROM routine_files WHERE routine_id=?').get(attachedCopy.routineId).file_id,'f1');
assert.equal(
  db.prepare('SELECT name FROM routines WHERE id=?').get(copy.routineId).name,
  'Plan editado (copia)',
);
assert.deepEqual(
  JSON.parse(
    db
      .prepare('SELECT content FROM routine_versions WHERE id=?')
      .get(copy.versionId).content,
  ),
  JSON.parse(
    db
      .prepare('SELECT content FROM routine_versions WHERE id=?')
      .get(second.versionId).content,
  ),
);
assert.equal(
  db
    .prepare(
      'SELECT COUNT(*) AS n FROM routine_assignments WHERE routine_version_id=?',
    )
    .get(copy.versionId).n,
  0,
);
const editedCopy = await post({
  action: 'duplicate',
  routineId: first.routineId,
  name: 'Mi copia',
  content: content('Cambio sin guardar'),
});
assert.equal(
  JSON.parse(
    db
      .prepare('SELECT content FROM routine_versions WHERE id=?')
      .get(editedCopy.versionId).content,
  ).sessions[0].rows[0].name,
  'Cambio sin guardar',
);
assert.equal(
  JSON.parse(
    db
      .prepare('SELECT content FROM routine_versions WHERE id=?')
      .get(second.versionId).content,
  ).sessions[0].rows[0].name,
  'Ejercicio nuevo',
);
const deniedCopy = await api.POST(
  new Request('https://example.com/api/routines', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'duplicate',
      routineId: 'foreign-or-missing',
    }),
  }),
);
assert.equal(deniedCopy.status, 404);
assert.notEqual(first.versionId, second.versionId);
assert.equal(
  db
    .prepare(
      'SELECT routine_version_id AS version FROM routine_assignments WHERE id=?',
    )
    .get(assignment.assignmentId).version,
  first.versionId,
);
assert.equal(
  JSON.parse(
    db
      .prepare('SELECT content FROM routine_versions WHERE id=?')
      .get(first.versionId).content,
  ).sessions[0].rows[0].name,
  'Ejercicio original',
);
const next = await post({
  action: 'assign',
  routineId: first.routineId,
  targetType: 'athlete',
  targetId: 'a1',
  startsOn: '2026-01-08',
});
assert.equal(
  db
    .prepare('SELECT ends_on AS date FROM routine_assignments WHERE id=?')
    .get(assignment.assignmentId).date,
  '2026-01-07',
);
assert.equal(
  db
    .prepare(
      'SELECT routine_version_id AS version FROM routine_assignments WHERE id=?',
    )
    .get(next.assignmentId).version,
  second.versionId,
);
await post({ action: 'archive', routineId: first.routineId });
assert.equal(
  db
    .prepare(
      'SELECT ended_on FROM athlete_routine_instances WHERE assignment_id=?',
    )
    .get(next.assignmentId).ended_on,
  (await import(scheduleUrl)).cancellationEndsOn(),
);
assert.equal(
  db.prepare('SELECT COUNT(*) AS n FROM routine_versions WHERE routine_id = ?').get(first.routineId).n,
  2,
);
db.close();
console.log(
  'PASS: immutable assigned versions, new explicit assignment, previous-period boundary, archive cutoff and preservation of history.',
);
