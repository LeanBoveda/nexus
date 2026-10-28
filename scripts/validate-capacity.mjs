// Isolated local HTTP/SQLite capacity diagnostic. Never connects to production.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const directory = await mkdtemp(join(tmpdir(), 'nexo-capacity-'));
const optimized = process.argv.includes('--optimized');
const reportPath = optimized
  ? 'outputs/capacity-validation-optimized.json'
  : 'outputs/capacity-validation.json';
const db = new DatabaseSync(join(directory, 'synthetic.sqlite'));
db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
const journal = JSON.parse(
  await readFile('drizzle/meta/_journal.json', 'utf8'),
);
for (const migration of journal.entries)
  db.exec(await readFile(`drizzle/${migration.tag}.sql`, 'utf8'));
const context = new AsyncLocalStorage();
const queries = new Map();
function wrap(sql, params = []) {
  const execute = (kind) => {
    const request = context.getStore();
    if (request && ++request.queries > 50)
      throw new Error('Exceeded diagnostic 50-query/request budget');
    assert.ok(params.length <= 100, 'D1 bound parameter budget');
    const started = performance.now();
    const stmt = db.prepare(sql);
    const result =
      kind === 'all'
        ? stmt.all(...params)
        : kind === 'first'
          ? (stmt.get(...params) ?? null)
          : stmt.run(...params);
    const elapsed = performance.now() - started;
    const row = queries.get(sql) ?? {
      sql,
      count: 0,
      ms: 0,
      maxMs: 0,
      returned: 0,
      params,
    };
    row.count++;
    row.ms += elapsed;
    row.maxMs = Math.max(row.maxMs, elapsed);
    row.returned +=
      kind === 'all' ? result.length : kind === 'first' && result ? 1 : 0;
    queries.set(sql, row);
    return kind === 'all'
      ? { results: result }
      : kind === 'run'
        ? { meta: { changes: result.changes } }
        : result;
  };
  return {
    bind: (...values) => wrap(sql, values),
    first: async () => execute('first'),
    all: async () => execute('all'),
    run: async () => execute('run'),
  };
}
globalThis.__capacityEnv = {
  DB: {
    prepare: wrap,
    batch: async (statements) => {
      db.exec('BEGIN');
      try {
        const output = [];
        for (const stmt of statements) output.push(await stmt.run());
        db.exec('COMMIT');
        return output;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  },
};
const urls = {};
async function load(path) {
  let source = await readFile(
    `${path}.${path.startsWith('components/') ? 'tsx' : 'ts'}`,
    'utf8',
  );
  source = source
    .replace(
      "import { env } from 'cloudflare:workers';",
      'const env=globalThis.__capacityEnv;',
    )
    .replace(
      "import { getD1 } from '@/db';",
      'const getD1=()=>globalThis.__capacityEnv.DB;',
    )
    .replace(
      "import { cookies } from 'next/headers';",
      'const cookies=async()=>({get:()=>undefined});',
    )
    .replace(
      "import { redirect } from 'next/navigation';",
      'const redirect=()=>{throw new Error("unexpected redirect");};',
    );
  for (const [name, url] of Object.entries(urls))
    source = source.replaceAll(`'@/${name}'`, JSON.stringify(url));
  const output = ts
    .transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    })
    .outputText.replaceAll(
      '"react/jsx-runtime"',
      JSON.stringify(
        pathToFileURL(
          createRequire(import.meta.url).resolve('react/jsx-runtime'),
        ).href,
      ),
    );
  urls[path] =
    `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
  return import(urls[path]);
}
await load('lib/platform-admins');
await load('lib/athlete-identities');
const auth = await load('lib/auth');
const schedule = await load('lib/routine-schedule');
const portal = await load('lib/athlete-portal');
const overview = await load('lib/training-overview');
const { TrainingOverviewView } = await load(
  'components/nexo/training-overview',
);
await load('lib/group-memberships');
await load('lib/evaluations-validation');
const progressApi = await load('app/api/athlete/progress/route');
const athleteApi = await load('app/api/athletes/route');
const evaluationApi = await load('app/api/evaluations/route');
const tokens = new Map();
const now = Date.now();
const today = schedule.scheduleDate().dateKey;
const addDays = (day, n) =>
  new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400000)
    .toISOString()
    .slice(0, 10);
const start = addDays(today, -370);
const date = addDays(schedule.scheduleDate().weekKey, 0); // Monday, guaranteed training day.
const content = {
  weekPlans: Array.from({ length: 54 }, (_, i) => ({
    number: String(i + 1),
    pse: '6',
  })),
  sessions: [1, 2, 4, 5].map((weekday) => ({
    id: `day${weekday}`,
    name: `Día ${weekday}`,
    weekday,
    rows: Array.from({ length: 6 }, (_, i) => ({
      id: `ex${i}`,
      name: `Ejercicio ${i}`,
      block: 'A',
      values: Array(54).fill('3x8'),
      rir: Array(54).fill('2'),
    })),
  })),
};
const sqlContent = JSON.stringify(content);
const prep = (sql) => db.prepare(sql);
const accountInsert = prep(
  "INSERT INTO trainer_accounts(id,business_name,slug,contact_email,access_status,subscription_status,max_athletes) VALUES(?,?,?,?,'active','active',75)",
);
const userInsert = prep(
  'INSERT INTO users(id,email,name,role,athlete_id,trainer_account_id,password_configured_at) VALUES(?,?,?,?,?,?,?)',
);
const sessionInsert = prep(
  'INSERT INTO auth_sessions(token_hash,user_id,expires_at,last_seen_at,active_athlete_id) VALUES(?,?,?,?,?)',
);
function session(user, athlete = null) {
  const token = randomBytes(32).toString('hex');
  tokens.set(user, token);
  sessionInsert.run(
    createHash('sha256').update(token).digest('hex'),
    user,
    now + 86400000,
    now,
    athlete,
  );
}
const athleteInsert = prep(
  'INSERT INTO athletes(id,trainer_account_id,first_name,last_name,email) VALUES(?,?,?,?,?)',
);
const logInsert = prep(
  'INSERT INTO workout_logs(id,instance_id,athlete_id,session_key,entry_key,trained_on,completed_at,pse,pain,notes,actual_values,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
);
db.exec('BEGIN');
for (let p = 0; p < 5; p++) {
  const pf = `pf${p}`;
  accountInsert.run(pf, `PF ${p}`, pf, `${pf}@example.test`);
  userInsert.run(pf, `${pf}@example.test`, pf, 'coach', null, pf, now);
  session(pf);
  prep(
    "INSERT INTO organizations(id,trainer_account_id,name,type) VALUES(?,?,?,'club')",
  ).run(pf, pf, `Club ${p}`);
  for (let g = 0; g < 3; g++) {
    const key = `${pf}-g${g}`;
    prep(
      "INSERT INTO groups(id,organization_id,name,sport) VALUES(?,?,?,'General')",
    ).run(key, pf, key);
    prep(
      'INSERT INTO routines(id,trainer_account_id,name,created_by) VALUES(?,?,?,?)',
    ).run(key, pf, key, pf);
    prep(
      'INSERT INTO routine_versions(id,routine_id,version_number,content) VALUES(?,?,1,?)',
    ).run(key, key, sqlContent);
    prep(
      "INSERT INTO routine_assignments(id,routine_version_id,target_type,target_id,starts_on,assigned_by) VALUES(?,?,'group',?,?,?)",
    ).run(key, key, key, start, pf);
  }
  prep(
    "INSERT INTO evaluation_templates(id,trainer_account_id,name,sport,created_by) VALUES(?,?,'Pruebas','General',?)",
  ).run(pf, pf, pf);
  for (let m = 0; m < 5; m++)
    prep(
      "INSERT INTO evaluation_metrics(id,template_id,key,label,unit,better_direction) VALUES(?,?,?,?,'cm','higher')",
    ).run(`${pf}-m${m}`, pf, `m${m}`, `Métrica ${m}`);
  for (let a = 0; a < 75; a++) {
    const id = `${pf}-a${a}`,
      group = `${pf}-g${a % 3}`;
    athleteInsert.run(
      id,
      pf,
      `Alumno ${a}`,
      `Apellido ${a}`,
      `${id}@example.test`,
    );
    userInsert.run(id, `${id}@example.test`, id, 'athlete', id, pf, now);
    prep('INSERT INTO athlete_identities(athlete_id,user_id) VALUES(?,?)').run(
      id,
      id,
    );
    session(id, id);
    prep('INSERT INTO group_memberships(athlete_id,group_id) VALUES(?,?)').run(
      id,
      group,
    );
    prep(
      "INSERT INTO athlete_routine_instances(id,assignment_id,athlete_id,status) VALUES(?,?,?,'active')",
    ).run(id, group, id);
    for (let w = 0; w < 52; w++)
      for (const weekday of [1, 2, 4, 5]) {
        const trained = addDays(
          schedule.scheduleDate(new Date(`${start}T12:00:00Z`)).weekKey,
          w * 7 + weekday - 1,
        );
        logInsert.run(
          `${id}-${w}-${weekday}`,
          id,
          id,
          `date-${trained}-session-day${weekday}`,
          `${id}:${id}:${trained}:day${weekday}`,
          trained,
          Date.parse(`${trained}T15:00:00Z`),
          6,
          0,
          'Registro sintético',
          JSON.stringify({
            completedExerciseIds: content.sessions[0].rows.map((row) => row.id),
          }),
          Date.parse(`${trained}T15:00:00Z`),
        );
      }
    for (let month = 0; month < 12; month++) {
      const es = `${id}-eval${month}`;
      prep(
        "INSERT INTO evaluation_sessions(id,template_id,athlete_id,evaluated_at,surface) VALUES(?,?,?,?,'Gimnasio')",
      ).run(es, pf, id, now - month * 30 * 86400000);
      for (let m = 0; m < 5; m++)
        prep(
          'INSERT INTO evaluation_results(session_id,metric_id,value) VALUES(?,?,?)',
        ).run(es, `${pf}-m${m}`, 50 + month + m);
    }
  }
}
db.exec('COMMIT');
db.exec('ANALYZE');
assert.equal(
  db.prepare('SELECT count(*) AS n FROM workout_logs').get().n,
  78000,
);
console.log(
  'Seed ready: 5 PF / 375 athletes / 78000 logs / 4500 evaluations / 22500 results.',
);
const serverErrors = [];
const requestStats = [];
const server = createServer((incoming, outgoing) =>
  context.run({ queries: 0 }, async () => {
    const started = performance.now();
    try {
      const chunks = [];
      for await (const part of incoming) chunks.push(part);
      const request = new Request(
        `http://127.0.0.1:${server.address().port}${incoming.url}`,
        {
          method: incoming.method,
          headers: incoming.headers,
          ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
        },
      );
      const pathname = new URL(request.url).pathname;
      let response;
      if (pathname === '/progress') response = await progressApi.POST(request);
      else if (pathname === '/athletes')
        response = await athleteApi.GET(request);
      else if (pathname === '/evaluations')
        response = await evaluationApi.GET(request);
      else {
        const user = await auth.getSessionFromRequest(request);
        if (!user)
          response = Response.json({ error: 'No autorizado' }, { status: 401 });
        else if (pathname === '/portal' && user.role === 'athlete')
          response = Response.json(
            await portal.getAthletePortalData(user.athleteId, {
              dateKey: date,
            }),
          );
        else if (pathname === '/overview' && user.role !== 'athlete') {
          const data = await (
            optimized ? overview.getTrainingLoad : overview.getTrainingOverview
          )(user.trainerAccountId, addDays(today, -89), today);
          if (new URL(request.url).searchParams.has('inspect'))
            response = Response.json(data);
          else
            response = new Response(
              renderToStaticMarkup(
                createElement(TrainingOverviewView, {
                  mode: 'carga',
                  data,
                  from: addDays(today, -89),
                  to: today,
                }),
              ),
              { headers: { 'content-type': 'text/html' } },
            );
        } else response = new Response(null, { status: 403 });
      }
      const body = Buffer.from(await response.arrayBuffer());
      requestStats.push({
        pathname,
        ms: performance.now() - started,
        queries: context.getStore().queries,
        bytes: body.length,
        status: response.status,
      });
      outgoing.writeHead(response.status, {
        'content-type':
          response.headers.get('content-type') ?? 'application/json',
      });
      outgoing.end(body);
    } catch (error) {
      serverErrors.push(error.message);
      outgoing.writeHead(500);
      outgoing.end(JSON.stringify({ error: error.message }));
    }
  }),
);
// Keep idle socket expiry from obscuring application measurements while the
// single-process diagnostic is busy rendering. This is not a hosting setting.
server.keepAliveTimeout = 120000;
server.headersTimeout = 130000;
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
async function call(path, user, body) {
  return fetch(origin + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      cookie: `nexo_session=${tokens.get(user) ?? 'invalid'}`,
      origin,
      'content-type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000),
  });
}
const sampleInstance = {
  instanceId: 'pf0-a0',
  content,
  overrides: {},
  startsOn: start,
  name: 'Plan',
  description: '',
};
const routine = portal.resolveRoutineSession(sampleInstance, date);
const payload = (athlete) => ({
  instanceId: athlete,
  dateKey: date,
  sessionKey: routine.sessionKey,
  completedExerciseIds: routine.exercises.map((row) => row.id),
  completed: true,
  pse: 6,
  pain: 0,
  notes: 'Carga sintética',
});
const assertions = [];
try {
  assert.equal((await call('/portal', 'unknown')).status, 401);
  assert.equal((await call('/athletes', 'pf0-a0')).status, 401);
  assert.equal(
    (await call('/progress', 'pf0-a0', payload('pf1-a0'))).status,
    404,
  );
  assert.equal((await call('/evaluations?templateId=pf1', 'pf0')).status, 404);
  const roster = await (
    await call('/athletes?page=1&pageSize=100', 'pf0')
  ).json();
  assert.equal(roster.athletes.length, 75);
  assert.ok(roster.athletes.every((a) => a.id.startsWith('pf0-')));
  const ov = await (await call('/overview?inspect', 'pf0')).json();
  assert.equal(ov.assignments.length, 75);
  if (optimized) {
    assert.equal(ov.entries.length, 50);
    assert.ok(ov.summary.total > 50);
  }
  assert.ok(ov.entries.every((row) => row.athleteId.startsWith('pf0-')));
  const ev = await (await call('/evaluations', 'pf0')).json();
  assert.ok(JSON.stringify(ev).includes('pf0-a0'));
  assert.ok(!JSON.stringify(ev).includes('pf1-a0'));
  const one = await (await call('/portal', 'pf0-a0')).json();
  assert.equal(one.athlete.id, 'pf0-a0');
  assert.ok(one.routine.exercises.length === 6);
  for (let i = 0; i < 3; i++)
    assert.equal(
      (await call('/progress', 'pf0-a0', payload('pf0-a0'))).status,
      200,
    );
  assert.equal(
    db
      .prepare('SELECT count(*) AS n FROM workout_logs WHERE entry_key=?')
      .get(`pf0-a0:pf0-a0:${date}:day1`).n,
    1,
  );
  assertions.push(
    'real session auth, denied unknown/athlete staff access, cross-tenant write/template rejection, roster/overview/evaluation isolation, portal content and idempotent writes',
  );
  requestStats.length = 0;
  queries.clear();
  const runs = [];
  for (const concurrency of [1, 25, 50, 100]) {
    const samples = [],
      errors = [];
    const started = performance.now();
    const count = concurrency === 1 ? 50 : concurrency * 4;
    let cursor = 0;
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (cursor < count) {
          const i = cursor++,
            pf = `pf${i % 5}`,
            athlete = `${pf}-a${Math.floor(i / 5) % 75}`;
          const kind = i % 10;
          const path =
            kind < 5
              ? '/portal'
              : kind < 8
                ? '/progress'
                : kind === 8
                  ? '/athletes?page=1&pageSize=50'
                  : Math.floor(i / 10) % 2
                    ? '/overview'
                    : '/evaluations';
          const begin = performance.now();
          try {
            const response = await call(
              path,
              kind < 8 ? athlete : pf,
              path === '/progress' ? payload(athlete) : undefined,
            );
            const body =
              path === '/overview'
                ? await response.text()
                : await response.json();
            if (!response.ok) errors.push({ status: response.status, path });
            if (path === '/portal') assert.equal(body.athlete.id, athlete);
            if (path === '/overview')
              assert.ok(body.includes('Carga y cumplimiento'));
          } catch (error) {
            errors.push({
              path,
              message: error.message,
              cause: error.cause?.code ?? error.cause?.message,
            });
          }
          samples.push(performance.now() - begin);
        }
      }),
    );
    samples.sort((a, b) => a - b);
    const percentile = (p) =>
      Number(samples[Math.ceil(samples.length * p) - 1].toFixed(2));
    const elapsed = performance.now() - started;
    const result = {
      concurrency,
      requests: count,
      errors: errors.length,
      elapsedMs: Math.round(elapsed),
      requestsPerSecond: Number(((count * 1000) / elapsed).toFixed(1)),
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      p99Ms: percentile(0.99),
      details: errors,
    };
    runs.push(result);
    console.log(JSON.stringify(result));
  }
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal(
    db.prepare('PRAGMA integrity_check').get().integrity_check,
    'ok',
  );
  const backupPath = join(directory, 'restore-check.sqlite');
  db.exec(`VACUUM INTO '${backupPath.replaceAll("'", "''")}'`);
  const restored = new DatabaseSync(backupPath);
  assert.equal(
    restored.prepare('SELECT count(*) AS n FROM workout_logs').get().n,
    db.prepare('SELECT count(*) AS n FROM workout_logs').get().n,
  );
  assert.equal(
    restored.prepare('PRAGMA integrity_check').get().integrity_check,
    'ok',
  );
  restored.close();
  assertions.push(
    'local SQLite backup opened independently; row count and integrity verified (not a production backup test)',
  );
  const paths = [...new Set(requestStats.map((row) => row.pathname))].map(
    (pathname) => {
      const rows = requestStats.filter((row) => row.pathname === pathname),
        times = rows.map((row) => row.ms).sort((a, b) => a - b);
      return {
        pathname,
        count: rows.length,
        p95HandlerMs: Number(
          times[Math.ceil(times.length * 0.95) - 1].toFixed(2),
        ),
        maxQueries: Math.max(...rows.map((row) => row.queries)),
        maxBytes: Math.max(...rows.map((row) => row.bytes)),
      };
    },
  );
  const slowQueries = [...queries.values()]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 12)
    .map((row) => ({
      ...row,
      params: undefined,
      ms: Math.round(row.ms),
      plan: db.prepare(`EXPLAIN QUERY PLAN ${row.sql}`).all(...row.params),
    }));
  const counts = Object.fromEntries(
    [
      'trainer_accounts',
      'athletes',
      'workout_logs',
      'evaluation_sessions',
      'evaluation_results',
    ].map((table) => [
      table,
      db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n,
    ]),
  );
  const report = {
    optimized,
    serverErrors,
    functionalChecksPassed: true,
    loadChecksPassed:
      serverErrors.length === 0 && runs.every((run) => run.errors === 0),
    createdAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      database: 'local SQLite on disk/WAL, real migrations and SQL',
      databaseBytes:
        db.prepare('PRAGMA page_count').get().page_count *
        db.prepare('PRAGMA page_size').get().page_size,
      adapter: 'Node HTTP diagnostic adapter, not Vinext/Cloudflare',
      excluded:
        'browser, full Vinext/RSC rendering and AppShell, internet/edge latency, D1 network/CPU/queue quotas, Gmail, R2 and password-login bursts; real TrainingOverviewView HTML rendering is included',
    },
    counts,
    assertions,
    runs,
    paths,
    slowQueries,
  };
  await mkdir('outputs', { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  if (!report.loadChecksPassed) process.exitCode = 1;
  console.log(
    JSON.stringify(
      {
        counts,
        paths,
        databaseBytes: report.environment.databaseBytes,
        report: reportPath,
      },
      null,
      2,
    ),
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
  db.close();
}
