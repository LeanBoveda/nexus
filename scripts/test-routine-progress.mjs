import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const url = (source) =>
  `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`;
const scheduleUrl = url(
  await readFile(
    new URL('../lib/routine-schedule.ts', import.meta.url),
    'utf8',
  ),
);
const portalUrl = url(
  (await readFile(new URL('../lib/athlete-portal.ts', import.meta.url), 'utf8'))
    .replace(
      "import { getD1 } from '@/db';",
      'const getD1=()=>globalThis.__progressDB;',
    )
    .replace("'@/lib/routine-schedule'", JSON.stringify(scheduleUrl)),
);
const { resolveRoutineSession, getAthletePortalData } = await import(portalUrl);
const { calendarWeek, validDateKey, scheduleDate, cancellationEndsOn } = await import(scheduleUrl);
assert.equal(cancellationEndsOn(new Date('2026-10-22T01:00:00Z')), '2026-10-22', 'Cancellation follows Buenos Aires day, not UTC day');
assert.equal(calendarWeek('2026-10-07', '2026-10-13', 4), 0);
assert.equal(calendarWeek('2026-10-07', '2026-10-14', 4), 1);
assert.equal(calendarWeek('2026-10-07', '2027-01-01', 4), 3);
assert.equal(validDateKey('2026-02-30'), false);
assert.equal(
  scheduleDate(new Date('2026-10-08T01:00:00Z')).dateKey,
  '2026-10-07',
);
const content = {
  activeWeek: 3,
  weekPlans: [{ number: '1' }, { number: '2' }],
  sessions: [
    {
      id: 'wed',
      weekday: 3,
      rows: [{ id: 'squat', name: 'Sentadilla', values: ['3x5', '4x5'] }],
    },
    { id: 'fri', weekday: 5, rows: [{ id: 'run', name: 'Carrera' }] },
  ],
};
const instance = {
  instanceId: 'plan-a',
  name: 'Plan',
  description: '',
  content,
  overrides: {},
  startsOn: '2026-10-07',
};
assert.equal(
  resolveRoutineSession(instance, '2026-10-07').exercises[0].target,
  '3x5',
);
assert.equal(
  resolveRoutineSession(instance, '2026-10-14').exercises[0].target,
  '4x5',
);
assert.equal(
  resolveRoutineSession(instance, '2026-10-08').scheduledToday,
  false,
);

