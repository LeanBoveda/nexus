import { getD1 } from '@/db';
import { getSessionFromRequest } from '@/lib/auth';

export const runtime = 'edge';

export async function GET(request: Request) {
  if (!await getSessionFromRequest(request)) return Response.json({ error: 'No autorizado.' }, { status: 401 });
  const athletes = await getD1().prepare(
    `SELECT id, first_name AS firstName, last_name AS lastName, email,
      primary_position AS primaryPosition, primary_context AS primaryContext,
      status, created_at AS createdAt
    FROM athletes ORDER BY created_at DESC LIMIT 200`,
  ).all();

  return Response.json({ athletes: athletes.results });
}

export async function POST(request: Request) {
  if (!await getSessionFromRequest(request)) return Response.json({ error: 'No autorizado.' }, { status: 401 });
  const input = await request.json<{
    firstName?: string;
    lastName?: string;
    email?: string;
    position?: string;
    groupId?: string;
  }>();

  const firstName = input.firstName?.trim();
  const lastName = input.lastName?.trim();
  const email = input.email?.trim().toLowerCase();

  if (!firstName || !lastName || !email || !email.includes('@')) {
    return Response.json({ error: 'Completá nombre, apellido y un email válido.' }, { status: 400 });
  }

  const db = getD1();
  const id = crypto.randomUUID();

  try {
    const statements = [db.prepare(
      `INSERT INTO athletes
        (id, first_name, last_name, email, primary_position, primary_context, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
    )
      .bind(id, firstName, lastName, email, input.position ?? null, null, Date.now())];
    if (input.groupId) {
      statements.push(db.prepare(`INSERT INTO group_memberships
        (athlete_id, group_id, role, joined_at, ended_at) VALUES (?, ?, ?, ?, NULL)`)
        .bind(id, input.groupId, input.position ?? null, Date.now()));
    }
    await db.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.toLowerCase().includes('unique')) {
      return Response.json({ error: 'Ya existe un deportista con ese email.' }, { status: 409 });
    }
    return Response.json({ error: 'No pudimos guardar el deportista. Intentá nuevamente.' }, { status: 500 });
  }

  return Response.json({ athlete: { id, firstName, lastName, email } }, { status: 201 });
}
