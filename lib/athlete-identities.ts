import { env } from 'cloudflare:workers';

export type AthleteContext = {
  athleteId: string;
  trainerAccountId: string;
  businessName: string;
  firstName: string;
  lastName: string;
};

// Existing, verified single-profile identities retain their relationship.
export async function linkLegacyAthleteIdentity(userId: string) {
  await env.DB.prepare(`INSERT OR IGNORE INTO athlete_identities (athlete_id, user_id, created_at)
    SELECT a.id, u.id, ? FROM users u JOIN athletes a ON a.id = u.athlete_id
    WHERE u.id = ? AND u.role = 'athlete' AND lower(trim(a.email)) = lower(trim(u.email))`)
    .bind(Date.now(), userId)
    .run();
}

// Call only after proving mailbox ownership (email token or PF's personal link).
export async function linkVerifiedAthleteProfiles(
  userId: string,
  email: string,
) {
  await linkLegacyAthleteIdentity(userId);
  await env.DB.prepare(`INSERT OR IGNORE INTO athlete_identities (athlete_id, user_id, created_at)
    SELECT a.id, ?, ? FROM athletes a JOIN trainer_accounts ta ON ta.id = a.trainer_account_id
    WHERE lower(trim(a.email)) = ? AND a.status = 'active' AND ta.access_status = 'active'`)
    .bind(userId, Date.now(), email.trim().toLowerCase())
    .run();
}

export async function getAthleteContexts(
  userId: string,
  scopedAthleteId: string | null = null,
) {
  return (
    await env.DB.prepare(`SELECT a.id AS athleteId, a.trainer_account_id AS trainerAccountId,
    ta.business_name AS businessName, a.first_name AS firstName, a.last_name AS lastName
    FROM athlete_identities ai JOIN users u ON u.id = ai.user_id
    JOIN athletes a ON a.id = ai.athlete_id JOIN trainer_accounts ta ON ta.id = a.trainer_account_id
    WHERE ai.user_id = ? AND u.role = 'athlete' AND u.status = 'active'
      AND lower(trim(a.email)) = lower(trim(u.email)) AND a.status = 'active' AND ta.access_status = 'active'
      AND (? IS NULL OR a.id = ?)
    ORDER BY ta.business_name, a.first_name, a.id`)
      .bind(userId, scopedAthleteId, scopedAthleteId)
      .all<AthleteContext>()
  ).results;
}
