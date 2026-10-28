import { getD1 } from '@/db';
import { getStaffSessionFromRequest } from '@/lib/auth';

export async function GET(request: Request) {
  const user = await getStaffSessionFromRequest(request);
  if (!user?.trainerAccountId)
    return Response.json({ error: 'No autorizado.' }, { status: 401 });
  // All saved versions retain the PF's vocabulary, including archived routines.
  const result = await getD1()
    .prepare(`
    SELECT DISTINCT trim(json_extract(entry.value, '$.name')) AS name
    FROM routine_versions rv
    JOIN routines r ON r.id = rv.routine_id,
    json_each(CASE WHEN json_valid(rv.content) THEN rv.content ELSE '{}' END, '$.sessions') session,
    json_each(session.value, '$.rows') entry
    WHERE r.trainer_account_id = ? AND json_type(entry.value, '$.name') = 'text'
    UNION
    SELECT DISTINCT trim(json_extract(entry.value, '$.name')) AS name
    FROM routine_versions rv
    JOIN routines r ON r.id = rv.routine_id,
    json_each(CASE WHEN json_valid(rv.content) THEN rv.content ELSE '{}' END, '$.rows') entry
    WHERE r.trainer_account_id = ? AND json_type(entry.value, '$.name') = 'text'
    ORDER BY name
  `)
    .bind(user.trainerAccountId, user.trainerAccountId)
    .all<{ name: string }>();
  return Response.json(
    {
      names: result.results
        .map((row) => row.name)
        .filter((name) => name && name.toLowerCase() !== 'nuevo ejercicio'),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
