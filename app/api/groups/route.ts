import { getD1 } from '@/db';
import { getSessionFromRequest, isSameOrigin } from '@/lib/auth';

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
  if (!await getSessionFromRequest(request)) return Response.json({ error: 'No autorizado.' }, { status: 401 });
  const db = getD1();
  const [groupResult, athleteResult, membershipResult] = await Promise.all([
    db.prepare(`SELECT g.id, g.name, g.sport, g.season, g.active,
      o.id AS organizationId, o.name AS organizationName, o.type AS organizationType,
      COUNT(CASE WHEN gm.ended_at IS NULL THEN 1 END) AS memberCount
      FROM groups g
      JOIN organizations o ON o.id = g.organization_id
      LEFT JOIN group_memberships gm ON gm.group_id = g.id
      WHERE g.active = 1
      GROUP BY g.id, g.name, g.sport, g.season, g.active, o.id, o.name, o.type
      ORDER BY o.name, g.name`).all(),
    db.prepare(`SELECT id, first_name AS firstName, last_name AS lastName, email,
      primary_position AS primaryPosition, status
      FROM athletes WHERE status = 'active' ORDER BY last_name, first_name`).all(),
    db.prepare(`SELECT gm.group_id AS groupId, gm.athlete_id AS athleteId, gm.role,
      a.first_name AS firstName, a.last_name AS lastName, a.email,
      a.primary_position AS primaryPosition
      FROM group_memberships gm
      JOIN athletes a ON a.id = gm.athlete_id
      WHERE gm.ended_at IS NULL AND a.status = 'active'
      ORDER BY a.last_name, a.first_name`).all(),
  ]);

  return Response.json({
    groups: groupResult.results,
    athletes: athleteResult.results,
    memberships: membershipResult.results,
  });
}

export async function POST(request: Request) {
  const user = await getSessionFromRequest(request);
  if (!user) return Response.json({ error: 'No autorizado.' }, { status: 401 });
  if (!isSameOrigin(request)) return Response.json({ error: 'Solicitud no permitida.' }, { status: 403 });
  const input = await request.json() as GroupAction;
  const db = getD1();

  try {
    if (input.action === 'create') {
      const groupName = input.groupName?.trim();
      const organizationName = input.organizationName?.trim();
      const organizationTypes = ['national_team', 'club', 'gym', 'independent'];
      const sports = ['handball_indoor', 'beach_handball', 'general'];
      if (!groupName || !organizationName || !organizationTypes.includes(input.organizationType ?? '') || !sports.includes(input.sport ?? '')) {
        return Response.json({ error: 'Completá los datos del grupo.' }, { status: 400 });
      }

      let organization = await db.prepare('SELECT id FROM organizations WHERE lower(name) = lower(?) LIMIT 1')
        .bind(organizationName)
        .first<{ id: string }>();
      const statements: D1PreparedStatement[] = [];
      if (!organization) {
        organization = { id: crypto.randomUUID() };
        statements.push(db.prepare(`INSERT INTO organizations
          (id, name, type, country_code, created_at) VALUES (?, ?, ?, 'AR', ?)`)
          .bind(organization.id, organizationName, input.organizationType, Date.now()));
      }

      const duplicate = await db.prepare('SELECT id FROM groups WHERE organization_id = ? AND lower(name) = lower(?) AND active = 1 LIMIT 1')
        .bind(organization.id, groupName)
        .first();
      if (duplicate) return Response.json({ error: 'Ya existe un grupo con ese nombre en la organización.' }, { status: 409 });

      const groupId = crypto.randomUUID();
      statements.push(db.prepare(`INSERT INTO groups
        (id, organization_id, name, sport, season, active, created_at)
        VALUES (?, ?, ?, ?, ?, 1, ?)`)
        .bind(groupId, organization.id, groupName, input.sport, input.season?.trim() || null, Date.now()));
      await db.batch(statements);
      return Response.json({ ok: true, groupId }, { status: 201 });
    }

    if (input.action === 'addMembers') {
      const athleteIds = [...new Set(input.athleteIds ?? [])].filter(Boolean).slice(0, 100);
      if (!input.groupId || athleteIds.length === 0) return Response.json({ error: 'Seleccioná al menos una persona.' }, { status: 400 });
      await db.batch(athleteIds.map((athleteId) => db.prepare(`INSERT INTO group_memberships
        (athlete_id, group_id, role, joined_at, ended_at) VALUES (?, ?, NULL, ?, NULL)
        ON CONFLICT(athlete_id, group_id) DO UPDATE SET ended_at = NULL`)
        .bind(athleteId, input.groupId, Date.now())));
      return Response.json({ ok: true });
    }

    if (input.action === 'removeMember') {
      if (!input.groupId || !input.athleteId) return Response.json({ error: 'Faltan datos para quitar la persona.' }, { status: 400 });
      await db.prepare(`UPDATE group_memberships SET ended_at = ?
        WHERE group_id = ? AND athlete_id = ? AND ended_at IS NULL`)
        .bind(Date.now(), input.groupId, input.athleteId)
        .run();
      return Response.json({ ok: true });
    }

    if (input.action === 'archive') {
      if (!input.groupId) return Response.json({ error: 'Grupo inválido.' }, { status: 400 });
      await db.prepare('UPDATE groups SET active = 0 WHERE id = ?').bind(input.groupId).run();
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Acción no reconocida.' }, { status: 400 });
  } catch (error) {
    console.error('[nexo-groups] Operation failed', { action: input.action, userId: user.id, error });
    return Response.json({ error: 'No pudimos guardar los cambios del grupo.' }, { status: 500 });
  }
}