const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE routines(id TEXT PRIMARY KEY,name TEXT,description TEXT); CREATE TABLE routine_versions(id TEXT PRIMARY KEY,routine_id TEXT,content TEXT);
CREATE TABLE routine_assignments(id TEXT PRIMARY KEY,routine_version_id TEXT,starts_on TEXT,ends_on TEXT);
CREATE TABLE athlete_routine_instances(id TEXT PRIMARY KEY,athlete_id TEXT,assignment_id TEXT,status TEXT,overrides TEXT,ended_on TEXT,created_at INTEGER DEFAULT 0);
CREATE TABLE athletes(id TEXT,first_name TEXT,last_name TEXT,email TEXT,primary_position TEXT,country_code TEXT,status TEXT);
CREATE TABLE group_memberships(athlete_id TEXT,group_id TEXT,ended_at INTEGER);
CREATE TABLE groups(id TEXT,name TEXT,active INTEGER);
CREATE TABLE evaluation_sessions(id TEXT,athlete_id TEXT,evaluated_at INTEGER,archived_at INTEGER,surface TEXT);
CREATE TABLE evaluation_results(session_id TEXT,metric_id TEXT,value REAL);
CREATE TABLE evaluation_metrics(id TEXT,label TEXT,unit TEXT,better_direction TEXT);
INSERT INTO athletes VALUES ('athlete-a','Ana','Prueba','ana@example.com',NULL,'AR','active');
CREATE TABLE workout_logs(id TEXT PRIMARY KEY,instance_id TEXT,athlete_id TEXT,session_key TEXT,completed_at INTEGER,pse REAL,pain REAL,notes TEXT,actual_values TEXT,created_at INTEGER,entry_key TEXT UNIQUE,trained_on TEXT,updated_at INTEGER);`);
db.prepare('INSERT INTO routines VALUES (?,?,?)').run('r', 'Plan', '');
db.prepare('INSERT INTO routine_versions VALUES (?,?,?)').run(
  'v',
  'r',
  JSON.stringify(content),
);
db.prepare('INSERT INTO routine_assignments VALUES (?,?,?,?)').run(
  'a',
  'v',
  '2026-10-07',
  '2026-10-21',
);
db.prepare(
  'INSERT INTO athlete_routine_instances(id,athlete_id,assignment_id,status,overrides) VALUES (?,?,?,?,?)',
).run('plan-a', 'athlete-a', 'a', 'active', '{}');
globalThis.__progressDB = {
  prepare(sql) {
    return {
      bind(...values) {
        return {
          async first() {
            return db.prepare(sql).get(...values) ?? null;
          },
          async run() {
            return db.prepare(sql).run(...values);
          },
          async all() {
            return { results: db.prepare(sql).all(...values) };
          },
        };
      },
    };
  },
};
globalThis.__progressUser = { role: 'athlete', athleteId: 'athlete-a' };
const routeSource = (
  await readFile(
    new URL('../app/api/athlete/progress/route.ts', import.meta.url),
    'utf8',
  )
)
  .replace(
    "import { getD1 } from '@/db';",
    'const getD1=()=>globalThis.__progressDB;',
  )
  .replace(
    "import { getSessionFromRequest, isSameOrigin } from '@/lib/auth';",
    'const getSessionFromRequest=async()=>globalThis.__progressUser; const isSameOrigin=()=>true;',
  )
  .replace("'@/lib/athlete-portal'", JSON.stringify(portalUrl))
  .replace("'@/lib/routine-schedule'", JSON.stringify(scheduleUrl));
const { POST } = await import(url(routeSource));
const base = {
  instanceId: 'plan-a',
  dateKey: '2026-10-14',
  sessionKey: resolveRoutineSession(instance, '2026-10-14').sessionKey,
  completedExerciseIds: ['squat'],
  completed: true,
  pse: 5,
  pain: 0,
};
const post = (input) =>
  POST(
    new Request('https://nexo.test/api/athlete/progress', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
assert.equal((await post({ ...base, dateKey: '2099-01-01' })).status, 400);
assert.equal((await post({ ...base, dateKey: '2026-10-01' })).status, 404);
assert.equal(
  (await post({ ...base, completedExerciseIds: ['foreign'] })).status,
  400,
);
assert.equal((await post({ ...base, sessionKey: 'forged' })).status, 400);
const saved = await Promise.all([post(base), post(base), post(base)]);
assert(saved.every((response) => response.status === 200));
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM workout_logs').get().n, 1);
assert.equal(
  (
    await post({
      ...base,
      completed: false,
      completedExerciseIds: [],
      notes: 'Corregido',
    })
  ).status,
  200,
);
assert.equal(
  db.prepare('SELECT completed_at FROM workout_logs').get().completed_at,
  null,
);
db.exec(
  "UPDATE athlete_routine_instances SET status='cancelled', ended_on='2026-10-14' WHERE id='plan-a'",
);
assert.equal(
  (await post(base)).status,
  404,
  'Cancellation cutoff is exclusive',
);
const previous = {
  ...base,
  dateKey: '2026-10-07',
  sessionKey: resolveRoutineSession(instance, '2026-10-07').sessionKey,
};
assert.equal(
  (await post(previous)).status,
  200,
  'Historical session remains editable',
);
assert.equal(
  (await getAthletePortalData('athlete-a', { dateKey: '2026-10-07' })).routine
    .instanceId,
  'plan-a',
);
assert.equal(
  (await getAthletePortalData('athlete-a', { dateKey: '2026-10-14' })).routine,
  null,
  'Portal excludes cancellation day',
);
db.exec("UPDATE athlete_routine_instances SET ended_on=NULL WHERE id='plan-a'");
assert.equal(
  (await post(previous)).status,
  200,
  'Legacy cancellation keeps history before today',
);
const currentDay = scheduleDate();
const currentContent = structuredClone(content);
currentContent.sessions[0].weekday = currentDay.weekday;
currentContent.sessions[1].weekday = currentDay.weekday === 7 ? 1 : currentDay.weekday + 1;
db.prepare('UPDATE routine_versions SET content=?').run(JSON.stringify(currentContent));
db.exec('UPDATE routine_assignments SET ends_on=NULL');
db.prepare("UPDATE athlete_routine_instances SET status='cancelled', ended_on=? WHERE id='plan-a'").run(cancellationEndsOn());
const currentInput = { ...base, dateKey: currentDay.dateKey, sessionKey: resolveRoutineSession({ ...instance, content: currentContent }, currentDay.dateKey).sessionKey };
assert.equal((await post(currentInput)).status, 200, 'Cancellation preserves training recorded on the cancellation day');
const currentPortal = await getAthletePortalData('athlete-a', { dateKey: currentDay.dateKey });
assert.equal(currentPortal.routine.instanceId, 'plan-a');
assert.notEqual(currentPortal.progress.completedAt, null, 'Today remains visible after cancellation');
globalThis.__progressUser = { role: 'athlete', athleteId: 'another-profile' };
assert.equal((await post(base)).status, 404);
console.log(
  'Calendario, fecha histórica, validación y reintentos idempotentes: OK (SQLite local, autenticación simulada).',
);
