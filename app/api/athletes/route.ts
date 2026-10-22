import { getD1 } from '@/db';
import { getStaffSessionFromRequest, isSameOrigin } from '@/lib/auth';

export const runtime = 'edge';

export async function GET(request: Request) {
  const user = await getStaffSessionFromRequest(request);
  if (!user?.trainerAccountId)
    return Response.json({ error: 'No autorizado.' }, { status: 401 });
  const athletes = await getD1()
    .prepare(
      `SELECT a.id, a.first_name AS firstName, a.last_name AS lastName, a.email,
      a.phone, a.birth_date AS birthDate, a.country_code AS countryCode,
      a.primary_position AS primaryPosition, a.primary_context AS primaryContext,
      a.status, a.created_at AS createdAt,
      COALESCE(GROUP_CONCAT(CASE WHEN gm.ended_at IS NULL AND g.active = 1 THEN g.name END, '|||'), '') AS groupNames,
      COUNT(DISTINCT CASE WHEN gm.ended_at IS NULL AND g.active = 1 THEN g.id END) AS groupCount
    FROM athletes a
    LEFT JOIN group_memberships gm ON gm.athlete_id = a.id
    LEFT JOIN groups g ON g.id = gm.group_id
    WHERE a.status != 'archived' AND a.trainer_account_id = ?
    GROUP BY a.id, a.first_name, a.last_name, a.email, a.primary_position,
      a.phone, a.birth_date, a.country_code, a.primary_context, a.status, a.created_at
    ORDER BY a.last_name, a.first_name`,
    )
    .bind(user.trainerAccountId)
    .all();

  return Response.json({ athletes: athletes.results });
}

