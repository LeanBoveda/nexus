import { getD1 } from '@/db';
import { getStaffSessionFromRequest, isSameOrigin } from '@/lib/auth';
import { groupMembershipStatements } from '@/lib/group-memberships';
import { cancellationEndsOn } from '@/lib/routine-schedule';

export const runtime = 'edge';

type GroupAction = {
  action?: 'create' | 'addMembers' | 'removeMember' | 'archive';
  groupId?: string;
  groupName?: string;
  organizationName?: string;
  organizationType?: string;
  sport?: string;
  season?: string;
  athleteIds?: string[];
  athleteId?: string;
};

export async function GET(request: Request) {
  const user = await getStaffSessionFromRequest(request);
  if (!user?.trainerAccountId)
    return Response.json({ error: 'No autorizado.' }, { status: 401 });
  const db = getD1();
  const groupQuery = db
      .prepare(`SELECT g.id, g.name, g.sport, g.season, g.active,
      o.id AS organizationId, o.name AS organizationName, o.type AS organizationType,
      COUNT(CASE WHEN gm.athlete_id IS NOT NULL AND gm.ended_at IS NULL THEN 1 END) AS memberCount
      FROM groups g
      JOIN organizations o ON o.id = g.organization_id
      LEFT JOIN group_memberships gm ON gm.group_id = g.id
      WHERE g.active = 1 AND o.trainer_account_id = ?
      GROUP BY g.id, g.name, g.sport, g.season, g.active, o.id, o.name, o.type
      ORDER BY o.name, g.name`)
      .bind(user.trainerAccountId)
      .all();
  if (new URL(request.url).searchParams.get('groupsOnly') === '1') {
    const groupResult = await groupQuery;
    return Response.json({ groups: groupResult.results });
  }
  const [groupResult, athleteResult, membershipResult] = await Promise.all([
    groupQuery,
    db
      .prepare(`SELECT id, first_name AS firstName, last_name AS lastName, email,
      primary_position AS primaryPosition, status
      FROM athletes WHERE status = 'active' AND trainer_account_id = ?
      ORDER BY last_name, first_name`)
      .bind(user.trainerAccountId)
      .all(),
    db
      .prepare(`SELECT gm.group_id AS groupId, gm.athlete_id AS athleteId, gm.role,
      a.first_name AS firstName, a.last_name AS lastName, a.email,
      a.primary_position AS primaryPosition
      FROM group_memberships gm
      JOIN athletes a ON a.id = gm.athlete_id
      JOIN groups g ON g.id = gm.group_id
      JOIN organizations o ON o.id = g.organization_id
      WHERE gm.ended_at IS NULL AND a.status = 'active'
        AND a.trainer_account_id = ? AND o.trainer_account_id = ?
      ORDER BY a.last_name, a.first_name`)
      .bind(user.trainerAccountId, user.trainerAccountId)
      .all(),
  ]);

  return Response.json({
    groups: groupResult.results,
    athletes: athleteResult.results,
    memberships: membershipResult.results,
  });
}

