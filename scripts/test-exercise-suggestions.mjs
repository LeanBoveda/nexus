import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
const moduleUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`;
const { exerciseSuggestions } = await import(
  moduleUrl(await readFile('lib/exercise-suggestions.ts', 'utf8'))
);
assert.deepEqual(exerciseSuggestions(['Banco plano'], 'b'), []);
assert.deepEqual(
  exerciseSuggestions(
    ['Banco plano', ' banco plano ', 'Báscula', 'Remo'],
    'ba',
  ),
  ['Banco plano', 'Báscula'],
);
const db = new DatabaseSync(':memory:');
db.exec(
  'CREATE TABLE routines(id TEXT,trainer_account_id TEXT); CREATE TABLE routine_versions(routine_id TEXT,content TEXT);',
);
db.exec("INSERT INTO routines VALUES('r1','pf1'),('r2','pf2');");
const insert = db.prepare('INSERT INTO routine_versions VALUES(?,?)');
insert.run(
  'r1',
  JSON.stringify({
    sessions: [
      { rows: [{ name: 'Banco plano' }, { name: 'Nuevo ejercicio' }] },
    ],
  }),
);
insert.run('r1', JSON.stringify({ rows: [{ name: 'Remo' }] }));
insert.run(
  'r2',
  JSON.stringify({ sessions: [{ rows: [{ name: 'Privado de otro PF' }] }] }),
);
globalThis.__exerciseUser = { trainerAccountId: 'pf1' };
globalThis.__exerciseDb = {
  prepare: (sql) => ({
    bind: (...values) => ({
      all: async () => ({ results: db.prepare(sql).all(...values) }),
    }),
  }),
};
const source = (await readFile('app/api/exercises/route.ts', 'utf8'))
  .replace(
    "import { getD1 } from '@/db';",
    'const getD1 = () => globalThis.__exerciseDb;',
  )
  .replace(
    "import { getStaffSessionFromRequest } from '@/lib/auth';",
    'const getStaffSessionFromRequest = async () => globalThis.__exerciseUser;',
  );
const api = await import(moduleUrl(source));
const result = await api.GET(new Request('https://test/api/exercises'));
assert.deepEqual((await result.json()).names, ['Banco plano', 'Remo']);
globalThis.__exerciseUser = null;
assert.equal(
  (await api.GET(new Request('https://test/api/exercises'))).status,
  401,
);
console.log(
  'PASS exercise suggestions: two letters, accents, duplicates, persisted multi-session/legacy names, PF isolation and authentication.',
);