export async function POST(request: Request) {
  const user = await getStaffSessionFromRequest(request);
  if (!user?.trainerAccountId)
    return Response.json({ error: 'No autorizado.' }, { status: 401 });
  if (!isSameOrigin(request))
    return Response.json({ error: 'Solicitud no permitida.' }, { status: 403 });
  const input = await request.json<{
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    birthDate?: string;
    countryCode?: string;
    primaryContext?: string;
    position?: string;
    groupId?: string;
  }>();

  const firstName = input.firstName?.trim();
  const lastName = input.lastName?.trim();
  const email = input.email?.trim().toLowerCase();

  if (!firstName || !lastName || !email || !email.includes('@')) {
    return Response.json(
      { error: 'Completá nombre, apellido y un email válido.' },
      { status: 400 },
    );
  }

  const db = getD1();
  const id = crypto.randomUUID();

  try {
    const capacity = await db
      .prepare(`SELECT ta.max_athletes AS maxAthletes,
        (SELECT COUNT(*) FROM athletes a
          WHERE a.trainer_account_id = ta.id AND a.status != 'archived') AS athleteCount
        FROM trainer_accounts ta WHERE ta.id = ?`)
      .bind(user.trainerAccountId)
      .first<{ maxAthletes: number; athleteCount: number }>();
    if (
      !capacity ||
      Number(capacity.athleteCount) >= Number(capacity.maxAthletes)
    ) {
      return Response.json(
        { error: 'Alcanzaste el límite de deportistas de tu plan.' },
        { status: 409 },
      );
    }
    if (input.groupId) {
      const allowedGroup = await db
        .prepare(`SELECT g.id FROM groups g JOIN organizations o ON o.id = g.organization_id
          WHERE g.id = ? AND o.trainer_account_id = ? AND g.active = 1`)
        .bind(input.groupId, user.trainerAccountId)
        .first();
      if (!allowedGroup)
        return Response.json(
          { error: 'El grupo no está disponible.' },
          { status: 404 },
        );
    }
    const statements = [
      db
        .prepare(
          `INSERT INTO athletes
        (id, trainer_account_id, first_name, last_name, email, phone, birth_date, country_code,
          primary_position, primary_context, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        )
        .bind(
          id,
          user.trainerAccountId,
          firstName,
          lastName,
          email,
          optionalText(input.phone),
          validDate(input.birthDate),
          countryCode(input.countryCode),
          optionalText(input.position),
          optionalText(input.primaryContext),
          Date.now(),
        ),
    ];
    if (input.groupId) {
      statements.push(
        db
          .prepare(`INSERT INTO group_memberships
        (athlete_id, group_id, role, joined_at, ended_at) VALUES (?, ?, ?, ?, NULL)`)
          .bind(id, input.groupId, input.position ?? null, Date.now()),
      );
    }
    await db.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.toLowerCase().includes('unique')) {
      return Response.json(
        { error: 'Ya existe un deportista con ese email.' },
        { status: 409 },
      );
    }
    return Response.json(
      { error: 'No pudimos guardar el deportista. Intentá nuevamente.' },
      { status: 500 },
    );
  }

  return Response.json(
    { athlete: { id, firstName, lastName, email } },
    { status: 201 },
  );
}

export async function PATCH(request: Request) {
  const user = await getStaffSessionFromRequest(request);
  if (!user?.trainerAccountId)
    return Response.json({ error: 'No autorizado.' }, { status: 401 });
  if (!isSameOrigin(request))
    return Response.json({ error: 'Solicitud no permitida.' }, { status: 403 });
  const input = await request.json<{
    id?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    birthDate?: string;
    countryCode?: string;
    primaryContext?: string;
    position?: string;
    status?: string;
  }>();

  const id = input.id?.trim();
  const firstName = input.firstName?.trim();
  const lastName = input.lastName?.trim();
  const email = input.email?.trim().toLowerCase();
  const status = input.status === 'paused' ? 'paused' : 'active';

  if (!id || !firstName || !lastName || !email || !email.includes('@')) {
    return Response.json(
      { error: 'Completá nombre, apellido y un email válido.' },
      { status: 400 },
    );
  }

  try {
    const result = await getD1()
      .prepare(`UPDATE athletes SET
      first_name = ?, last_name = ?, email = ?, phone = ?, birth_date = ?,
      country_code = ?, primary_position = ?, primary_context = ?, status = ?
      WHERE id = ? AND trainer_account_id = ? AND status != 'archived'`)
      .bind(
        firstName,
        lastName,
        email,
        optionalText(input.phone),
        validDate(input.birthDate),
        countryCode(input.countryCode),
        optionalText(input.position),
        optionalText(input.primaryContext),
        status,
        id,
        user.trainerAccountId,
      )
      .run();
    if (!result.meta.changes)
      return Response.json(
        { error: 'El deportista ya no está disponible.' },
        { status: 404 },
      );
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.toLowerCase().includes('unique')) {
      return Response.json(
        { error: 'Ya existe un deportista con ese email.' },
        { status: 409 },
      );
    }
    return Response.json(
      { error: 'No pudimos actualizar el deportista.' },
      { status: 500 },
    );
  }

  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await getStaffSessionFromRequest(request);
  if (!user?.trainerAccountId)
    return Response.json({ error: 'No autorizado.' }, { status: 401 });
  if (!isSameOrigin(request))
    return Response.json({ error: 'Solicitud no permitida.' }, { status: 403 });
  const input = await request.json<{ id?: string }>();
  const id = input.id?.trim();
  if (!id)
    return Response.json({ error: 'Deportista inválido.' }, { status: 400 });

  const db = getD1();
  const existing = await db
    .prepare(
      "SELECT id FROM athletes WHERE id = ? AND trainer_account_id = ? AND status != 'archived' LIMIT 1",
    )
    .bind(id, user.trainerAccountId)
    .first();
  if (!existing)
    return Response.json(
      { error: 'El deportista ya no está disponible.' },
      { status: 404 },
    );

  const now = Date.now();
  await db.batch([
    db
      .prepare(
        "UPDATE athletes SET status = 'archived' WHERE id = ? AND trainer_account_id = ?",
      )
      .bind(id, user.trainerAccountId),
    db
      .prepare(
        'UPDATE group_memberships SET ended_at = ? WHERE athlete_id = ? AND ended_at IS NULL',
      )
      .bind(now, id),
    db
      .prepare(
        `UPDATE athlete_routine_instances SET status = 'cancelled'
        WHERE athlete_id = ? AND status IN ('scheduled', 'active')`,
      )
      .bind(id),
    db
      .prepare(
        `UPDATE athlete_access_links SET redeemed_at = ?
        WHERE athlete_id = ? AND redeemed_at IS NULL`,
      )
      .bind(now, id),
    db
      .prepare(
        "UPDATE users SET status = 'disabled' WHERE athlete_id = ? AND role = 'athlete'",
      )
      .bind(id),
  ]);
  return Response.json({ ok: true });
}

function optionalText(value?: string) {
  return value?.trim() || null;
}

function countryCode(value?: string) {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

function validDate(value?: string) {
  const normalized = value?.trim();
  return normalized && /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? normalized
    : null;
}