export async function POST(request: Request) {
  const user = await getStaffSessionFromRequest(request);
  if (!user?.trainerAccountId)
    return Response.json({ error: 'No autorizado.' }, { status: 401 });
  if (!isSameOrigin(request))
    return Response.json({ error: 'Solicitud no permitida.' }, { status: 403 });
  const input = (await request.json()) as GroupAction;
  const db = getD1();

  try {
    if (input.action === 'create') {
      const groupName = input.groupName?.trim();
      const organizationName = input.organizationName?.trim();
      const organizationType =
        typeof input.organizationType === 'string'
          ? input.organizationType.trim()
          : '';
      const sport = typeof input.sport === 'string' ? input.sport.trim() : '';
      if (
        !groupName ||
        !organizationName ||
        !organizationType ||
        organizationType.length > 100 ||
        !sport ||
        sport.length > 100 ||
        groupName.length > 140 ||
        organizationName.length > 140
      ) {
        return Response.json(
          { error: 'Completá los datos del grupo.' },
          { status: 400 },
        );
      }

      let organization = await db
        .prepare(
          'SELECT id FROM organizations WHERE lower(name) = lower(?) AND trainer_account_id = ? LIMIT 1',
        )
        .bind(organizationName, user.trainerAccountId)
        .first<{ id: string }>();
      const statements: D1PreparedStatement[] = [];
      if (!organization) {
        organization = { id: crypto.randomUUID() };
        statements.push(
          db
            .prepare(`INSERT INTO organizations
          (id, trainer_account_id, name, type, country_code, created_at)
          VALUES (?, ?, ?, ?, 'AR', ?)`)
            .bind(
              organization.id,
              user.trainerAccountId,
              organizationName,
              organizationType,
              Date.now(),
            ),
        );
      }

      const duplicate = await db
        .prepare(
          'SELECT id FROM groups WHERE organization_id = ? AND lower(name) = lower(?) AND active = 1 LIMIT 1',
        )
        .bind(organization.id, groupName)
        .first();
      if (duplicate)
        return Response.json(
          { error: 'Ya existe un grupo con ese nombre en la organización.' },
          { status: 409 },
        );

      const groupId = crypto.randomUUID();
      statements.push(
        db
          .prepare(`INSERT INTO groups
        (id, organization_id, name, sport, season, active, created_at)
        VALUES (?, ?, ?, ?, ?, 1, ?)`)
          .bind(
            groupId,
            organization.id,
            groupName,
            sport,
            input.season?.trim() || null,
            Date.now(),
          ),
      );
      await db.batch(statements);
      return Response.json({ ok: true, groupId }, { status: 201 });
    }

    if (input.action === 'addMembers') {
      const athleteIds = [...new Set(input.athleteIds ?? [])]
        .filter(Boolean)
        .slice(0, 100);
      if (!input.groupId || athleteIds.length === 0)
        return Response.json(
          { error: 'Seleccioná al menos una persona.' },
          { status: 400 },
        );
      const allowedGroup = await db
        .prepare(`SELECT g.id FROM groups g JOIN organizations o ON o.id = g.organization_id
          WHERE g.id = ? AND g.active = 1 AND o.trainer_account_id = ?`)
        .bind(input.groupId, user.trainerAccountId)
        .first();
      const allowedAthletes = await db
        .prepare(`SELECT id FROM athletes WHERE trainer_account_id = ?
          AND status = 'active' AND id IN (${athleteIds.map(() => '?').join(',')})`)
        .bind(user.trainerAccountId, ...athleteIds)
        .all<{ id: string }>();
      if (!allowedGroup || allowedAthletes.results.length !== athleteIds.length)
        return Response.json(
          { error: 'El grupo o algún deportista no está disponible.' },
          { status: 404 },
        );
      const now = Date.now();
      await db.batch(
        athleteIds.flatMap((athleteId) =>
          groupMembershipStatements(db, {
            athleteId,
            groupId: input.groupId!,
            trainerAccountId: user.trainerAccountId!,
            now,
          }),
        ),
      );
      return Response.json({ ok: true });
    }

    if (input.action === 'removeMember') {
      if (!input.groupId || !input.athleteId)
        return Response.json(
          { error: 'Faltan datos para quitar la persona.' },
          { status: 400 },
        );
      const membership = await db
        .prepare(`SELECT gm.athlete_id FROM group_memberships gm
          JOIN athletes a ON a.id = gm.athlete_id
          JOIN groups g ON g.id = gm.group_id
          JOIN organizations o ON o.id = g.organization_id
          WHERE gm.group_id = ? AND gm.athlete_id = ?
            AND a.trainer_account_id = ? AND o.trainer_account_id = ?`)
        .bind(
          input.groupId,
          input.athleteId,
          user.trainerAccountId,
          user.trainerAccountId,
        )
        .first();
      if (!membership)
        return Response.json(
          { error: 'La persona no pertenece a esa cuenta.' },
          { status: 404 },
        );
      await db.batch([
        db
          .prepare(`UPDATE group_memberships SET ended_at = ?
          WHERE group_id = ? AND athlete_id = ? AND ended_at IS NULL`)
          .bind(Date.now(), input.groupId, input.athleteId),
        db
          .prepare(
            `UPDATE athlete_routine_instances SET status = 'cancelled', ended_on = ?
            WHERE athlete_id = ? AND status IN ('scheduled', 'active', 'completed')
              AND assignment_id IN (
                SELECT id FROM routine_assignments
                WHERE target_type = 'group' AND target_id = ?
              )`,
          )
          .bind(cancellationEndsOn(), input.athleteId, input.groupId),
      ]);
      return Response.json({ ok: true });
    }

    if (input.action === 'archive') {
      if (!input.groupId)
        return Response.json({ error: 'Grupo inválido.' }, { status: 400 });
      const ownedGroup = await db
        .prepare(`SELECT g.id FROM groups g JOIN organizations o ON o.id = g.organization_id
          WHERE g.id = ? AND o.trainer_account_id = ?`)
        .bind(input.groupId, user.trainerAccountId)
        .first();
      if (!ownedGroup)
        return Response.json({ error: 'Grupo inválido.' }, { status: 404 });
      await db.batch([
        db
          .prepare('UPDATE groups SET active = 0 WHERE id = ?')
          .bind(input.groupId),
        db
          .prepare(
            `UPDATE athlete_routine_instances SET status = 'cancelled', ended_on = ?
            WHERE status IN ('scheduled', 'active', 'completed') AND assignment_id IN (
              SELECT id FROM routine_assignments
              WHERE target_type = 'group' AND target_id = ?
            )`,
          )
          .bind(cancellationEndsOn(), input.groupId),
      ]);
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Acción no reconocida.' }, { status: 400 });
  } catch (error) {
    console.error('[nexo-groups] Operation failed', {
      action: input.action,
      userId: user.id,
      error,
    });
    return Response.json(
      { error: 'No pudimos guardar los cambios del grupo.' },
      { status: 500 },
    );
  }
}
