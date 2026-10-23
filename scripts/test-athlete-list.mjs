import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const moduleUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`;
const sql = new DatabaseSync(':memory:');
sql.exec(`CREATE TABLE athletes (id TEXT PRIMARY KEY, trainer_account_id TEXT, first_name TEXT, last_name TEXT, email TEXT, phone TEXT, birth_date TEXT, country_code TEXT, primary_position TEXT, primary_context TEXT, status TEXT, created_at INTEGER);
CREATE TABLE organizations (id TEXT PRIMARY KEY, trainer_account_id TEXT, name TEXT, type TEXT);
CREATE TABLE groups (id TEXT PRIMARY KEY, organization_id TEXT, name TEXT, active INTEGER, sport TEXT, season TEXT);
CREATE TABLE group_memberships (group_id TEXT, athlete_id TEXT, role TEXT, ended_at INTEGER);
INSERT INTO organizations VALUES ('oa', 'a', 'Organización A', 'Club'),('ob', 'b', 'Organización B', 'Club');
INSERT INTO groups VALUES ('ga','oa','Atletismo',1,'Atletismo','2026'),('gb','ob','Grupo ajeno',1,'Tenis','2026'),('inactive','oa','Histórico',0,'Atletismo','2025');`);
const insert = sql.prepare(
  'INSERT INTO athletes VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?, NULL, ?, ?)',
);
for (let index = 1; index <= 125; index++)
  insert.run(
    `a${String(index).padStart(3, '0')}`,
    'a',
    index === 10 ? 'A_%' : `Nombre ${index}`,
    `Apellido ${String(index).padStart(3, '0')}`,
    `persona${index}@example.com`,
    index === 3 ? 'Arquero' : null,
    index <= 100 ? 'active' : 'paused',
    index,
  );
insert.run(
  'archived',
  'a',
  'Baja',
  'Archivado',
  'baja@example.com',
  null,
  'archived',
  0,
);
for (let index = 1; index <= 35; index++)
  insert.run(
    `b${index}`,
    'b',
    'Ajeno',
    `Apellido ${index}`,
    `ajeno${index}@example.com`,
    null,
    'active',
    index,
  );
sql.exec(
  "INSERT INTO group_memberships VALUES ('ga','a001',NULL,NULL),('ga','a002',NULL,123),('inactive','a003',NULL,NULL),('gb','a004',NULL,NULL)",
);
const queried = [];
globalThis.__listDb = {
  prepare(query) {
    queried.push(query);
    return {
      params: [],
      bind(...params) {
        this.params = params;
        return this;
      },
      async all() {
        return { results: sql.prepare(query).all(...this.params) };
      },
      async first() {
        return sql.prepare(query).get(...this.params) ?? null;
      },
    };
  },
};
globalThis.__listUser = { id: 'coach-a', trainerAccountId: 'a' };
const dbUrl = moduleUrl(
  'export function getD1(){ return globalThis.__listDb; }',
);
const authUrl = moduleUrl(
  'export async function getStaffSessionFromRequest(){return globalThis.__listUser;} export function isSameOrigin(){return true;}',
);
const membershipUrl = moduleUrl(
  'export function groupMembershipStatements(){throw new Error("Mutation not in scope");}',
);
const scheduleUrl = moduleUrl(await readFile(new URL('../lib/routine-schedule.ts', import.meta.url), 'utf8'));
const loadApi = async (path) =>
  import(
    moduleUrl(
      (await readFile(new URL(path, import.meta.url), 'utf8'))
        .replace("'@/db'", JSON.stringify(dbUrl))
        .replace("'@/lib/auth'", JSON.stringify(authUrl))
        .replace("'@/lib/group-memberships'", JSON.stringify(membershipUrl))
        .replace("'@/lib/routine-schedule'", JSON.stringify(scheduleUrl)),
    )
  );
const api = await loadApi('../app/api/athletes/route.ts');
async function get(query = '', expected = 200) {
  const response = await api.GET(
    new Request(`http://localhost/api/athletes${query}`),
  );
  const data = await response.json();
  assert.equal(response.status, expected, JSON.stringify(data));
  if (expected === 200)
    assert.match(response.headers.get('server-timing'), /athletes;dur=/);
  return data;
}
const legacy = await get();
assert.equal(legacy.athletes.length, 125);
assert.equal(legacy.total, undefined);
const first = await get('?page=1&pageSize=50');
assert.equal(first.athletes.length, 50);
assert.equal(first.total, 125);
assert.equal(first.page, 1);
assert.deepEqual(first.summary, { active: 100, paused: 25, withoutGroup: 124 });
const second = await get('?page=2&pageSize=50');
assert.equal(second.athletes.length, 50);
assert.ok(
  second.athletes.every(
    (row) => !first.athletes.some((previous) => previous.id === row.id),
  ),
);
const last = await get('?page=999&pageSize=50');
assert.equal(last.page, 3);
assert.equal(last.athletes.length, 25);
assert.equal((await get('?pageSize=999')).athletes.length, 100);
const paused = await get('?status=paused&pageSize=10');
assert.equal(paused.total, 25);
assert.equal(paused.summary.active, 100);
assert.ok(paused.athletes.every((row) => row.status === 'paused'));
assert.equal((await get('?q=persona125%40example.com')).total, 1);
assert.equal((await get('?q=Arquero')).total, 1);
assert.equal((await get('?q=Atletismo')).total, 1);
assert.equal((await get('?q=A_%25')).total, 1);
assert.equal((await get('?group=Atletismo')).total, 1);
assert.equal((await get('?group=none')).total, 124);
assert.equal((await get('?group=Grupo%20ajeno')).total, 0);
assert.equal((await get('?q=ajeno')).total, 0);
const zero = await get('?q=inexistente&page=4');
assert.equal(zero.total, 0);
assert.equal(zero.page, 1);
assert.deepEqual(zero.athletes, []);
for (const query of [
  '?page=0',
  '?page=-1',
  '?page=1.5',
  '?pageSize=0',
  '?pageSize=no',
  '?status=archived',
])
  await get(query, 400);
globalThis.__listUser = { id: 'coach-empty', trainerAccountId: 'empty' };
const empty = await get('?page=1');
assert.deepEqual(empty.summary, { active: 0, paused: 0, withoutGroup: 0 });
assert.equal(empty.total, 0);
globalThis.__listUser = null;
await get('?page=1', 401);
globalThis.__listUser = { id: 'coach-a', trainerAccountId: 'a' };
queried.length = 0;
const groupApi = await loadApi('../app/api/groups/route.ts');
const groupsResponse = await groupApi.GET(
  new Request('http://localhost/api/groups?groupsOnly=1'),
);
const groups = await groupsResponse.json();
assert.equal(groups.groups.length, 1);
assert.equal(groups.athletes, undefined);
assert.equal(queried.length, 1);
sql.close();
delete globalThis.__listDb;
delete globalThis.__listUser;
console.log(
  'PASS listado de alumnos: paginación, búsqueda literal, filtros servidor, resúmenes tenant completos, aislamiento, grupos livianos y contrato legacy.',
);
