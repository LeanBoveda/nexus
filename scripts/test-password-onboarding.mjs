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
  all: async () => ({ results: db.prepare(query).all(...params) }),
  run: async () => ({
    meta: { changes: db.prepare(query).run(...params).changes },
  }),
});
globalThis.__passwordEnv = {
  DB: {
    prepare: wrap,
    batch: async (statements) => {
      db.exec('BEGIN');
      try {
        const output = [];
        for (const statement of statements) output.push(await statement.run());
        db.exec('COMMIT');
        return output;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  },
  GMAIL_CLIENT_ID: 'test',
  GMAIL_CLIENT_SECRET: 'test',
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
const urls = {};
async function load(path) {
  let source = await readFile(
    new URL('../' + path + '.ts', import.meta.url),
    'utf8',
  );
  source = source
    .replace(
      "import { env } from 'cloudflare:workers';",
      'const env=globalThis.__passwordEnv;',
    )
    .replace(
      "import { cookies } from 'next/headers';",
      'const cookies=async()=>({get:()=>undefined});',
    )
    .replace(
      "import { redirect } from 'next/navigation';",
      'const redirect=()=>{throw new Error("redirect");};',
    );
  for (const [name, url] of Object.entries(urls))
    source = source.replaceAll(`'@/${name}'`, JSON.stringify(url));
  urls[path] = moduleUrl(source);
  return import(urls[path]);
}
await load('lib/platform-admins');
const security = await load('lib/email-security');
await load('lib/athlete-identities');
const auth = await load('lib/auth');
const mail = await load('lib/email-login');
const api = await load('app/api/auth/password/route');
const sessionApi = await load('app/api/auth/session/route');
db.prepare('INSERT INTO email_integration VALUES (?,?,?,?)').run(
  'gmail',
  'nexo.cuenta.oficial@gmail.com',
  await security.seal('test-refresh', 'a'.repeat(64)),
  Date.now(),
);
db.exec(
  "INSERT INTO trainer_accounts(id,business_name,slug,contact_email) VALUES ('t1','PF','pf','pf@example.test'),('t2','PF2','pf2','pf2@example.test'); INSERT INTO users(id,trainer_account_id,email,name,role) VALUES ('pf','t1','pf@example.test','PF','coach');",
);
const deliveries = [];
globalThis.fetch = async (url, options) => {
  if (String(url) === 'https://oauth2.googleapis.com/token')
    return Response.json({ access_token: 'test-access' });
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
    return Response.json({ id: 'test-message' });
  }
  throw new Error('Unexpected external request');
};
const request = (path, token, body, origin = 'https://example.test') =>
  new Request('https://example.test' + path, {
    method: 'POST',
    headers: {
      origin,
      'content-type': 'application/json',
      ...(token ? { cookie: `nexo_session=${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
const legacyRoute = await load('app/acceso/[token]/route');
const legacyRedirect = await legacyRoute.GET(
  new Request('https://example.test/acceso/some-token'),
);
assert.equal(legacyRedirect.headers.get('set-cookie'), null);
assert.equal(
  legacyRedirect.headers.get('location'),
  'https://example.test/login?first=1',
);
await mail.requestEmailLogin('pf@example.test', 'first');
const firstLink = deliveries.at(-1);
const setup = await mail.redeemEmailLogin(firstLink);
assert.equal(setup.destination, '/crear-contrasena');
const setupRequest = request('/api/auth/password', setup.token, {});
assert.equal(
  await auth.getSessionFromRequest(setupRequest),
  null,
  'Setup grant cannot access application APIs',
);
assert.equal(await auth.getPlatformAdminSessionFromRequest(setupRequest), null);
assert.equal((await auth.getPasswordSetupSession(setupRequest)).id, 'pf');
const legacyToken = await auth.createSession('pf');
await assert.rejects(
  () =>
    auth.configureFirstPassword(
      request('/api/auth/password', legacyToken, {}),
      'Nueva6',
      'Nueva6',
    ),
  /venció/,
  'Existing session alone is not mailbox verification',
);
assert.equal(
  (
    await api.POST(
      request(
        '/api/auth/password',
        setup.token,
        { password: 'Nueva6', confirmation: 'Nueva6' },
        'https://other.test',
      ),
    )
  ).status,
  403,
);
assert.equal(
  (
    await api.POST(
      request('/api/auth/password', setup.token, {
        password: 'corta',
        confirmation: 'corta',
      }),
    )
  ).status,
  400,
);
assert.equal(
  (
    await api.POST(
      request('/api/auth/password', setup.token, {
        password: 'Nueva6',
        confirmation: 'Otra-segura-123',
      }),
    )
  ).status,
  400,
);
await mail.requestEmailLogin('pf@example.test', 'second');
const secondLink = deliveries.at(-1);
const another = await mail.redeemEmailLogin(secondLink);
const results = await Promise.allSettled([
  auth.configureFirstPassword(
    setupRequest,
    'Nueva6',
    'Nueva6',
  ),
  auth.configureFirstPassword(
    request('/api/auth/password', another.token, {}),
    'Otra66',
    'Otra66',
  ),
]);
assert.equal(
  results.filter((r) => r.status === 'fulfilled').length,
  1,
  'Only one concurrent setup can win',
);
const configured = results.find((r) => r.status === 'fulfilled').value;
assert.equal(configured.destination, '/');
assert.equal(await auth.getSessionFromRequest(setupRequest), null);
assert.equal(
  await auth.getSessionFromRequest(request('/', legacyToken, {})),
  null,
  'Previous sessions revoked',
);
const stored = db
  .prepare(
    "SELECT password_salt,password_hash,password_configured_at FROM users WHERE id='pf'",
  )
  .get();
assert.ok(stored.password_salt && stored.password_configured_at);
assert.notEqual(stored.password_hash, 'Nueva6');
const winningPassword =
  results[0].status === 'fulfilled' ? 'Nueva6' : 'Otra66';
const login = await sessionApi.POST(
  request('/api/auth/session', null, {
    action: 'login',
    email: 'PF@example.test',
    password: winningPassword,
  }),
);
assert.equal(
  login.status,
  200,
  'Password login works even while email service is configured',
);
assert.ok(login.headers.get('set-cookie').includes('HttpOnly'));
assert.equal((await login.json()).destination, '/');
const sent = deliveries.length;
assert.equal(
  (await mail.requestEmailLogin('pf@example.test', 'after')).delivery,
  'not_sent',
);
assert.equal(
  deliveries.length,
  sent,
  'No magic login after password configured',
);
await assert.rejects(() => mail.redeemEmailLogin(firstLink), /venció/);
assert.equal(
  (
    await sessionApi.POST(
      request('/api/auth/session', null, {
        email: 'pf@example.test',
        password: 'Incorrecta-123',
      }),
    )
  ).status,
  401,
);
db.exec(
  "INSERT INTO athletes(id,trainer_account_id,first_name,last_name,email) VALUES ('a1','t1','Ana','PF1','ana@example.test'),('a2','t2','Ana','PF2','ana@example.test');",
);
await mail.requestEmailLogin('ana@example.test', 'athlete');
const athleteSetup = await mail.redeemEmailLogin(deliveries.at(-1));
const athleteResult = await api.POST(
  request('/api/auth/password', athleteSetup.token, {
    password: 'Deportista-123',
    confirmation: 'Deportista-123',
  }),
);
assert.equal(athleteResult.status, 200);
assert.equal((await athleteResult.json()).destination, '/mis-profesores');
const athleteLogin = await auth.authenticate({
  email: 'ana@example.test',
  password: 'Deportista-123',
  ip: 'athlete',
});
const athleteUser = await auth.getSessionFromRequest(
  request('/', athleteLogin, {}),
);
assert.equal(athleteUser.role, 'athlete');
assert.equal(athleteUser.isPlatformAdmin, false);
await mail.requestEmailLogin('nexo.cuenta.oficial@gmail.com', 'admin');
const adminSetup = await mail.redeemEmailLogin(deliveries.at(-1));
assert.equal(
  await auth.getPlatformAdminSessionFromRequest(
    request('/', adminSetup.token, {}),
  ),
  null,
  'Even admin setup is restricted',
);
const adminConfigured = await auth.configureFirstPassword(
  request('/', adminSetup.token, {}),
  'Administrador-123',
  'Administrador-123',
);
assert.equal(adminConfigured.destination, '/admin');
assert.ok(
  await auth.getPlatformAdminSessionFromRequest(
    request('/', adminConfigured.token, {}),
  ),
);
const expired = await auth.createSession('pf', null, null, true);
db.prepare('UPDATE auth_sessions SET expires_at=0 WHERE token_hash=?').run(
  await security.digest(expired),
);
await assert.rejects(
  () =>
    auth.configureFirstPassword(
      request('/', expired, {}),
      'No-puede-123',
      'No-puede-123',
    ),
  /venció/,
);
db.close();
console.log(
  'PASS onboarding: real email verification → restricted setup → hashed password → password login; concurrent one-use, CSRF, expiry, revocation, multi-PF and admin routing. No real email.',
);
