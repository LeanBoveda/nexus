// Isolated SQLite tests: no production DB and no real email deliveries.
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
const wrap = (sql, params = []) => ({
  bind: (...values) => wrap(sql, values),
  first: async () => db.prepare(sql).get(...params) ?? null,
  all: async () => ({ results: db.prepare(sql).all(...params) }),
  run: async () => ({
    meta: { changes: db.prepare(sql).run(...params).changes },
  }),
});
globalThis.__emailTestEnv = {
  DB: {
    prepare: wrap,
    batch: async (statements) => Promise.all(statements.map((s) => s.run())),
  },
  GMAIL_CLIENT_ID: 'fixture',
  GMAIL_CLIENT_SECRET: 'fixture',
  GMAIL_SENDER: 'nexo.cuenta.oficial@gmail.com',
  MAIL_ENCRYPTION_KEY: 'a'.repeat(64),
};
function moduleUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`;
}
const securityUrl = moduleUrl(
  await readFile(new URL('../lib/email-security.ts', import.meta.url), 'utf8'),
);
const adminsUrl = moduleUrl(
  await readFile(new URL('../lib/platform-admins.ts', import.meta.url), 'utf8'),
);
const security = await import(securityUrl);
const identitiesUrl = moduleUrl(
  (
    await readFile(
      new URL('../lib/athlete-identities.ts', import.meta.url),
      'utf8',
    )
  ).replace(
    "import { env } from 'cloudflare:workers';",
    'const env = globalThis.__emailTestEnv;',
  ),
);
const authUrl =
  moduleUrl(`export class AuthError extends Error { constructor(message, status=400) { super(message); this.status=status; } }
