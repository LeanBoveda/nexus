import { env } from 'cloudflare:workers';

export const runtime = 'edge';

const createAthletesTable = `
  CREATE TABLE IF NOT EXISTS athletes (
    id TEXT PRIMARY KEY NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    document_fingerprint TEXT,
    birth_date TEXT,
    country_code TEXT,
    primary_position TEXT,
    primary_context TEXT,
    status TEXT DEFAULT 'active' NOT NULL,
    created_at INTEGER DEFAULT (unixepoch() * 1000) NOT NULL
  )
`;

async function ensureStorage() {
  await env.DB.prepare(createAthletesTable).run();
  await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS athletes_email_unique ON athletes (email)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS athletes_status_idx ON athletes (status)').run();
}

export async function GET() {
  await ensureStorage();
  const athletes = await env.DB.prepare(
    `SELECT id, first_name AS firstName, last_name AS lastName, email,
      primary_position AS primaryPosition, primary_context AS primaryContext,
      status, created_at AS createdAt
    FROM athletes ORDER BY created_at DESC LIMIT 200`,
  ).all();

  return Response.json({ athletes: athletes.results });
}

export async function POST(request: Request) {
  const input = await request.json<{
    firstName?: string;
    lastName?: string;
    email?: string;
    position?: string;
    group?: string;
  }>();

  const firstName = input.firstName?.trim();
  const lastName = input.lastName?.trim();
  const email = input.email?.trim().toLowerCase();

  if (!firstName || !lastName || !email || !email.includes('@')) {
    return Response.json({ error: 'Completá nombre, apellido y un email válido.' }, { status: 400 });
  }

  await ensureStorage();
  const id = crypto.randomUUID();

  try {
    await env.DB.prepare(
      `INSERT INTO athletes
        (id, first_name, last_name, email, primary_position, primary_context, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
    )
      .bind(id, firstName, lastName, email, input.position ?? null, input.group ?? null, Date.now())
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.toLowerCase().includes('unique')) {
      return Response.json({ error: 'Ya existe un deportista con ese email.' }, { status: 409 });
    }
    return Response.json({ error: 'No pudimos guardar el deportista. Intentá nuevamente.' }, { status: 500 });
  }

  return Response.json({ athlete: { id, firstName, lastName, email } }, { status: 201 });
}
