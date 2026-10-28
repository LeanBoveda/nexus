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
  getTrainingLoad,
  addTrainingDays,
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
          async first() {
            return db.prepare(sql).get(...values) ?? null;
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

// Modern SQL pagination: summaries and filters must cover the entire period.
db.exec(`DELETE FROM workout_logs;
UPDATE athlete_routine_instances SET status='active',ended_on=NULL;
UPDATE routine_assignments SET starts_on='2026-07-01';
INSERT INTO athletes(id,trainer_account_id,first_name,last_name,email) VALUES('a3','p1','Otra','Persona','otra@example.test');
INSERT INTO athlete_routine_instances(id,assignment_id,athlete_id,status) VALUES('i3','ra1','a3','active');`);
const writeLog =
  db.prepare(`INSERT INTO workout_logs(id,instance_id,athlete_id,session_key,entry_key,trained_on,completed_at,pse,pain,actual_values,created_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
for (const [athlete, instance] of [
  ['a1', 'i1'],
  ['a3', 'i3'],
  ['a2', 'i2'],
]) {
  for (let i = 0; i < 60; i++) {
    const day = addTrainingDays('2026-08-20', i);
    writeLog.run(
      `${athlete}-${i}`,
      instance,
      athlete,
      `date-${day}-session-wed`,
      `${instance}:${athlete}:${day}`,
      day,
      i % 3 ? Date.parse(`${day}T12:00:00Z`) : null,
      i % 10,
      i % 2 ? null : 2,
      '{}',
      1000 + i,
    );
  }
}
const from = '2026-08-20',
  to = '2026-10-18';
const page1 = await getTrainingLoad('p1', from, to);
const page2 = await getTrainingLoad('p1', from, to, { page: 2 });
const page3 = await getTrainingLoad('p1', from, to, { page: 999 });
assert.deepEqual(
  [page1.entries.length, page2.entries.length, page3.entries.length],
  [50, 50, 20],
);
assert.equal(
  new Set(
    [...page1.entries, ...page2.entries, ...page3.entries].map((e) => e.id),
  ).size,
  120,
);
assert.deepEqual(page1.summary, page2.summary);
assert.equal(page1.summary.total, 120);
assert.equal(page1.summary.pse, 4.5);
assert.equal(page1.summary.pain, 2);
assert.equal(page3.pagination.page, 3);
assert.equal(
  (await getTrainingLoad('p1', from, to, { page: 'bad' })).pagination.page,
  1,
);
assert.equal(
  (await getTrainingLoad('p1', from, to, { page: '-1' })).pagination.page,
  1,
);
for (const [filters, expected] of [
  [{ groupId: 'g1' }, 60],
  [{ groupId: 'g2' }, 60],
  [{ groupId: '__ungrouped' }, 60],
  [{ athleteId: 'a1' }, 60],
  [{ athleteId: 'a2' }, 0],
  [{ groupId: 'foreign' }, 0],
  [{ groupId: 'unknown' }, 0],
  [{ groupId: 'gone' }, 0],
  [{ groupId: 'inactive' }, 0],
  [{ athleteId: 'a3', groupId: 'g1' }, 0],
]) {
  const filtered = await getTrainingLoad('p1', from, to, filters);
  assert.equal(filtered.summary.total, expected, JSON.stringify(filters));
  assert.ok(filtered.entries.every((e) => e.athleteId !== 'a2'));
  if (!expected) {
    assert.equal(filtered.summary.planned, 0);
    assert.equal(filtered.summary.pse, null);
    assert.equal(filtered.pagination.pages, 1);
  }
}
// Compare planned/completed with the original calendar behavior.
const { resolveRoutineSession } = await import(portalUrl);
let planned = 0,
  completed = 0;
const all = await getTrainingOverview('p1', from, to);
for (let day = from; day <= to; day = addTrainingDays(day, 1))
  for (const assignment of all.assignments) {
    if (!resolveRoutineSession(assignment, day).scheduledToday) continue;
    planned++;
    if (
      all.entries.find(
        (e) => e.instanceId === assignment.instanceId && e.date === day,
      )?.completedAt != null
    )
      completed++;
  }
assert.equal(page1.summary.planned, planned);
assert.equal(page1.summary.completed, completed);
// Legacy records still shadow correctly and cancelled plans keep past data.
db.exec(
  "UPDATE athlete_routine_instances SET status='cancelled',ended_on='2026-10-01' WHERE id='i1'",
);
const modernCancelled = await getTrainingLoad('p1', from, to, {
  athleteId: 'a1',
});
assert.ok(modernCancelled.entries.every((e) => e.date < '2026-10-01'));
assert.equal(
  modernCancelled.summary.total,
  (await getTrainingOverview('p1', from, to, 'a1')).entries.length,
);
db.exec(
  "UPDATE athlete_routine_instances SET status='active',ended_on=NULL WHERE id='i1'",
);
db.prepare(`INSERT INTO workout_logs(id,instance_id,athlete_id,session_key,completed_at,pse,pain,actual_values)
  VALUES('old','i1','a1',?,1,10,9,'{}')`).run(legacyKey);
db.prepare(
  'UPDATE workout_logs SET actual_values=?, completed_at=NULL WHERE id=?',
).run(JSON.stringify({ legacySessionKeys: [legacyKey] }), 'a1-55');
const legacyLoad = await getTrainingLoad('p1', from, to);
const legacyFull = await getTrainingOverview('p1', from, to);
assert.equal(legacyLoad.summary.total, legacyFull.entries.length);
assert.equal(legacyLoad.entries.length, 50);
db.exec(
  "UPDATE athlete_routine_instances SET status='cancelled',ended_on='2026-10-01' WHERE id='i1'",
);
const cancelledLoad = await getTrainingLoad('p1', from, to, {
  athleteId: 'a1',
});
assert.ok(cancelledLoad.entries.every((e) => e.date < '2026-10-01'));
assert.equal(
  cancelledLoad.summary.total,
  (await getTrainingOverview('p1', from, to, 'a1')).entries.length,
);
console.log(
  'PASS Carga: SQL pagination, whole-period totals, stable pages, group/athlete filters, tenant isolation, calendar parity, legacy shadowing and cancellation.',
);