export async function createSession(id) { return 'test-session-' + id; }
export function sessionCookie(token) { return 'nexo_session=' + token; }`);
const loginUrl = moduleUrl(
  (await readFile(new URL('../lib/email-login.ts', import.meta.url), 'utf8'))
    .replace(
      "import { env } from 'cloudflare:workers';",
      'const env = globalThis.__emailTestEnv;',
    )
    .replace("'@/lib/auth'", JSON.stringify(authUrl))
    .replace("'@/lib/email-security'", JSON.stringify(securityUrl))
    .replace("'@/lib/athlete-identities'", JSON.stringify(identitiesUrl))
    .replace("'@/lib/platform-admins'", JSON.stringify(adminsUrl)),
);
const login = await import(loginUrl);
const api = await import(
  moduleUrl(
    (
      await readFile(
        new URL('../app/api/auth/email/route.ts', import.meta.url),
        'utf8',
      )
    )
      .replace("'@/lib/auth'", JSON.stringify(authUrl))
      .replace("'@/lib/email-login'", JSON.stringify(loginUrl)),
  )
);

const sealed = await security.seal('refresh-fixture', 'a'.repeat(64));
assert.equal(await security.unseal(sealed, 'a'.repeat(64)), 'refresh-fixture');
await assert.rejects(() => security.unseal(sealed, 'b'.repeat(64)));
assert.equal(await login.emailReady(), false);
db.prepare('INSERT INTO email_integration VALUES (?, ?, ?, ?)').run(
  'gmail',
  'nexo.cuenta.oficial@gmail.com',
  sealed,
  Date.now(),
);
assert.equal(await login.emailReady(), true);
db.prepare(
  `INSERT INTO trainer_accounts (id,business_name,slug,contact_email) VALUES ('t1','Fixture','fixture','pf@example.com')`,
).run();
db.prepare(
  `INSERT INTO users (id,trainer_account_id,email,name,role) VALUES ('u1','t1','pf@example.com','PF','coach')`,
).run();
const deliveries = [];
globalThis.fetch = async (url, options) => {
  if (String(url) === 'https://oauth2.googleapis.com/token')
    return Response.json({ access_token: 'fixture' });
  if (
    String(url) ===
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'
  ) {
    const mime = Buffer.from(
      JSON.parse(options.body).raw,
      'base64url',
    ).toString();
    const body = Buffer.from(mime.split('\r\n\r\n')[1], 'base64').toString();
    deliveries.push(body.match(/#token=([a-f0-9]{64})/)[1]);
    return Response.json({ id: 'fixture' });
  }
  throw new Error('Unexpected external request');
};
await login.requestEmailLogin('unknown@example.com', 'ip1');
assert.equal(deliveries.length, 0);
await login.requestEmailLogin('PF@example.com', 'ip1');
const token = deliveries.at(-1);
assert.ok(
  !JSON.stringify(db.prepare('SELECT * FROM email_tokens').all()).includes(
    token,
  ),
);
const redeemed = await Promise.allSettled([
  login.redeemEmailLogin(token),
  login.redeemEmailLogin(token),
]);
assert.equal(redeemed.filter((r) => r.status === 'fulfilled').length, 1);
assert.equal(
  redeemed.find((r) => r.status === 'fulfilled').value.destination,
  '/',
);
await login.requestEmailLogin('pf@example.com', 'ip2');
db.prepare('UPDATE email_tokens SET expires_at = 0 WHERE token_hash = ?').run(
  await security.digest(deliveries.at(-1)),
);
await assert.rejects(() => login.redeemEmailLogin(deliveries.at(-1)), /venció/);
await login.requestEmailLogin('pf@example.com', 'ip3');
db.prepare(
  "UPDATE trainer_accounts SET access_status = 'blocked' WHERE id = 't1'",
).run();
await assert.rejects(
  () => login.redeemEmailLogin(deliveries.at(-1)),
  /habilitada/,
);
await assert.rejects(
  () => login.requestEmailLogin('pf@example.com', 'ip4'),
  /Esperá/,
);
await login.requestEmailLogin('leandroboveda@gmail.com', 'admin-ip');
assert.equal(
  (await login.redeemEmailLogin(deliveries.at(-1))).destination,
  '/admin',
);
assert.equal(
  db
    .prepare(
      "SELECT trainer_account_id FROM users WHERE email = 'leandroboveda@gmail.com'",
    )
    .get().trainer_account_id,
  null,
);
await login.requestEmailLogin(
  'NEXO.CUENTA.OFICIAL@gmail.com',
  'official-admin-ip',
);
assert.equal(
  (await login.redeemEmailLogin(deliveries.at(-1))).destination,
  '/admin',
);
assert.equal(
  db
    .prepare(
      "SELECT is_platform_admin FROM users WHERE email='nexo.cuenta.oficial@gmail.com'",
    )
    .get().is_platform_admin,
  1,
);
const { isPlatformAdminEmail } = await import(adminsUrl);
assert.equal(isPlatformAdminEmail(' NEXO.CUENTA.OFICIAL@gmail.com '), true);
assert.equal(isPlatformAdminEmail('leandroboveda@gmail.com'), true);
assert.equal(
  isPlatformAdminEmail('nexo.cuenta.oficial@gmail.com.evil.test'),
  false,
);
db.prepare(
  "UPDATE trainer_accounts SET access_status = 'active' WHERE id = 't1'",
).run();
db.prepare(
  `INSERT INTO athletes (id,trainer_account_id,first_name,last_name,email) VALUES ('a1','t1','Ana','Test','ana@example.com')`,
).run();
await login.requestEmailLogin('ana@example.com', 'athlete-ip');
assert.equal(
  (await login.redeemEmailLogin(deliveries.at(-1))).destination,
  '/mi-entrenamiento',
);
db.prepare(
  `INSERT INTO trainer_accounts (id,business_name,slug,contact_email) VALUES ('t2','Segundo PF','fixture2','pf2@example.com')`,
).run();
db.prepare(
  `INSERT INTO athletes (id,trainer_account_id,first_name,last_name,email) VALUES ('a2','t2','Ana','Otro PF','ana@example.com')`,
).run();
await login.requestEmailLogin('ana@example.com', 'athlete-ip2');
assert.equal(
  (await login.redeemEmailLogin(deliveries.at(-1))).destination,
  '/mis-profesores',
);
const athleteIdentity = db
  .prepare("SELECT id FROM users WHERE email='ana@example.com'")
  .get().id;
assert.equal(
  db
    .prepare('SELECT COUNT(*) AS count FROM athlete_identities WHERE user_id=?')
    .get(athleteIdentity).count,
  2,
);
const realAuth = await import(
  moduleUrl(
    (await readFile(new URL('../lib/auth.ts', import.meta.url), 'utf8'))
      .replace(
        "import { env } from 'cloudflare:workers';",
        'const env = globalThis.__emailTestEnv;',
      )
      .replace(
        "import { cookies } from 'next/headers';",
        'const cookies = async()=>({get:()=>undefined});',
      )
      .replace(
        "import { redirect } from 'next/navigation';",
        'const redirect = ()=>{throw new Error("redirect");};',
      )
      .replace("'@/lib/athlete-identities'", JSON.stringify(identitiesUrl))
      .replace("'@/lib/platform-admins'", JSON.stringify(adminsUrl)),
  )
);
for (const email of [
  'nexo.cuenta.oficial@gmail.com',
  'leandroboveda@gmail.com',
  'pf@example.com',
]) {
  const user = db.prepare('SELECT id FROM users WHERE email=?').get(email);
  const token = await realAuth.createSession(user.id);
  const request = new Request('https://example.com/api/admin/accounts', {
    headers: { cookie: `nexo_session=${token}` },
  });
  const session = await realAuth.getSessionFromRequest(request);
  assert.equal(session.isPlatformAdmin, email !== 'pf@example.com');
  assert.equal(
    Boolean(await realAuth.getPlatformAdminSessionFromRequest(request)),
    email !== 'pf@example.com',
  );
}
const fullToken = await realAuth.createSession(athleteIdentity);
const fullRequest = new Request('https://example.com/api/athlete/context', {
  headers: { cookie: `nexo_session=${fullToken}` },
});
assert.equal(
  (await realAuth.getSessionFromRequest(fullRequest)).athleteId,
  null,
);
await realAuth.selectAthleteContext(fullRequest, 'a2');
assert.equal(
  (await realAuth.getSessionFromRequest(fullRequest)).trainerAccountId,
  't2',
);
await assert.rejects(
  () => realAuth.selectAthleteContext(fullRequest, 'not-owned'),
  /disponible/,
);
const invite = await realAuth.createAthleteAccessToken('a1', 'u1', 't1');
const scopedToken = await realAuth.redeemAthleteAccessToken(invite);
await assert.rejects(
  () => realAuth.redeemAthleteAccessToken(invite),
  /utilizado/,
);
const scopedRequest = new Request('https://example.com/api/athlete/context', {
  headers: { cookie: `nexo_session=${scopedToken}` },
});
assert.equal(
  (await realAuth.getSessionFromRequest(scopedRequest)).athleteId,
  'a1',
);
await assert.rejects(
  () => realAuth.selectAthleteContext(scopedRequest, 'a2'),
  /disponible/,
);
db.prepare(
  "UPDATE athletes SET email='changed@example.com' WHERE id='a1'",
).run();
assert.equal(await realAuth.getSessionFromRequest(scopedRequest), null);
assert.equal(
  (await realAuth.getSessionFromRequest(fullRequest)).athleteId,
  'a2',
);
console.log(
  'PASS: real auth/session/context logic, multi-PF mailbox identity, isolated profile switching, scoped PF invitation cannot reach another PF, one-use invitation, changed-email revocation.',
);
const denied = await api.POST(
  new Request('https://example.com/api/auth/email', {
    method: 'POST',
    headers: { origin: 'https://attacker.example' },
    body: '{}',
  }),
);
assert.equal(denied.status, 403);
const callback = await import(
  moduleUrl(
    (
      await readFile(
        new URL('../app/api/admin/email/callback/route.ts', import.meta.url),
        'utf8',
      )
    )
      .replace(
        "import { env } from 'cloudflare:workers';",
        'const env = globalThis.__emailTestEnv;',
      )
      .replace("'@/lib/email-security'", JSON.stringify(securityUrl))
      .replace("'@/lib/email-login'", JSON.stringify(loginUrl)),
  )
);
const state = security.randomSecret();
db.prepare(
  'INSERT INTO email_tokens (token_hash,kind,subject,expires_at) VALUES (?,?,?,?)',
).run(await security.digest(state), 'oauth', 'admin', Date.now() + 60_000);
const callbackUrl = `https://example.com/api/admin/email/callback?state=${state}&code=fixture`;
assert.equal((await callback.GET(new Request(callbackUrl))).status, 400);
let sender = 'wrong@example.com';
globalThis.fetch = async (url) =>
  String(url).includes('userinfo')
    ? Response.json({ email: sender, email_verified: true })
    : Response.json({
        access_token: 'fixture',
        refresh_token: 'refresh-new',
        scope: 'openid email https://www.googleapis.com/auth/gmail.send',
      });
const callbackRequest = () =>
  new Request(callbackUrl, { headers: { cookie: `nexo_mail_state=${state}` } });
assert.equal((await callback.GET(callbackRequest())).status, 400);
assert.equal(
  await security.unseal(
    db
      .prepare('SELECT encrypted_refresh_token AS token FROM email_integration')
      .get().token,
    'a'.repeat(64),
  ),
  'refresh-fixture',
);
db.prepare('UPDATE email_tokens SET used_at = NULL WHERE token_hash = ?').run(
  await security.digest(state),
);
sender = 'nexo.cuenta.oficial@gmail.com';
assert.equal((await callback.GET(callbackRequest())).status, 303);
assert.equal((await callback.GET(callbackRequest())).status, 400);
console.log(
  'PASS: OAuth browser-state binding, wrong sender rejection, correct sender grant, callback replay rejection.',
);
console.log(
  'PASS: fresh migrations, encrypted credentials, readiness, unknown email, hashed tokens, atomic one-use, expiry, blocked tenant, rate limit, admin bootstrap, athlete access, CSRF. All network calls mocked.',
);
db.close();
