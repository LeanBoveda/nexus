import { scheduleDate } from '@/lib/routine-schedule';

/** Statements deliberately run inside the caller's D1 batch with the athlete insert. */
export function groupMembershipStatements(
  db: D1Database,
  input: {
    athleteId: string;
    groupId: string;
    trainerAccountId: string;
    role?: string | null;
    now?: number;
  },
): D1PreparedStatement[] {
  const {
    athleteId,
    groupId,
    trainerAccountId,
    role = null,
    now = Date.now(),
  } = input;
  const today = scheduleDate(new Date(now)).dateKey;
  return [
    db
      .prepare(`INSERT INTO group_memberships (athlete_id, group_id, role, joined_at, ended_at)
      VALUES (?, CASE WHEN EXISTS (
        SELECT 1 FROM groups g JOIN organizations o ON o.id = g.organization_id
        JOIN athletes a ON a.id = ?
        WHERE g.id = ? AND g.active = 1 AND o.trainer_account_id = ?
          AND a.trainer_account_id = o.trainer_account_id AND a.status = 'active'
      ) THEN ? ELSE NULL END, ?, ?, NULL)
      ON CONFLICT(athlete_id, group_id) DO UPDATE SET
        joined_at = CASE WHEN group_memberships.ended_at IS NOT NULL THEN excluded.joined_at ELSE group_memberships.joined_at END,
        ended_at = NULL`)
      .bind(
        athleteId,
        athleteId,
        groupId,
        trainerAccountId,
        groupId,
        role,
        now,
      ),
    db
      .prepare(`INSERT INTO athlete_routine_instances
      (id, assignment_id, athlete_id, overrides, status, created_at)
      SELECT lower(hex(randomblob(16))), ra.id, ?, NULL,
        CASE WHEN ra.starts_on <= ? THEN 'active' ELSE 'scheduled' END, ?
      FROM routine_assignments ra
      JOIN routine_versions rv ON rv.id = ra.routine_version_id
      JOIN routines r ON r.id = rv.routine_id
      WHERE ra.target_type = 'group' AND ra.target_id = ? AND r.status = 'published'
        AND r.trainer_account_id = ? AND (ra.ends_on IS NULL OR ra.ends_on >= ?)
      ON CONFLICT(assignment_id, athlete_id) DO UPDATE SET
        ended_on = CASE WHEN athlete_routine_instances.status = 'cancelled' THEN NULL ELSE athlete_routine_instances.ended_on END,
        status = CASE WHEN athlete_routine_instances.status = 'cancelled' THEN excluded.status ELSE athlete_routine_instances.status END`)
      .bind(athleteId, today, now, groupId, trainerAccountId, today),
  ];
}
