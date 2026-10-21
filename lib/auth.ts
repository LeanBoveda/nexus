import { env } from 'cloudflare:workers';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const SESSION_COOKIE = 'nexo_session';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 7;
const ATHLETE_ACCESS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const PLATFORM_ADMIN_EMAIL = 'leandroboveda@gmail.com';

export type NexoUser = {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'coach' | 'athlete';
  athleteId: string | null;
  trainerAccountId: string | null;
  isPlatformAdmin: boolean;
  accountAccessStatus: 'active' | 'paused' | 'blocked' | null;
};

export async function getAuthStatus() {
  const owner = await env.DB.prepare(
    "SELECT id FROM users WHERE role = 'owner' AND status = 'active' LIMIT 1",
  ).first();
  return { setupRequired: !owner };
}

export async function getSession(): Promise<NexoUser | null> {
  const cookieStore = await cookies();
  return getSessionByToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function getSessionFromRequest(
  request: Request,
): Promise<NexoUser | null> {
  return getSessionByToken(
    readCookie(request.headers.get('cookie'), SESSION_COOKIE),
  );
}

export async function getStaffSessionFromRequest(
  request: Request,
): Promise<NexoUser | null> {
  const user = await getSessionFromRequest(request);
  return user && user.role !== 'athlete' && user.trainerAccountId ? user : null;
}

export async function getPlatformAdminSessionFromRequest(
  request: Request,
): Promise<NexoUser | null> {
  const user = await getSessionFromRequest(request);
  return user?.isPlatformAdmin ? user : null;
}

export async function requireSession() {
  const user = await getSession();
  if (!user) redirect('/login');
  return user;
}

export async function requirePlatformAdmin() {
  const user = await requireSession();
  if (!user.isPlatformAdmin) redirect('/');
  return user;
}

export async function createOwner(input: {
  name: string;
  email: string;
  password: string;
  activationCode: string;
}) {
  if (!env.NEXO_BOOTSTRAP_CODE)
    throw new AuthError(
      'El código de activación todavía no está configurado.',
      503,
    );
  if (!(await secureTextEqual(input.activationCode, env.NEXO_BOOTSTRAP_CODE)))
    throw new AuthError('El código de activación no es válido.', 401);

  const existingOwner = await env.DB.prepare(
    "SELECT id FROM users WHERE role = 'owner' LIMIT 1",
  ).first();
  if (existingOwner)
    throw new AuthError('La cuenta principal ya fue creada.', 409);

  const email = normalizeEmail(input.email);
  validateCredentials(input.name, email, input.password);
  const { salt, hash } = await hashPassword(input.password);
  const id = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const token = randomToken(32);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO trainer_accounts
      (id, business_name, slug, owner_user_id, contact_email, country_code,
       access_status, subscription_status, plan, monthly_price_cents, currency,
       max_athletes, trial_ends_at, current_period_ends_at, notes, updated_at, created_at)
      VALUES (?, ?, ?, ?, ?, 'AR', 'active', 'trialing', 'starter', 0, 'ARS',
       30, ?, NULL, NULL, ?, ?)`).bind(
      accountId,
      input.name.trim(),
      `cuenta-${accountId.slice(0, 8)}`,
      id,
      email,
      now + 14 * 24 * 60 * 60 * 1000,
      now,
      now,
    ),
    env.DB.prepare(`INSERT INTO users
      (id, trainer_account_id, email, name, role, password_salt, password_hash,
       status, is_platform_admin, created_at)
      VALUES (?, ?, ?, ?, 'owner', ?, ?, 'active', ?, ?)`).bind(
      id,
      accountId,
      email,
      input.name.trim(),
      salt,
      hash,
      email === PLATFORM_ADMIN_EMAIL ? 1 : 0,
      now,
    ),
    env.DB.prepare(`INSERT INTO auth_sessions
      (token_hash, user_id, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)`).bind(
      await sha256(token),
      id,
      now + SESSION_DURATION_MS,
      now,
      now,
    ),
  ]);

  return token;
}

export async function authenticate(input: {
  email: string;
  password: string;
  ip: string;
}) {
  await initializeLegacyAccount();
  const email = normalizeEmail(input.email);
  const rateKey = await sha256(`${input.ip}|${email}`);
  await assertLoginAllowed(rateKey);

  const user =
    await env.DB.prepare(`SELECT u.id, u.password_salt AS passwordSalt,
    u.password_hash AS passwordHash, u.trainer_account_id AS trainerAccountId,
    ta.access_status AS accountAccessStatus
    FROM users u LEFT JOIN trainer_accounts ta ON ta.id = u.trainer_account_id
    WHERE u.email = ? AND u.status = 'active' LIMIT 1`)
      .bind(email)
      .first<{
        id: string;
        passwordSalt: string | null;
        passwordHash: string | null;
        trainerAccountId: string | null;
        accountAccessStatus: string | null;
      }>();

  const valid = Boolean(
    user?.passwordSalt &&
    user.passwordHash &&
    (await verifyPassword(
      input.password,
      user.passwordSalt,
      user.passwordHash,
    )),
  );
  if (!valid || !user) {
    await recordFailedLogin(rateKey);
    throw new AuthError('Email o contraseña incorrectos.', 401);
  }
  if (user.trainerAccountId && user.accountAccessStatus !== 'active') {
    throw new AuthError(
      'Tu cuenta está pausada. Contactá al administrador de Nexo.',
      403,
    );
  }

  await env.DB.prepare('DELETE FROM login_attempts WHERE key = ?')
    .bind(rateKey)
    .run();
  return createSession(user.id);
}

export async function createAthleteAccessToken(
  athleteId: string,
  createdBy: string,
  trainerAccountId: string | null,
) {
  if (!trainerAccountId) throw new AuthError('No autorizado.', 401);
  await ensureAthleteAccessTable();
  const athlete = await env.DB.prepare(`SELECT id FROM athletes
    WHERE id = ? AND status = 'active'
      AND trainer_account_id = ? LIMIT 1`)
    .bind(athleteId, trainerAccountId)
    .first<{ id: string }>();
  if (!athlete) throw new AuthError('El deportista no está disponible.', 404);

  const token = randomToken(32);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`UPDATE athlete_access_links SET redeemed_at = ?
      WHERE athlete_id = ? AND redeemed_at IS NULL`).bind(now, athleteId),
    env.DB.prepare(`INSERT INTO athlete_access_links
      (id, athlete_id, token_hash, expires_at, redeemed_at, created_by, created_at)
      VALUES (?, ?, ?, ?, NULL, ?, ?)`).bind(
      crypto.randomUUID(),
      athleteId,
      await sha256(token),
      now + ATHLETE_ACCESS_DURATION_MS,
      createdBy,
      now,
    ),
  ]);
  return token;
}

export async function redeemAthleteAccessToken(token: string) {
  await ensureAthleteAccessTable();
  if (!token || token.length < 32)
    throw new AuthError('El enlace no es válido.', 401);
  const now = Date.now();
  const link = await env.DB.prepare(`SELECT l.id, a.id AS athleteId, a.email,
    a.first_name AS firstName, a.last_name AS lastName,
    a.trainer_account_id AS trainerAccountId
    FROM athlete_access_links l
    JOIN athletes a ON a.id = l.athlete_id
    LEFT JOIN trainer_accounts ta ON ta.id = a.trainer_account_id
    WHERE l.token_hash = ? AND l.redeemed_at IS NULL AND l.expires_at > ?
      AND a.status = 'active'
      AND (ta.id IS NULL OR ta.access_status = 'active') LIMIT 1`)
    .bind(await sha256(token), now)
    .first<{
      id: string;
      athleteId: string;
      email: string;
      firstName: string;
      lastName: string;
      trainerAccountId: string | null;
    }>();
  if (!link) throw new AuthError('El enlace venció o ya fue utilizado.', 401);

  const account = await env.DB.prepare(
    'SELECT trainer_account_id AS trainerAccountId FROM athletes WHERE id = ?',
  )
    .bind(link.athleteId)
    .first<{ trainerAccountId: string | null }>();
  const byAthlete =
    await env.DB.prepare(`SELECT id, role, athlete_id AS athleteId
    FROM users WHERE athlete_id = ? LIMIT 1`)
      .bind(link.athleteId)
      .first<{ id: string; role: string; athleteId: string | null }>();
  const byEmail = byAthlete
    ? null
    : await env.DB.prepare(`SELECT id, role, athlete_id AS athleteId
        FROM users WHERE lower(email) = lower(?) LIMIT 1`)
        .bind(link.email)
        .first<{ id: string; role: string; athleteId: string | null }>();
  const existing = byAthlete ?? byEmail;
  if (existing && existing.role !== 'athlete') {
    throw new AuthError(
      'Ese email pertenece a una cuenta de preparador físico.',
      409,
    );
  }
  if (existing?.athleteId && existing.athleteId !== link.athleteId) {
    throw new AuthError('La cuenta ya está vinculada a otro deportista.', 409);
  }

  const userId = existing?.id ?? crypto.randomUUID();
  const sessionToken = randomToken(32);
  const statements: D1PreparedStatement[] = [];
  if (existing) {
    statements.push(
      env.DB.prepare(`UPDATE users SET athlete_id = ?, trainer_account_id = ?, status = 'active'
        WHERE id = ? AND role = 'athlete'`).bind(
        link.athleteId,
        account?.trainerAccountId ?? null,
        userId,
      ),
    );
  } else {
    statements.push(
      env.DB.prepare(`INSERT INTO users
        (id, trainer_account_id, email, name, role, password_salt, password_hash,
         athlete_id, status, is_platform_admin, created_at)
        VALUES (?, ?, ?, ?, 'athlete', NULL, NULL, ?, 'active', 0, ?)`).bind(
        userId,
        account?.trainerAccountId ?? null,
        link.email.trim().toLowerCase(),
        `${link.firstName} ${link.lastName}`.trim(),
        link.athleteId,
        now,
      ),
    );
  }
  statements.push(
    env.DB.prepare(`UPDATE athlete_access_links SET redeemed_at = ?
      WHERE id = ? AND redeemed_at IS NULL`).bind(now, link.id),
    env.DB.prepare(`INSERT INTO auth_sessions
      (token_hash, user_id, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)`).bind(
      await sha256(sessionToken),
      userId,
      now + SESSION_DURATION_MS,
      now,
      now,
    ),
  );
  await env.DB.batch(statements);
  return sessionToken;
}

export async function destroySession(request: Request) {
  const token = readCookie(request.headers.get('cookie'), SESSION_COOKIE);
  if (token)
    await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash = ?')
      .bind(await sha256(token))
      .run();
}

export function sessionCookie(token: string) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DURATION_MS / 1000}`;
}

export function expiredSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function createSession(userId: string) {
  const token = randomToken(32);
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO auth_sessions
    (token_hash, user_id, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(await sha256(token), userId, now + SESSION_DURATION_MS, now, now)
    .run();
  return token;
}

async function getSessionByToken(token?: string): Promise<NexoUser | null> {
  if (!token) return null;
  await initializeLegacyAccount();
  const now = Date.now();
  const tokenHash = await sha256(token);
  const result = await env.DB.prepare(`SELECT u.id, u.email, u.name, u.role,
    u.athlete_id AS athleteId, u.trainer_account_id AS trainerAccountId,
    u.is_platform_admin AS isPlatformAdmin,
    ta.access_status AS accountAccessStatus,
    s.expires_at AS expiresAt, s.last_seen_at AS lastSeenAt
    FROM auth_sessions s JOIN users u ON u.id = s.user_id
    LEFT JOIN trainer_accounts ta ON ta.id = u.trainer_account_id
    WHERE s.token_hash = ? AND u.status = 'active' LIMIT 1`)
    .bind(tokenHash)
    .first<NexoUser & { expiresAt: number; lastSeenAt: number }>();
  if (
    !result ||
    result.expiresAt <= now ||
    (result.trainerAccountId && result.accountAccessStatus !== 'active')
  ) {
    await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash = ?')
      .bind(tokenHash)
      .run();
    return null;
  }
  if (now - result.lastSeenAt >= SESSION_TOUCH_INTERVAL_MS) {
    await env.DB.prepare(
      'UPDATE auth_sessions SET last_seen_at = ? WHERE token_hash = ?',
    )
      .bind(now, tokenHash)
      .run();
  }
  return {
    id: result.id,
    email: result.email,
    name: result.name,
    role: result.role,
    athleteId: result.athleteId,
    trainerAccountId: result.trainerAccountId,
    isPlatformAdmin:
      result.role !== 'athlete' &&
      normalizeEmail(result.email) === PLATFORM_ADMIN_EMAIL,
    accountAccessStatus: result.accountAccessStatus,
  };
}

// Bounded, idempotent data migration. Schema migrations remain schema-only.
// New PF accounts are always created with an account ID and never enter this path.
async function initializeLegacyAccount() {
  const owner =
    await env.DB.prepare(`SELECT id, name, email, created_at AS createdAt
    FROM users WHERE role = 'owner' AND trainer_account_id IS NULL
    ORDER BY created_at, id LIMIT 1`).first<{
      id: string;
      name: string;
      email: string;
      createdAt: number;
    }>();
  if (!owner) return;
  const accountId = 'legacy-main-account';
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO trainer_accounts
      (id, business_name, slug, owner_user_id, contact_email, access_status,
       subscription_status, plan, max_athletes, created_at, updated_at)
      VALUES (?, ?, 'cuenta-principal', ?, ?, 'active', 'active', 'team', 500, ?, ?)`).bind(
      accountId,
      owner.name,
      owner.id,
      owner.email,
      owner.createdAt,
      now,
    ),
    ...[
      'organizations',
      'athletes',
      'routines',
      'evaluation_templates',
      'files',
      'users',
    ].map((table) =>
      env.DB.prepare(
        `UPDATE ${table} SET trainer_account_id = ? WHERE trainer_account_id IS NULL`,
      ).bind(accountId),
    ),
  ]);
}

export async function createManagedTrainerAccount(input: {
  businessName: string;
  ownerName: string;
  email: string;
  password: string;
  plan: 'starter' | 'pro' | 'team';
  subscriptionStatus: 'trialing' | 'active' | 'past_due' | 'canceled';
  monthlyPriceCents: number;
  currency: 'ARS' | 'USD';
  maxAthletes: number;
  periodEndsAt: number | null;
}) {
  const email = normalizeEmail(input.email);
  validateCredentials(input.ownerName, email, input.password);
  const duplicate = await env.DB.prepare(
    'SELECT id FROM users WHERE lower(email) = lower(?) LIMIT 1',
  )
    .bind(email)
    .first();
  if (duplicate)
    throw new AuthError('Ya existe una cuenta con ese email.', 409);

  const { salt, hash } = await hashPassword(input.password);
  const accountId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const now = Date.now();
  const slugBase = slugify(input.businessName) || `pf-${accountId.slice(0, 8)}`;
  const slug = `${slugBase}-${accountId.slice(0, 6)}`;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO trainer_accounts
      (id, business_name, slug, owner_user_id, contact_email, country_code,
       access_status, subscription_status, plan, monthly_price_cents, currency,
       max_athletes, trial_ends_at, current_period_ends_at, notes, updated_at, created_at)
      VALUES (?, ?, ?, ?, ?, 'AR', 'active', ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`).bind(
      accountId,
      input.businessName.trim(),
      slug,
      userId,
      email,
      input.subscriptionStatus,
      input.plan,
      input.monthlyPriceCents,
      input.currency,
      input.maxAthletes,
      input.subscriptionStatus === 'trialing' ? input.periodEndsAt : null,
      input.periodEndsAt,
      now,
      now,
    ),
    env.DB.prepare(`INSERT INTO users
      (id, trainer_account_id, email, name, role, password_salt, password_hash,
       athlete_id, status, is_platform_admin, created_at)
      VALUES (?, ?, ?, ?, 'owner', ?, ?, NULL, 'active', 0, ?)`).bind(
      userId,
      accountId,
      email,
      input.ownerName.trim(),
      salt,
      hash,
      now,
    ),
  ]);
  return { accountId, userId, slug };
}

