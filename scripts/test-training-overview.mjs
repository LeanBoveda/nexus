import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
const sourceUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`;
const scheduleUrl = sourceUrl(
  await readFile(
    new URL('../lib/routine-schedule.ts', import.meta.url),
    'utf8',
  ),
);
const portalUrl = sourceUrl(
  (await readFile(new URL('../lib/athlete-portal.ts', import.meta.url), 'utf8'))
    .replace(
      "import { getD1 } from '@/db';",
      'const getD1=()=>globalThis.__overviewDB;',
    )
    .replace("'@/lib/routine-schedule'", JSON.stringify(scheduleUrl)),
);
const overviewUrl = sourceUrl(
  (
    await readFile(
      new URL('../lib/training-overview.ts', import.meta.url),
      'utf8',
    )
  )
    .replace(
      "import { getD1 } from '@/db';",
      'const getD1=()=>globalThis.__overviewDB;',
    )
    .replace("'@/lib/athlete-portal'", JSON.stringify(portalUrl))
    .replace("'@/lib/routine-schedule'", JSON.stringify(scheduleUrl)),
);
const {
  overviewRange,
  canonicalTrainingLogs,
  trainingLogDate,
  getTrainingOverview,
  filterTrainingOverview,
} = await import(overviewUrl);
assert.deepEqual(overviewRange('2020-01-01', '2026-10-21'), {
  from: '2026-07-24',
  to: '2026-10-21',
});
const db = new DatabaseSync(':memory:');
const journal = JSON.parse(
  await readFile(
    new URL('../drizzle/meta/_journal.json', import.meta.url),
    'utf8',
  ),
);
for (const entry of journal.entries)
  db.exec(
    await readFile(
      new URL(`../drizzle/${entry.tag}.sql`, import.meta.url),
      'utf8',
    ),
  );
globalThis.__overviewDB = {
  prepare(sql) {
    return {
      bind(...values) {
        return {
          async all() {
            return { results: db.prepare(sql).all(...values) };
          },
        };
      },
    };
  },
};
db.exec(`INSERT INTO trainer_accounts(id,business_name,slug,contact_email) VALUES ('p1','PF 1','pf1','a@example.com'),('p2','PF 2','pf2','b@example.com');
INSERT INTO athletes(id,trainer_account_id,first_name,last_name,email) VALUES ('a1','p1','Ana','Uno','ana@example.com'),('a2','p2','Ana','Dos','ana@example.com');
INSERT INTO routines(id,trainer_account_id,name,created_by) VALUES ('r1','p1','Plan1','pf'),('r2','p2','Plan2','pf');`);
const content = JSON.stringify({
  sessions: [
    { id: 'wed', weekday: 3, rows: [] },
    { id: 'fri', weekday: 5, rows: [] },
  ],
  weekPlans: [{ number: '1' }],
});
for (const number of [1, 2]) {
  db.prepare(
    'INSERT INTO routine_versions(id,routine_id,version_number,content) VALUES (?,?,1,?)',
  ).run(`v${number}`, `r${number}`, content);
  db.prepare(
    "INSERT INTO routine_assignments(id,routine_version_id,target_type,target_id,starts_on,assigned_by) VALUES (?,?,'athlete',?,'2026-10-01','pf')",
  ).run(`ra${number}`, `v${number}`, `a${number}`);
  db.prepare(
    "INSERT INTO athlete_routine_instances(id,assignment_id,athlete_id,status) VALUES (?,?,?,'active')",
  ).run(`i${number}`, `ra${number}`, `a${number}`);
}
const legacyKey = 'week-2026-10-12-cycle-1-session-wed';
db.prepare(
  'INSERT INTO workout_logs(id,instance_id,athlete_id,session_key,completed_at,actual_values) VALUES (?,?,?,?,?,?)',
).run(
  'legacy',
  'i1',
  'a1',
  legacyKey,
  Date.parse('2026-10-14T20:00:00Z'),
  '{}',
);
db.prepare(
  'INSERT INTO workout_logs(id,instance_id,athlete_id,session_key,entry_key,trained_on,actual_values) VALUES (?,?,?,?,?,?,?)',
).run(
  'current',
  'i1',
  'a1',
  'date-2026-10-14-session-wed',
  'i1:a1:2026-10-14:wed',
  '2026-10-14',
  JSON.stringify({ legacySessionKeys: [legacyKey] }),
);
db.prepare(
  'INSERT INTO workout_logs(id,instance_id,athlete_id,session_key,completed_at,actual_values) VALUES (?,?,?,?,?,?)',
).run(
  'foreign',
  'i2',
  'a2',
  legacyKey,
  Date.parse('2026-10-14T20:00:00Z'),
  '{}',
);
const result = await getTrainingOverview('p1', '2026-10-12', '2026-10-18');
assert.equal(result.assignments.length, 1);
assert.equal(result.entries.length, 1);
assert.equal(result.entries[0].id, 'current');
assert.equal(result.entries[0].completedAt, null);
assert.equal(result.entries[0].date, '2026-10-14');
db.exec(`INSERT INTO organizations(id,trainer_account_id,name,type) VALUES ('o1','p1','Club propio','Club'),('o2','p2','Otro club','Club');
INSERT INTO groups(id,organization_id,name,sport,active) VALUES ('g1','o1','Plantel','General',1),('g2','o1','Plantel','General',1),('gone','o1','Baja','General',1),('inactive','o1','Archivado','General',0),('foreign','o2','Ajeno','General',1);
INSERT INTO group_memberships(athlete_id,group_id,ended_at) VALUES ('a1','g1',NULL),('a1','g2',NULL),('a1','gone',1),('a1','inactive',NULL),('a1','foreign',NULL);`);
const grouped = await getTrainingOverview('p1', '2026-10-12', '2026-10-18');
assert.deepEqual([...grouped.assignments[0].groupIds].sort(), ['g1', 'g2']);
for (const id of ['g1', 'g2']) {
  assert.equal(
    filterTrainingOverview(grouped, undefined, id).entries.length,
    1,
  );
  assert.equal(filterTrainingOverview(grouped, 'a1', id).assignments.length, 1);
}
for (const id of ['gone', 'inactive', 'foreign', 'unknown', '__ungrouped']) {
  const filtered = filterTrainingOverview(grouped, undefined, id);
  assert.equal(filtered.entries.length, 0);
  assert.equal(
    filtered.assignments.length,
    0,
    'No planned sessions leak into group totals',
  );
}
assert.equal(filterTrainingOverview(grouped, 'a2', 'g1').entries.length, 0);
assert.equal(filterTrainingOverview(grouped).entries.length, 1);
assert.equal(
  filterTrainingOverview(result, undefined, '__ungrouped').entries.length,
  1,
);
assert.equal(
  (await getTrainingOverview('p1', '2026-10-12', '2026-10-18', 'a2')).entries
    .length,
  0,
);
assert.equal(
  (await getTrainingOverview('p1', '2026-10-15', '2026-10-18')).entries.length,
  0,
);
assert.equal(
  trainingLogDate(
    { sessionKey: legacyKey, trainedOn: null },
    result.assignments[0],
  ),
  '2026-10-14',
);
assert.equal(
  canonicalTrainingLogs([
    { ...result.entries[0], id: 'one' },
    { ...result.entries[0], id: 'two' },
  ]).length,
  1,
);
db.exec(
  "UPDATE athlete_routine_instances SET status='cancelled', ended_on='2026-10-15' WHERE id='i1'",
);
const cancelled = await getTrainingOverview('p1', '2026-10-12', '2026-10-18');
assert.equal(cancelled.entries.length, 1, 'Historical records remain visible');
assert.equal(
  cancelled.assignments[0].endsOn,
  '2026-10-14',
  'Agenda receives inclusive date before cutoff',
);
assert.equal(
  (await getTrainingOverview('p1', '2026-10-15', '2026-10-21')).assignments
    .length,
  0,
);
db.exec("UPDATE athlete_routine_instances SET ended_on=NULL WHERE id='i1'");
assert.equal(
  (await getTrainingOverview('p1', '2026-10-12', '2026-10-18')).entries.length,
  1,
  'Legacy cancellation history remains visible',
);
console.log(
  'Agenda/Carga: fechas acotadas, SQL real migrado, aislamiento PF/ficha y compatibilidad legacy: OK.',
);
