import { getD1 } from '@/db';
import { getStaffSessionFromRequest, isSameOrigin } from '@/lib/auth';
import { groupMembershipStatements } from '@/lib/group-memberships';
import { cancellationEndsOn } from '@/lib/routine-schedule';

export const runtime = 'edge';

export async function GET(request: Request) {
  const startedAt = performance.now();
  const user = await getStaffSessionFromRequest(request);
  if (!user?.trainerAccountId)
    return Response.json({ error: 'No autorizado.' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const paginated = ['page', 'pageSize', 'q', 'status', 'group'].some((key) => params.has(key));
  const pageInput = Number(params.get('page') ?? 1);
  const sizeInput = Number(params.get('pageSize') ?? 50);
  const status = params.get('status') ?? 'all';
  const group = (params.get('group') ?? 'all').trim();
  const query = (params.get('q') ?? '').trim();
  if (!Number.isSafeInteger(pageInput) || pageInput < 1 || pageInput > 1000000 || !Number.isSafeInteger(sizeInput) || sizeInput < 1 || !['all', 'active', 'paused'].includes(status) || query.length > 200 || group.length > 140) {
    return Response.json({ error: 'Los filtros o la página no son válidos.' }, { status: 400 });
  }
  const pageSize = Math.min(sizeInput, 100);
  const db = getD1();
  const activeMembership = `SELECT 1 FROM group_memberships gm_filter JOIN groups g_filter ON g_filter.id = gm_filter.group_id JOIN organizations o_filter ON o_filter.id = g_filter.organization_id WHERE gm_filter.athlete_id = a.id AND gm_filter.ended_at IS NULL AND g_filter.active = 1 AND o_filter.trainer_account_id = a.trainer_account_id`;
  const conditions = ["a.status != 'archived'", 'a.trainer_account_id = ?'];
  const bindings: (string | number)[] = [user.trainerAccountId];
  if (status !== 'all') { conditions.push('a.status = ?'); bindings.push(status); }
  if (group === 'none') conditions.push(`NOT EXISTS (${activeMembership})`);
  else if (group !== 'all') { conditions.push(`EXISTS (${activeMembership} AND g_filter.name = ?)`); bindings.push(group); }
  if (query) {
    const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
    conditions.push(`((a.first_name || ' ' || a.last_name || ' ' || a.email || ' ' || COALESCE(a.primary_position, '')) LIKE ? ESCAPE '\\' OR EXISTS (${activeMembership} AND g_filter.name LIKE ? ESCAPE '\\'))`);
    bindings.push(pattern, pattern);
  }
  const where = conditions.join(' AND ');
  try {
    const count = paginated ? await db.prepare(`SELECT COUNT(*) AS total FROM athletes a WHERE ${where}`).bind(...bindings).first<{ total: number }>() : null;
    const total = Number(count?.total ?? 0);
    const page = Math.min(pageInput, Math.max(1, Math.ceil(total / pageSize)));
    const [athletes, summary] = await Promise.all([
      db.prepare(`SELECT a.id, a.first_name AS firstName, a.last_name AS lastName, a.email,
      a.phone, a.birth_date AS birthDate, a.country_code AS countryCode,
      a.primary_position AS primaryPosition, a.primary_context AS primaryContext,
      a.status, a.created_at AS createdAt,
      COALESCE(GROUP_CONCAT(CASE WHEN gm.ended_at IS NULL AND g.active = 1 AND o.trainer_account_id = a.trainer_account_id THEN g.name END, '|||'), '') AS groupNames,
      COUNT(DISTINCT CASE WHEN gm.ended_at IS NULL AND g.active = 1 AND o.trainer_account_id = a.trainer_account_id THEN g.id END) AS groupCount
    FROM athletes a
    LEFT JOIN group_memberships gm ON gm.athlete_id = a.id
    LEFT JOIN groups g ON g.id = gm.group_id
    LEFT JOIN organizations o ON o.id = g.organization_id
    WHERE ${where}
    GROUP BY a.id, a.first_name, a.last_name, a.email, a.primary_position,
      a.phone, a.birth_date, a.country_code, a.primary_context, a.status, a.created_at
    ORDER BY a.last_name COLLATE NOCASE, a.first_name COLLATE NOCASE, a.id ${paginated ? 'LIMIT ? OFFSET ?' : ''}`)
        .bind(...bindings, ...(paginated ? [pageSize, (page - 1) * pageSize] : [])).all(),
      paginated ? db.prepare(`SELECT COALESCE(SUM(CASE WHEN a.status = 'active' THEN 1 ELSE 0 END), 0) AS active, COALESCE(SUM(CASE WHEN a.status = 'paused' THEN 1 ELSE 0 END), 0) AS paused, COALESCE(SUM(CASE WHEN NOT EXISTS (${activeMembership}) THEN 1 ELSE 0 END), 0) AS withoutGroup FROM athletes a WHERE a.status != 'archived' AND a.trainer_account_id = ?`).bind(user.trainerAccountId).first() : null,
    ]);
    return Response.json({ athletes: athletes.results, ...(paginated ? { total, page, pageSize, summary } : {}) }, { headers: { 'Server-Timing': `athletes;dur=${(performance.now() - startedAt).toFixed(1)}`, 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[athletes] list failed', error);
    return Response.json({ error: 'No pudimos cargar los clientes.' }, { status: 500 });
  }
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
      VALUES (?, ?, CASE WHEN (SELECT COUNT(*) FROM athletes WHERE trainer_account_id = ? AND status != 'archived')
        < (SELECT max_athletes FROM trainer_accounts WHERE id = ? AND access_status = 'active')
        THEN ? ELSE NULL END, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        )
        .bind(
          id,
          user.trainerAccountId,
          user.trainerAccountId,
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
        ...groupMembershipStatements(db, {
          athleteId: id,
          groupId: input.groupId,
          trainerAccountId: user.trainerAccountId,
          role: optionalText(input.position),
        }),
      );
    }
    await db.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.toLowerCase().includes('not null')) {
      return Response.json(
        {
          error:
            'El cupo o el grupo cambiaron. Revisá los datos e intentá nuevamente.',
        },
        { status: 409 },
      );
    }
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
    const db = getD1();
    const existing = await db
      .prepare(
        `SELECT email FROM athletes WHERE id = ? AND trainer_account_id = ? AND status != 'archived'`,
      )
      .bind(id, user.trainerAccountId)
      .first<{ email: string }>();
    if (!existing)
      return Response.json(
        { error: 'El deportista ya no está disponible.' },
        { status: 404 },
      );
    const statements = [
      db
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
        ),
    ];
    if (existing.email.trim().toLowerCase() !== email || status === 'paused') {
      statements.push(
        db
          .prepare('DELETE FROM auth_sessions WHERE active_athlete_id = ?')
          .bind(id),
      );
    }
    if (existing.email.trim().toLowerCase() !== email) {
      statements.push(
        db
          .prepare('DELETE FROM athlete_identities WHERE athlete_id = ?')
          .bind(id),
      );
      statements.push(
        db
          .prepare(
            'UPDATE athlete_access_links SET redeemed_at = ? WHERE athlete_id = ? AND redeemed_at IS NULL',
          )
          .bind(Date.now(), id),
      );
    }
    const [result] = await db.batch(statements);
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
        `UPDATE athlete_routine_instances SET status = 'cancelled', ended_on = ?
        WHERE athlete_id = ? AND status IN ('scheduled', 'active', 'completed')`,
      )
      .bind(cancellationEndsOn(new Date(now)), id),
    db
      .prepare(
        `UPDATE athlete_access_links SET redeemed_at = ?
        WHERE athlete_id = ? AND redeemed_at IS NULL`,
      )
      .bind(now, id),
    db
      .prepare('DELETE FROM auth_sessions WHERE active_athlete_id = ?')
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
