// In-memory authorization/delivery tests. No real emails or production data.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

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
function prepare(sql, params = []) {
  return {
    bind: (...values) => prepare(sql, values),
    first: async () => db.prepare(sql).get(...params) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...params) }),
  };
}
globalThis.__adminOnboarding = {
  admin: false,
  sameOrigin: true,
  sent: [],
  delivery: 'sent',
  prepare,
};
function url(source) {
  return `data:text/javascript;base64,${Buffer.from(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  ).toString('base64')}`;
}
const auth = url(`export class AuthError extends Error {};
export async function getPlatformAdminSessionFromRequest() { return globalThis.__adminOnboarding.admin; }
export function isSameOrigin() { return globalThis.__adminOnboarding.sameOrigin; }`);
const database = url(
  'export function getD1() { return { prepare: globalThis.__adminOnboarding.prepare }; }',
);
const email = url(`export async function emailReady() { return true; }
export async function requestEmailLogin(email) { globalThis.__adminOnboarding.sent.push(email); return {delivery: globalThis.__adminOnboarding.delivery}; }`);
const source = await readFile(
  new URL('../app/api/admin/email/route.ts', import.meta.url),
  'utf8',
);
const api = await import(
  url(
    source
      .replace("'@/db'", JSON.stringify(database))
      .replace("'@/lib/auth'", JSON.stringify(auth))
      .replace("'@/lib/email-login'", JSON.stringify(email)),
  )
);
const state = globalThis.__adminOnboarding;
const request = (value) =>
  new Request('https://nexo.example/api/admin/email', {
    method: 'POST',
    body: JSON.stringify({ email: value }),
    headers: { 'content-type': 'application/json' },
  });
assert.equal(
  (await api.GET(new Request('https://nexo.example/api/admin/email'))).status,
  401,
);
assert.equal((await api.POST(request('pf@example.com'))).status, 401);
state.admin = true;
state.sameOrigin = false;
assert.equal((await api.POST(request('pf@example.com'))).status, 403);
state.sameOrigin = true;
assert.equal((await api.POST(request('unknown@example.com'))).status, 409);
assert.equal((await api.POST(request('invalid'))).status, 400);
db.exec(`INSERT INTO trainer_accounts(id,business_name,slug,contact_email) VALUES('tenant','PF','fixture','pf@example.com');
INSERT INTO users(id,email,name,role,trainer_account_id) VALUES('pf','pf@example.com','PF','coach','tenant');
INSERT INTO users(id,email,name,role,trainer_account_id) VALUES('athlete','athlete@example.com','Alumno','athlete','tenant');`);
assert.equal((await api.POST(request('athlete@example.com'))).status, 409);
assert.deepEqual(state.sent, []);
assert.equal((await api.POST(request(' PF@example.com '))).status, 200);
assert.deepEqual(state.sent, ['pf@example.com']);
state.delivery = 'not_sent';
assert.equal((await api.POST(request('pf@example.com'))).status, 502);
db.exec(
  "UPDATE trainer_accounts SET access_status='blocked' WHERE id='tenant'",
);
assert.equal((await api.POST(request('pf@example.com'))).status, 409);
db.prepare(
  'INSERT INTO email_delivery_events(id,recipient_hash,status,error_code,created_at) VALUES(?,?,?,?,?)',
).run('event', 'opaque-hash', 'failed', 'gmail_authorization', Date.now());
const health = await api.GET(
  new Request('https://nexo.example/api/admin/email'),
);
assert.equal(health.status, 200);
const body = await health.json();
assert.equal(body.configured, true);
assert.equal(body.failures.count, 1);
assert.equal(body.events[0].recipientHash, 'opaque-hash');
assert.ok(!JSON.stringify(body).includes('@example.com'));
const ui = await readFile(
  new URL('../components/nexo/business-admin.tsx', import.meta.url),
  'utf8',
);
assert.ok(!/temporaryPassword|form\.password|Clave temporal/.test(ui));
console.log(
  'Admin onboarding: autorización, origen, destinatarios elegibles, bloqueo, fallos y privacidad OK. Sin envíos reales.',
);
db.close();
