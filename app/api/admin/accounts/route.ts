import { getD1 } from '@/db';
import {
  AuthError,
  createManagedTrainerAccount,
  getPlatformAdminSessionFromRequest,
  isSameOrigin,
} from '@/lib/auth';

export const runtime = 'edge';

type AccountInput = {
  action?: 'create' | 'update';
  accountId?: string;
  businessName?: string;
  ownerName?: string;
  email?: string;
  plan?: 'starter' | 'pro' | 'team';
  subscriptionStatus?: 'trialing' | 'active' | 'past_due' | 'canceled';
  accessStatus?: 'active' | 'paused' | 'blocked';
  monthlyPrice?: number | string;
  currency?: 'ARS' | 'USD';
  maxAthletes?: number | string;
  periodEndsOn?: string;
  notes?: string;
};

const plans = new Set(['starter', 'pro', 'team']);
const subscriptions = new Set(['trialing', 'active', 'past_due', 'canceled']);
const accessStatuses = new Set(['active', 'paused', 'blocked']);

export async function GET(request: Request) {
  const admin = await getPlatformAdminSessionFromRequest(request);
  if (!admin)
    return Response.json({ error: 'No autorizado.' }, { status: 401 });

  const db = getD1();
  const [accounts, activity] = await Promise.all([
    db
      .prepare(`SELECT ta.id, ta.business_name AS businessName, ta.slug,
      ta.contact_email AS contactEmail, ta.access_status AS accessStatus,
      ta.subscription_status AS subscriptionStatus, ta.plan,
      ta.monthly_price_cents AS monthlyPriceCents, ta.currency,
      ta.max_athletes AS maxAthletes, ta.trial_ends_at AS trialEndsAt,
      ta.current_period_ends_at AS currentPeriodEndsAt, ta.notes,
      ta.created_at AS createdAt, ta.updated_at AS updatedAt,
      u.name AS ownerName, u.status AS ownerStatus,
      (SELECT COUNT(*) FROM athletes a
        WHERE a.trainer_account_id = ta.id AND a.status != 'archived') AS athleteCount,
      (SELECT COUNT(*) FROM groups g JOIN organizations o ON o.id = g.organization_id
        WHERE o.trainer_account_id = ta.id AND g.active = 1) AS groupCount,
      (SELECT COUNT(*) FROM routines r
        WHERE r.trainer_account_id = ta.id AND r.status != 'archived') AS routineCount,
      (SELECT COUNT(*) FROM workout_logs wl JOIN athletes a ON a.id = wl.athlete_id
        WHERE a.trainer_account_id = ta.id
          AND wl.completed_at >= (unixepoch() * 1000 - 30 * 24 * 60 * 60 * 1000)) AS sessions30d,
      (SELECT MAX(s.last_seen_at) FROM auth_sessions s JOIN users su ON su.id = s.user_id
        WHERE su.trainer_account_id = ta.id) AS lastActivityAt
      FROM trainer_accounts ta
      LEFT JOIN users u ON u.id = ta.owner_user_id
      ORDER BY CASE ta.access_status WHEN 'blocked' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,
        ta.created_at DESC`)
      .all(),
    db
      .prepare(`SELECT
      COUNT(*) AS totalAccounts,
      SUM(CASE WHEN access_status = 'active' THEN 1 ELSE 0 END) AS activeAccounts,
      SUM(CASE WHEN access_status = 'active' AND subscription_status = 'active'
        THEN 1 ELSE 0 END) AS paidAccounts,
      SUM(CASE WHEN subscription_status = 'trialing' THEN 1 ELSE 0 END) AS trials,
      SUM(CASE WHEN subscription_status = 'past_due' THEN 1 ELSE 0 END) AS pastDue,
      SUM(CASE WHEN access_status = 'active' AND subscription_status = 'active'
        AND currency = 'ARS' THEN monthly_price_cents ELSE 0 END) AS mrrArsCents,
      SUM(CASE WHEN access_status = 'active' AND subscription_status = 'active'
        AND currency = 'USD' THEN monthly_price_cents ELSE 0 END) AS mrrUsdCents
      FROM trainer_accounts`)
      .first(),
  ]);

  return Response.json({ accounts: accounts.results, summary: activity });
}

