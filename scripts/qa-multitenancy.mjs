const baseUrl = process.env.NEXO_QA_URL ?? 'http://localhost:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(baseUrl).hostname)) {
  throw new Error('This destructive fixture test only runs on localhost.');
}
const adminEmail = process.env.NEXO_QA_ADMIN_EMAIL;
const adminPassword = process.env.NEXO_QA_ADMIN_PASSWORD;

if (!adminEmail || !adminPassword) {
  throw new Error('Set NEXO_QA_ADMIN_EMAIL and NEXO_QA_ADMIN_PASSWORD.');
}

async function request(path, options = {}, cookie = '') {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...options.headers,
    },
    redirect: 'manual',
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { text };
  }
  return { response, body };
}

async function login(email, password) {
  const result = await request('/api/auth/session', {
    method: 'POST',
    body: JSON.stringify({ action: 'login', email, password }),
  });
  assert(
    result.response.status === 200,
    `Login ${email}: ${result.response.status}`,
  );
  const cookie = result.response.headers.get('set-cookie')?.split(';')[0];
  assert(cookie, `Login ${email}: missing cookie`);
  return cookie;
}

const adminCookie = await login(adminEmail, adminPassword);
const suffix = Date.now().toString(36);
const tenantEmail = `qa.tenant.${suffix}@nexo.local`;
const tenantPassword = 'NexoTenant2026!';
const create = await request(
  '/api/admin/accounts',
  {
    method: 'POST',
    body: JSON.stringify({
      action: 'create',
      businessName: `QA Tenant ${suffix}`,
      ownerName: 'QA Tenant Owner',
      email: tenantEmail,
      password: tenantPassword,
      plan: 'starter',
      subscriptionStatus: 'trialing',
      monthlyPrice: 19000,
      currency: 'ARS',
      maxAthletes: 5,
      periodEndsOn: '2026-12-31',
    }),
  },
  adminCookie,
);
assert(
  create.response.status === 201,
  `Create tenant: ${create.response.status} ${JSON.stringify(create.body)}`,
);

const tenantCookie = await login(tenantEmail, tenantPassword);
const adminAthletes = await request('/api/athletes', {}, adminCookie);
const [athletes, groups, routines] = await Promise.all([
  request('/api/athletes', {}, tenantCookie),
  request('/api/groups', {}, tenantCookie),
  request('/api/routines', {}, tenantCookie),
]);
const forbiddenAdmin = await request('/api/admin/accounts', {}, tenantCookie);
assert(
  athletes.response.status === 200,
  `Tenant athletes: ${athletes.response.status}`,
);
assert(
  forbiddenAdmin.response.status === 401,
  `Trainer reached platform admin API: ${forbiddenAdmin.response.status}`,
);
assert(
  groups.response.status === 200,
  `Tenant groups: ${groups.response.status}`,
);
assert(
  routines.response.status === 200,
  `Tenant routines: ${routines.response.status}`,
);
assert(
  Array.isArray(athletes.body.athletes) && athletes.body.athletes.length === 0,
  'Tenant saw foreign athletes',
);
assert(
  Array.isArray(groups.body.groups) && groups.body.groups.length === 0,
  'Tenant saw foreign groups',
);
assert(
  Array.isArray(routines.body.routines) && routines.body.routines.length === 0,
  'Tenant saw foreign routines',
);

const foreignAthleteId = adminAthletes.body.athletes?.[0]?.id;
if (foreignAthleteId) {
  const foreignAthlete = await request(
    '/api/athletes',
    {
      method: 'PATCH',
      body: JSON.stringify({
        id: foreignAthleteId,
        firstName: 'Intruso',
        lastName: 'QA',
        email: 'intruso@nexo.local',
      }),
    },
    tenantCookie,
  );
  assert(
    foreignAthlete.response.status === 404,
    `Foreign athlete update was not blocked: ${foreignAthlete.response.status}`,
  );
}

const block = await request(
  '/api/admin/accounts',
  {
    method: 'PATCH',
    body: JSON.stringify({
      action: 'update',
      accountId: create.body.accountId,
      plan: 'starter',
      subscriptionStatus: 'past_due',
      accessStatus: 'blocked',
      monthlyPrice: 19000,
      currency: 'ARS',
      maxAthletes: 5,
      periodEndsOn: '2026-12-31',
      notes: 'QA automated test',
    }),
  },
  adminCookie,
);
assert(block.response.status === 200, `Block tenant: ${block.response.status}`);
const denied = await request('/api/athletes', {}, tenantCookie);
assert(
  denied.response.status === 401,
  `Blocked tenant retained access: ${denied.response.status}`,
);

console.log(
  JSON.stringify(
    {
      ok: true,
      accountId: create.body.accountId,
      userId: create.body.userId,
      checks: [
        'admin creates trainer account',
        'tenant sees no foreign athletes',
        'tenant sees no foreign groups',
        'tenant sees no foreign routines',
        'trainer cannot access platform administration',
        foreignAthleteId
          ? 'tenant cannot edit foreign athlete'
          : 'foreign athlete check skipped: admin account has none',
        'blocked tenant loses API access',
      ],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