async function assertLoginAllowed(key: string) {
  const now = Date.now();
  const attempt = await env.DB.prepare(
    'SELECT blocked_until AS blockedUntil FROM login_attempts WHERE key = ?',
  )
    .bind(key)
    .first<{ blockedUntil: number | null }>();
  if (attempt?.blockedUntil && attempt.blockedUntil > now) {
    throw new AuthError(
      'Demasiados intentos. Esperá unos minutos antes de volver a probar.',
      429,
    );
  }
}

async function recordFailedLogin(key: string) {
  const now = Date.now();
  const current = await env.DB.prepare(
    'SELECT attempt_count AS count, window_started_at AS startedAt FROM login_attempts WHERE key = ?',
  )
    .bind(key)
    .first<{ count: number; startedAt: number }>();
  const inWindow = current && now - current.startedAt < LOGIN_WINDOW_MS;
  const count = inWindow ? current.count + 1 : 1;
  const startedAt = inWindow ? current.startedAt : now;
  const blockedUntil =
    count >= MAX_LOGIN_ATTEMPTS ? now + LOGIN_WINDOW_MS : null;
  await env.DB.prepare(`INSERT INTO login_attempts (key, attempt_count, window_started_at, blocked_until)
    VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET
    attempt_count = excluded.attempt_count,
    window_started_at = excluded.window_started_at,
    blocked_until = excluded.blocked_until`)
    .bind(key, count, startedAt, blockedUntil)
    .run();
}

