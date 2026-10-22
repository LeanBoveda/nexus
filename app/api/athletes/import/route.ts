import { getD1 } from '@/db';
import { getStaffSessionFromRequest } from '@/lib/auth';
import { checkImportRows } from '@/lib/athlete-import';

export async function POST(request: Request) {
  const user = await getStaffSessionFromRequest(request);
  if (!user?.trainerAccountId) return Response.json({ error: 'No autorizado.' }, { status: 401 });
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'Solicitud no permitida.' }, { status: 403 });
  const db = getD1();
  try {
    const text = await request.text();
    if (text.length > 500_000) return Response.json({ error: 'La carga supera el tamaño permitido.' }, { status: 413 });
    const input = JSON.parse(text) as { action?: string; rows?: unknown; groupId?: string };
    if (!['preview', 'commit'].includes(input.action ?? '')) throw new Error('Acción inválida.');
    const checked = checkImportRows(input.rows);
    if (input.groupId && typeof input.groupId !== 'string') throw new Error('Grupo inválido.');
    if (input.groupId) {
      const group = await db.prepare(`SELECT g.id FROM groups g JOIN organizations o ON o.id = g.organization_id
        WHERE g.id = ? AND o.trainer_account_id = ? AND g.active = 1`).bind(input.groupId, user.trainerAccountId).first();
      if (!group) return Response.json({ error: 'El grupo no está disponible.' }, { status: 404 });
    }
    // Read only matching email keys; never return another PF's identity or record.
    const emails = checked.map(row => row.data.email);
    const unavailable = new Set<string>();
    for (let i = 0; i < emails.length; i += 80) {
      const part = emails.slice(i, i + 80);
      const existing = await db.prepare(`SELECT lower(email) AS email FROM athletes WHERE lower(email) IN (${part.map(() => '?').join(',')})`).bind(...part).all<{ email: string }>();
      existing.results.forEach(row => unavailable.add(row.email));
    }
    const rows = checkImportRows(input.rows, unavailable);
    const capacity = await db.prepare(`SELECT max_athletes AS maximum,
      (SELECT COUNT(*) FROM athletes WHERE trainer_account_id = ta.id AND status != 'archived') AS used
      FROM trainer_accounts ta WHERE id = ? AND access_status = 'active'`).bind(user.trainerAccountId).first<{ maximum: number; used: number }>();
    if (!capacity) return Response.json({ error: 'Tu cuenta no está habilitada.' }, { status: 403 });
    const available = Math.max(0, capacity.maximum - capacity.used);
    if (input.action === 'preview') return Response.json({ rows, available });
    const valid = rows.filter(row => row.status === 'valid');
    if (valid.length > available) return Response.json({ error: `Tu plan tiene ${available} lugares disponibles. Seleccioná menos alumnos o ampliá tu plan.` }, { status: 409 });
    if (!valid.length) return Response.json({ created: 0, skipped: rows.length });
    const now = Date.now();
    const statements: D1PreparedStatement[] = [];
    for (const { data } of valid) {
      const id = crypto.randomUUID();
      // A failing NOT NULL guard rolls back the entire D1 batch if concurrent
      // writes exhaust capacity or disable the tenant between preview and commit.
      statements.push(db.prepare(`INSERT INTO athletes
        (id, trainer_account_id, first_name, last_name, email, phone, birth_date, country_code, primary_position, primary_context, status, created_at)
        VALUES (?, ?, CASE WHEN (SELECT COUNT(*) FROM athletes WHERE trainer_account_id = ? AND status != 'archived')
          < (SELECT max_athletes FROM trainer_accounts WHERE id = ? AND access_status = 'active') THEN ? ELSE NULL END,
          ?, ?, ?, ?, ?, ?, ?, 'active', ?)`)
        .bind(id, user.trainerAccountId, user.trainerAccountId, user.trainerAccountId, data.firstName, data.lastName, data.email, data.phone || null, data.birthDate || null, data.countryCode || null, data.position || null, data.primaryContext || null, now));
      if (input.groupId) statements.push(db.prepare(`INSERT INTO group_memberships (athlete_id, group_id, role, joined_at)
        VALUES (?, CASE WHEN EXISTS (SELECT g.id FROM groups g JOIN organizations o ON o.id = g.organization_id
        WHERE g.id = ? AND o.trainer_account_id = ? AND g.active = 1) THEN ? ELSE NULL END, ?, ?)`)
        .bind(id, input.groupId, user.trainerAccountId, input.groupId, data.position || null, now));
    }
    try { await db.batch(statements); }
    catch { return Response.json({ error: 'Los datos o el cupo cambiaron durante la importación. Revisá la vista previa e intentá nuevamente. No se guardó ninguna fila de este intento.' }, { status: 409 }); }
    return Response.json({ created: valid.length, skipped: rows.length - valid.length }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof SyntaxError ? 'El archivo no tiene un formato válido.' : error instanceof Error ? error.message : 'No pudimos revisar los alumnos.' }, { status: 400 });
  }
}