export async function POST(request: Request) {
  const admin = await getPlatformAdminSessionFromRequest(request);
  if (!admin)
    return Response.json({ error: 'No autorizado.' }, { status: 401 });
  if (!isSameOrigin(request))
    return Response.json({ error: 'Solicitud no permitida.' }, { status: 403 });

  const input = (await request.json()) as AccountInput;
  if (input.action !== 'create')
    return Response.json({ error: 'Acción no reconocida.' }, { status: 400 });

  const businessName = input.businessName?.trim() ?? '';
  const ownerName = input.ownerName?.trim() ?? '';
  const email = input.email?.trim() ?? '';
  if (!businessName || !ownerName || !email) {
    return Response.json(
      {
        error: 'Completá negocio, titular y email de ingreso.',
      },
      { status: 400 },
    );
  }
  const plan = plans.has(input.plan ?? '') ? input.plan! : 'starter';
  const subscriptionStatus = subscriptions.has(input.subscriptionStatus ?? '')
    ? input.subscriptionStatus!
    : 'trialing';
  const currency = input.currency === 'USD' ? 'USD' : 'ARS';
  try {
    const result = await createManagedTrainerAccount({
      businessName,
      ownerName,
      email,
      plan,
      subscriptionStatus,
      monthlyPriceCents: moneyToCents(input.monthlyPrice),
      currency,
      maxAthletes: boundedInteger(input.maxAthletes, 1, 5000, 30),
      periodEndsAt: dateToTimestamp(input.periodEndsOn),
    });
    return Response.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError)
      return Response.json({ error: error.message }, { status: error.status });
    console.error('[nexo-admin] Could not create trainer account', error);
    return Response.json(
      { error: 'No pudimos crear la cuenta del PF.' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const admin = await getPlatformAdminSessionFromRequest(request);
  if (!admin)
    return Response.json({ error: 'No autorizado.' }, { status: 401 });
  if (!isSameOrigin(request))
    return Response.json({ error: 'Solicitud no permitida.' }, { status: 403 });

  const input = (await request.json()) as AccountInput;
  if (input.action !== 'update' || !input.accountId)
    return Response.json({ error: 'Cuenta inválida.' }, { status: 400 });
  if (
    !plans.has(input.plan ?? '') ||
    !subscriptions.has(input.subscriptionStatus ?? '') ||
    !accessStatuses.has(input.accessStatus ?? '')
  ) {
    return Response.json(
      { error: 'Revisá el plan y los estados.' },
      { status: 400 },
    );
  }
  if (
    input.accountId === admin.trainerAccountId &&
    input.accessStatus !== 'active'
  ) {
    return Response.json(
      { error: 'No podés bloquear la cuenta desde la que administrás Nexo.' },
      { status: 409 },
    );
  }

  const result = await getD1()
    .prepare(`UPDATE trainer_accounts SET
      plan = ?, subscription_status = ?, access_status = ?,
      monthly_price_cents = ?, currency = ?, max_athletes = ?,
      current_period_ends_at = ?,
      trial_ends_at = CASE WHEN ? = 'trialing' THEN ? ELSE trial_ends_at END,
      notes = ?, updated_at = ?
      WHERE id = ?`)
    .bind(
      input.plan,
      input.subscriptionStatus,
      input.accessStatus,
      moneyToCents(input.monthlyPrice),
      input.currency === 'USD' ? 'USD' : 'ARS',
      boundedInteger(input.maxAthletes, 1, 5000, 30),
      dateToTimestamp(input.periodEndsOn),
      input.subscriptionStatus,
      dateToTimestamp(input.periodEndsOn),
      input.notes?.trim().slice(0, 2000) || null,
      Date.now(),
      input.accountId,
    )
    .run();
  if (!result.meta.changes)
    return Response.json({ error: 'La cuenta ya no existe.' }, { status: 404 });

  return Response.json({ ok: true });
}

function moneyToCents(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0;
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, Math.trunc(parsed)))
    : fallback;
}

function dateToTimestamp(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  return new Date(`${value}T23:59:59.999-03:00`).getTime();
}
