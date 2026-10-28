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
for (const entry of journal.entries)
  db.exec(
    await readFile(
      new URL(`../drizzle/${entry.tag}.sql`, import.meta.url),
      'utf8',
    ),
  );
const wrap = (query, params = []) => ({
  bind: (...values) => wrap(query, values),
  first: async () => db.prepare(query).get(...params) ?? null,
  run: async () => ({
    meta: { changes: db.prepare(query).run(...params).changes },
  }),
});
globalThis.__recoveryEnv = {
  DB: { prepare: wrap },
  GMAIL_CLIENT_ID: 'test-client',
  GMAIL_CLIENT_SECRET: 'test-secret',
  GMAIL_SENDER: 'nexo.cuenta.oficial@gmail.com',
  MAIL_ENCRYPTION_KEY: 'a'.repeat(64),
};
const moduleUrl = (source) =>
  'data:text/javascript;base64,' +
  Buffer.from(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  ).toString('base64');
const authUrl = moduleUrl(
  'export class AuthError extends Error{constructor(message,status=400){super(message);this.status=status;}} export async function createSession(){throw new Error("Recovery cannot create sessions");} export async function getPlatformAdminSessionFromRequest(){return null;}',
);
const securityUrl = moduleUrl(
  await readFile(new URL('../lib/email-security.ts', import.meta.url), 'utf8'),
);
const security = await import(securityUrl);
const adminUrl = moduleUrl(
  await readFile(new URL('../lib/platform-admins.ts', import.meta.url), 'utf8'),
);
const identityUrl = moduleUrl(
  'export async function getAthleteContexts(){throw new Error("No app access");} export async function linkVerifiedAthleteProfiles(){throw new Error("No app access");}',
);
const urls = {
  'lib/auth': authUrl,
  'lib/email-security': securityUrl,
  'lib/platform-admins': adminUrl,
  'lib/athlete-identities': identityUrl,
};
async function load(path) {
  let source = (
    await readFile(new URL('../' + path + '.ts', import.meta.url), 'utf8')
  ).replace(
    "import { env } from 'cloudflare:workers';",
    'const env=globalThis.__recoveryEnv;',
  );
  for (const [name, url] of Object.entries(urls))
    source = source.replaceAll(`'@/${name}'`, JSON.stringify(url));
  urls[path] = moduleUrl(source);
  return import(urls[path]);
}
await load('lib/email-login');
const connect = await load('app/api/admin/email/connect/route');
const callback = await load('app/api/admin/email/callback/route');
db.prepare('INSERT INTO email_integration VALUES(?,?,?,?)').run(
  'gmail',
  'nexo.cuenta.oficial@gmail.com',
  await security.seal('previous-refresh', 'a'.repeat(64)),
  Date.now(),
);
assert.equal(
  (
    await connect.GET(
      new Request('https://example.test/api/admin/email/connect'),
    )
  ).status,
  403,
  'Standard admin connect remains protected',
);
let sender = 'nexo.cuenta.oficial@gmail.com',
  verified = true,
  scope = 'openid email https://www.googleapis.com/auth/gmail.send';
globalThis.fetch = async (url) =>
  String(url).includes('userinfo')
    ? Response.json({ email: sender, email_verified: verified })
    : Response.json({
        access_token: 'test-access',
        refresh_token: 'renewed-refresh',
        scope,
      });
const start = async (ip = 'normal') => {
  const r = await connect.GET(
    new Request('https://example.test/api/admin/email/connect?recover=1', {
      headers: { 'cf-connecting-ip': ip },
    }),
  );
  assert.equal(r.status, 302);
  assert.ok(!r.headers.get('set-cookie').includes('nexo_session='));
  const google = new URL(r.headers.get('location'));
  assert.equal(google.hostname, 'accounts.google.com');
  assert.equal(
    google.searchParams.get('login_hint'),
    'nexo.cuenta.oficial@gmail.com',
  );
  return google.searchParams.get('state');
};
const finish = (state, cookie = state) =>
  callback.GET(
    new Request(
      `https://example.test/api/admin/email/callback?state=${state}&code=test-code`,
      { headers: cookie ? { cookie: `nexo_mail_state=${cookie}` } : {} },
    ),
  );
let state = await start();
assert.equal((await finish(state, '')).status, 400, 'Browser cookie required');
sender = 'wrong@example.test';
assert.equal((await finish(state)).status, 400);
assert.equal((await finish(state)).status, 400, 'Failed state cannot replay');
assert.equal(
  await security.unseal(
    db
      .prepare('SELECT encrypted_refresh_token AS token FROM email_integration')
      .get().token,
    'a'.repeat(64),
  ),
  'previous-refresh',
);
sender = 'nexo.cuenta.oficial@gmail.com';
state = await start();
verified = false;
assert.equal((await finish(state)).status, 400);
verified = true;
state = await start();
scope = 'openid email';
assert.equal((await finish(state)).status, 400);
scope = 'openid email https://www.googleapis.com/auth/gmail.send';
state = await start();
const result = await finish(state);
assert.equal(result.status, 303);
assert.match(result.headers.get('location'), /recuperar-correo\?connected=1$/);
assert.ok(!result.headers.get('set-cookie').includes('nexo_session='));
assert.equal(
  await security.unseal(
    db
      .prepare('SELECT encrypted_refresh_token AS token FROM email_integration')
      .get().token,
    'a'.repeat(64),
  ),
  'renewed-refresh',
);
assert.equal((await finish(state)).status, 400);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM auth_sessions').get().n, 0);
assert.equal(
  db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
  0,
  'No account creation or elevation',
);
state = await start('changed');
globalThis.__recoveryEnv.GMAIL_SENDER = 'different@example.test';
assert.equal((await finish(state)).status, 400);
assert.equal(
  (
    await connect.GET(
      new Request('https://example.test/api/admin/email/connect?recover=1'),
    )
  ).status,
  403,
);
globalThis.__recoveryEnv.GMAIL_SENDER = sender;
for (let i = 0; i < 5; i++) await start('limited');
assert.equal(
  (
    await connect.GET(
      new Request('https://example.test/api/admin/email/connect?recover=1', {
        headers: { 'cf-connecting-ip': 'limited' },
      }),
    )
  ).status,
  429,
);
db.exec('DELETE FROM email_integration');
assert.equal(
  (
    await connect.GET(
      new Request('https://example.test/api/admin/email/connect?recover=1'),
    )
  ).status,
  403,
  'Recovery never creates a new integration',
);
db.close();
console.log(
  'PASS Gmail recovery: Google proof of existing sender only, browser binding, one-use state, required scope, rate limit, no account/session access, no initial provisioning. Network mocked.',
);
