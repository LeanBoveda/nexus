import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const moduleUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`;
const helperUrl = moduleUrl(
  await readFile(
    new URL('../lib/evaluations-validation.ts', import.meta.url),
    'utf8',
  ),
);
const core = await import(helperUrl);
assert.equal(core.evaluationDate('2026-02-30'), null);
assert.equal(
  core.evaluationDate('2024-02-29'),
  Date.parse('2024-02-29T12:00:00Z'),
);
for (const values of [
  [{ metricId: 'x', value: '' }],
  [{ metricId: 'foreign', value: 1 }],
  [
    { metricId: 'x', value: 1 },
    { metricId: 'x', value: 2 },
  ],
])
  assert.throws(() => core.evaluationResults(values, new Set(['x'])));

const sql = new DatabaseSync(':memory:');
sql.exec(`PRAGMA foreign_keys = ON;
CREATE TABLE evaluation_templates (id TEXT PRIMARY KEY, trainer_account_id TEXT, name TEXT, sport TEXT, description TEXT, created_by TEXT, created_at INTEGER, archived_at INTEGER);
CREATE TABLE evaluation_metrics (id TEXT PRIMARY KEY, template_id TEXT REFERENCES evaluation_templates(id), key TEXT, label TEXT, unit TEXT, better_direction TEXT, protocol TEXT, sort_order INTEGER, archived_at INTEGER, UNIQUE(template_id,key));
CREATE TABLE athletes (id TEXT PRIMARY KEY, trainer_account_id TEXT, first_name TEXT, last_name TEXT, email TEXT, primary_position TEXT, status TEXT);
CREATE TABLE organizations (id TEXT PRIMARY KEY, trainer_account_id TEXT);
CREATE TABLE groups (id TEXT PRIMARY KEY, name TEXT, active INTEGER, organization_id TEXT);
CREATE TABLE evaluation_sessions (id TEXT PRIMARY KEY, template_id TEXT REFERENCES evaluation_templates(id), athlete_id TEXT REFERENCES athletes(id), group_id TEXT, evaluated_at INTEGER, surface TEXT, notes TEXT, created_at INTEGER, archived_at INTEGER);
CREATE TABLE evaluation_results (session_id TEXT REFERENCES evaluation_sessions(id), metric_id TEXT REFERENCES evaluation_metrics(id), value REAL, PRIMARY KEY(session_id,metric_id));
INSERT INTO athletes VALUES ('athlete-a','tenant-a','Ana','Pérez','a@example.com',NULL,'active'),('athlete-b','tenant-b','Bruno','Pérez','b@example.com',NULL,'active');`);
const d1 = {
  prepare(query) {
    return {
      params: [],
      bind(...params) {
        this.params = params;
        return this;
      },
      async first() {
        return sql.prepare(query).get(...this.params) ?? null;
      },
      async all() {
        return { results: sql.prepare(query).all(...this.params) };
      },
      async run() {
        return sql.prepare(query).run(...this.params);
      },
    };
  },
  async batch(statements) {
    sql.exec('BEGIN');
    try {
      const result = [];
      for (const statement of statements) result.push(await statement.run());
      sql.exec('COMMIT');
      return result;
    } catch (error) {
      sql.exec('ROLLBACK');
      throw error;
    }
  },
};
globalThis.__evaluationDb = d1;
globalThis.__evaluationUser = { id: 'coach-a', trainerAccountId: 'tenant-a' };
const authUrl = moduleUrl(
  'export async function getStaffSessionFromRequest(){return globalThis.__evaluationUser;} export function isSameOrigin(request){return request.headers.get("origin") === "http://localhost";}',
);
const dbUrl = moduleUrl(
  'export function getD1(){return globalThis.__evaluationDb;}',
);
const api = await import(
  moduleUrl(
    (
      await readFile(
        new URL('../app/api/evaluations/route.ts', import.meta.url),
        'utf8',
      )
    )
      .replace("'@/db'", JSON.stringify(dbUrl))
      .replace("'@/lib/auth'", JSON.stringify(authUrl))
      .replace("'@/lib/evaluations-validation'", JSON.stringify(helperUrl)),
  )
);
async function post(payload, expected = 200) {
  const response = await api.POST(
    new Request('http://localhost/api/evaluations', {
      method: 'POST',
      headers: {
        origin: 'http://localhost',
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    }),
  );
  const result = await response.json();
  assert.equal(response.status, expected, JSON.stringify(result));
  return result;
}
async function get(query = '', expected = 200) {
  const response = await api.GET(
    new Request(`http://localhost/api/evaluations${query}`),
  );
  const result = await response.json();
  assert.equal(response.status, expected, JSON.stringify(result));
  return result;
}
const { templateId } = await post(
  { action: 'createTemplate', name: 'Resistencia', sport: 'Natación' },
  201,
);
const { metricId } = await post(
  {
    action: 'createMetric',
    templateId,
    label: '100 metros',
    unit: 's',
    betterDirection: 'lower',
    protocol: 'Libre',
  },
  201,
);
const input = {
  action: 'save',
  templateId,
  athleteId: 'athlete-a',
  evaluatedAt: '2026-10-22',
  surface: 'Piscina 25m',
  results: [{ metricId, value: 60 }],
};
const { sessionId } = await post(input, 201);
await post({ ...input, athleteId: 'athlete-b' }, 404);
await post({ ...input, results: [{ metricId, value: '' }] }, 400);
await post({ ...input, evaluatedAt: '2026-02-30' }, 400);
const corrected = await post(
  {
    ...input,
    action: 'updateSession',
    sessionId,
    results: [{ metricId, value: 58 }],
  },
  201,
);
assert.notEqual(corrected.sessionId, sessionId);
assert.equal(
  sql
    .prepare('SELECT value FROM evaluation_results WHERE session_id = ?')
    .get(sessionId).value,
  60,
);
assert.ok(
  sql
    .prepare('SELECT archived_at FROM evaluation_sessions WHERE id = ?')
    .get(sessionId).archived_at,
);
let history = await get(`?templateId=${templateId}`);
assert.equal(history.results.length, 1);
assert.equal(history.results[0].value, 58);
assert.equal(
  (await get(`?templateId=${templateId}&includeArchived=1`)).results.length,
  2,
);
await post({
  action: 'updateMetric',
  templateId,
  metricId,
  label: '100m libre',
  unit: 's',
  betterDirection: 'lower',
  protocol: 'Libre',
});
const version = await post(
  {
    action: 'updateMetric',
    templateId,
    metricId,
    label: '100m libre',
    unit: 'min',
    betterDirection: 'lower',
    protocol: 'Libre',
  },
  201,
);
assert.equal(version.versioned, true);
assert.notEqual(version.metricId, metricId);
assert.equal(
  sql.prepare('SELECT unit FROM evaluation_metrics WHERE id = ?').get(metricId)
    .unit,
  's',
);
history = await get(`?templateId=${templateId}`);
assert.equal(history.metrics.length, 1);
assert.equal(history.historicalMetrics.length, 2);
assert.equal(history.results[0].unit, 's');
globalThis.__evaluationUser = { id: 'coach-b', trainerAccountId: 'tenant-b' };
await get(`?templateId=${templateId}`, 404);
await post({ action: 'archiveTemplate', templateId }, 404);
await post(
  { action: 'archiveSession', templateId, sessionId: corrected.sessionId },
  404,
);
globalThis.__evaluationUser = { id: 'coach-a', trainerAccountId: 'tenant-a' };
await post({
  action: 'archiveSession',
  templateId,
  sessionId: corrected.sessionId,
});
assert.equal((await get(`?templateId=${templateId}`)).results.length, 0);
assert.equal(
  sql.prepare('SELECT COUNT(*) AS count FROM evaluation_results').get().count,
  2,
);
await post({ action: 'archiveTemplate', templateId });
assert.equal((await get(`?templateId=${templateId}`)).templates.length, 0);
assert.equal(
  (await get(`?templateId=${templateId}&includeArchived=1`)).templates.length,
  1,
);
sql.close();
delete globalThis.__evaluationDb;
delete globalThis.__evaluationUser;
console.log(
  'PASS evaluaciones: deporte/superficie libres, validación, corrección y baja conservan resultados, nueva versión semántica y aislamiento tenant.',
);