function validateCredentials(name: string, email: string, password: string) {
  if (name.trim().length < 2)
    throw new AuthError('Ingresá tu nombre completo.');
  if (!email.includes('@')) throw new AuthError('Ingresá un email válido.');
  if (password.length < 10)
    throw new AuthError('La contraseña debe tener al menos 10 caracteres.');
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

async function hashPassword(password: string) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  return {
    salt: toBase64Url(saltBytes),
    hash: await derivePasswordHash(password, saltBytes),
  };
}

async function verifyPassword(
  password: string,
  salt: string,
  expected: string,
) {
  const actual = await derivePasswordHash(password, fromBase64Url(salt));
  return secureTextEqual(actual, expected);
}

async function derivePasswordHash(password: string, salt: Uint8Array) {
  const pepperedPassword = `${password}\u0000${env.NEXO_PASSWORD_PEPPER ?? ''}`;
  const saltBuffer = Uint8Array.from(salt).buffer;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pepperedPassword),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBuffer, iterations: 100_000 },
    key,
    256,
  );
  return toBase64Url(new Uint8Array(bits));
}

async function secureTextEqual(left: string, right: string) {
  const [leftHash, rightHash] = await Promise.all([
    sha256(left),
    sha256(right),
  ]);
  let difference = leftHash.length ^ rightHash.length;
  for (
    let index = 0;
    index < Math.min(leftHash.length, rightHash.length);
    index += 1
  )
    difference |= leftHash.charCodeAt(index) ^ rightHash.charCodeAt(index);
  return difference === 0;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function randomToken(size: number) {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(size)));
}

function toBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function fromBase64Url(value: string) {
  const padded =
    value.replaceAll('-', '+').replaceAll('_', '/') +
    '='.repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function readCookie(header: string | null, name: string) {
  if (!header) return undefined;
  for (const entry of header.split(';')) {
    const [key, ...value] = entry.trim().split('=');
    if (key === name) return value.join('=');
  }
  return undefined;
}

async function ensureAthleteAccessTable() {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS athlete_access_links (
      id text PRIMARY KEY NOT NULL,
      athlete_id text NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
      token_hash text NOT NULL,
      expires_at integer NOT NULL,
      redeemed_at integer,
      created_by text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at integer NOT NULL
    )`),
    env.DB
      .prepare(`CREATE UNIQUE INDEX IF NOT EXISTS athlete_access_links_token_unique
      ON athlete_access_links (token_hash)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS athlete_access_links_athlete_idx
      ON athlete_access_links (athlete_id)`),
  ]);
}
