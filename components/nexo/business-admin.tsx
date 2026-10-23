'use client';
/* eslint-disable next/no-html-link-for-pages -- Native navigation is retained for Vinext production reliability. */

import {
  ArrowLeft,
  Ban,
  Building2,
  CalendarClock,
  CircleDollarSign,
  Plus,
  Mail,
  RefreshCw,
  ShieldCheck,
  Users,
  WalletCards,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AdminDemo } from '@/components/nexo/admin-demo';

type Account = {
  id: string;
  businessName: string;
  slug: string;
  contactEmail: string;
  ownerName: string | null;
  ownerStatus: string | null;
  accessStatus: 'active' | 'paused' | 'blocked';
  subscriptionStatus: 'trialing' | 'active' | 'past_due' | 'canceled';
  plan: 'starter' | 'pro' | 'team';
  monthlyPriceCents: number;
  currency: 'ARS' | 'USD';
  maxAthletes: number;
  trialEndsAt: number | null;
  currentPeriodEndsAt: number | null;
  notes: string | null;
  athleteCount: number;
  groupCount: number;
  routineCount: number;
  sessions30d: number;
  lastActivityAt: number | null;
  createdAt: number;
};

type Summary = {
  totalAccounts: number;
  activeAccounts: number;
  paidAccounts: number;
  trials: number;
  pastDue: number;
  mrrArsCents: number;
  mrrUsdCents: number;
};

type FormState = {
  businessName: string;
  ownerName: string;
  email: string;
  plan: Account['plan'];
  subscriptionStatus: Account['subscriptionStatus'];
  accessStatus: Account['accessStatus'];
  monthlyPrice: string;
  currency: Account['currency'];
  maxAthletes: string;
  periodEndsOn: string;
  notes: string;
};

const emptyForm: FormState = {
  businessName: '',
  ownerName: '',
  email: '',
  plan: 'starter',
  subscriptionStatus: 'trialing',
  accessStatus: 'active',
  monthlyPrice: '0',
  currency: 'ARS',
  maxAthletes: '30',
  periodEndsOn: futureDate(14),
  notes: '',
};

export function BusinessAdmin({
  userName,
  showDemo = false,
}: {
  userName: string;
  showDemo?: boolean;
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{
    tone: 'ok' | 'error';
    text: string;
  } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [emailHealth, setEmailHealth] = useState<{
    configured: boolean;
    events: {
      id: string;
      status: string;
      errorCode: string | null;
      createdAt: number;
    }[];
    failures: { count: number; lastFailureAt: number | null } | null;
  } | null>(null);
  const [emailError, setEmailError] = useState('');
  const [sendingAccess, setSendingAccess] = useState(false);
  const [accessNotice, setAccessNotice] = useState('');

  const loadEmailHealth = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/email', { cache: 'no-store' });
      if (!response.ok) throw new Error('No pudimos consultar los envíos.');
      setEmailHealth(await response.json());
      setEmailError('');
    } catch {
      setEmailError(
        'No pudimos consultar el estado del correo. Actualizá para reintentar.',
      );
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/accounts', {
        cache: 'no-store',
      });
      const body = (await response.json()) as {
        accounts?: Account[];
        summary?: Summary;
        error?: string;
      };
      if (!response.ok)
        throw new Error(body.error || 'No pudimos cargar el negocio.');
      setAccounts(body.accounts ?? []);
      setSummary(body.summary ?? null);
      await loadEmailHealth();
    } catch (error) {
      setNotice({ tone: 'error', text: messageOf(error) });
    } finally {
      setLoading(false);
    }
  }, [loadEmailHealth]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function openCreate() {
    setForm({
      ...emptyForm,
      periodEndsOn: futureDate(14),
    });
    setCreateOpen(true);
    setNotice(null);
    setAccessNotice('');
  }

  function openEdit(account: Account) {
    setForm({
      businessName: account.businessName,
      ownerName: account.ownerName ?? '',
      email: account.contactEmail,
      plan: account.plan,
      subscriptionStatus: account.subscriptionStatus,
      accessStatus: account.accessStatus,
      monthlyPrice: String(account.monthlyPriceCents / 100),
      currency: account.currency,
      maxAthletes: String(account.maxAthletes),
      periodEndsOn: timestampToInput(
        account.currentPeriodEndsAt ?? account.trialEndsAt,
      ),
      notes: account.notes ?? '',
    });
    setEditAccount(account);
    setNotice(null);
    setAccessNotice('');
  }

  async function createAccount() {
    setSaving(true);
    try {
      const response = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'create', ...form }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(body.error || 'No pudimos crear la cuenta.');
      setCreateOpen(false);
      setNotice({
        tone: 'ok',
        text: `Cuenta creada para ${form.email}. El PF ya puede solicitar su enlace en el login. Abrí su cuenta para enviarle un acceso.`,
      });
      await load();
    } catch (error) {
      setNotice({ tone: 'error', text: messageOf(error) });
    } finally {
      setSaving(false);
    }
  }

  async function sendAccess() {
    if (!editAccount) return;
    setSendingAccess(true);
    setAccessNotice('');
    try {
      const response = await fetch('/api/admin/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: editAccount.contactEmail }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(body.error || 'No pudimos enviar el enlace.');
      setAccessNotice('Enlace enviado. El PF tiene 15 minutos para usarlo.');
    } catch (error) {
      setAccessNotice(messageOf(error));
    } finally {
      setSendingAccess(false);
      await loadEmailHealth();
    }
  }

  async function updateAccount() {
    if (!editAccount) return;
    setSaving(true);
    try {
      const response = await fetch('/api/admin/accounts', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          accountId: editAccount.id,
          ...form,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(body.error || 'No pudimos actualizar la cuenta.');
      setEditAccount(null);
      setNotice({ tone: 'ok', text: 'Plan, cobro y acceso actualizados.' });
      await load();
    } catch (error) {
      setNotice({ tone: 'error', text: messageOf(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f6f3] text-[#10253d]">
      <header className="border-b border-[#dbe2df] bg-[#10253d] text-white">
        <div className="mx-auto flex max-w-[1560px] items-center gap-4 px-5 py-4 sm:px-8">
          <a
            href="/"
            className="grid size-9 place-items-center rounded-xl bg-white/10 transition hover:bg-white/15"
            aria-label="Volver a Nexo"
          >
            <ArrowLeft className="size-4" />
          </a>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#c8f15a]">
              Nexo Control
            </p>
            <p className="truncate text-sm font-semibold">
              Administración de la plataforma
            </p>
          </div>
          <div className="hidden text-right sm:block">
            <p className="text-xs font-semibold">{userName}</p>
            <p className="text-[10px] text-white/50">
              Administrador del sistema
            </p>
          </div>
          <a
            href="/api/admin/email/connect"
            className="rounded-lg border border-white/20 px-3 py-2 text-xs hover:bg-white/10"
          >
            Conectar Gmail
          </a>
          <ShieldCheck className="size-5 text-[#c8f15a]" />
        </div>
      </header>

      <div className="mx-auto max-w-[1560px] px-5 py-7 sm:px-8 lg:py-9">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#668044]">
              Negocio
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-[-0.05em]">
              Suscripciones y cuentas PF
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[#64717d]">
              Una cuenta por preparador físico. Desde acá controlás su plan,
              vencimiento, capacidad y acceso a toda la aplicación.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="rounded-xl bg-white"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw
                className={`size-4 ${loading ? 'animate-spin' : ''}`}
              />{' '}
              Actualizar
            </Button>
            <Button
              className="rounded-xl bg-[#10253d] text-white hover:bg-[#183653]"
              onClick={openCreate}
            >
              <Plus className="size-4" /> Nuevo PF
            </Button>
          </div>
        </div>

        {showDemo && <AdminDemo />}
        {notice ? (
          <div
            className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${notice.tone === 'ok' ? 'border-[#c9dd9c] bg-[#f3f9e8] text-[#416118]' : 'border-[#f1bbb0] bg-[#fff2ef] text-[#a23d2e]'}`}
          >
            {notice.text}
          </div>
        ) : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Stat
            icon={Building2}
            label="Cuentas PF"
            value={summary?.totalAccounts ?? 0}
            detail={`${summary?.activeAccounts ?? 0} con acceso`}
          />
          <Stat
            icon={CircleDollarSign}
            label="Ingreso mensual"
            value={formatMrr(summary)}
            detail="Suscripciones activas"
          />
          <Stat
            icon={WalletCards}
            label="Suscripciones"
            value={summary?.paidAccounts ?? 0}
            detail="Activas y cobrables"
          />
          <Stat
            icon={CalendarClock}
            label="En prueba"
            value={summary?.trials ?? 0}
            detail="Seguimiento comercial"
          />
          <Stat
            icon={Ban}
            label="Pago pendiente"
            value={summary?.pastDue ?? 0}
            detail="Requieren atención"
            warning={Boolean(summary?.pastDue)}
          />
        </div>

        <section
          className="mt-6 rounded-2xl border border-[#dbe2df] bg-white p-5"
          aria-label="Operación de correo"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold">Accesos por email</h2>
              <p className="mt-1 text-sm text-[#64717d]">
                {emailError ||
                  (emailHealth
                    ? emailHealth.configured
                      ? 'Gmail conectado. La conexión configurada no confirma la entrega de próximos correos.'
                      : 'Gmail pendiente de conexión.'
                    : 'Consultando conexión…')}
              </p>
              {emailHealth ? (
                <p className="mt-1 text-xs text-[#64717d]">
                  {emailHealth.failures?.count ?? 0} envíos fallidos en las
                  últimas 24 horas. Último fallo:{' '}
                  {shortDate(emailHealth.failures?.lastFailureAt ?? null)}.
                </p>
              ) : null}
            </div>
            <a
              href="/api/admin/email/connect"
              className="text-sm font-semibold text-[#597523]"
            >
              Conectar o renovar Gmail →
            </a>
          </div>
          {emailHealth?.events.length ? (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer font-semibold">
                Últimos {emailHealth.events.length} intentos de envío
              </summary>
              <ul className="mt-2 space-y-1 text-[#64717d]">
                {emailHealth.events.map((event) => (
                  <li key={event.id}>
                    {new Date(event.createdAt).toLocaleString('es-AR', {
                      timeZone: 'America/Argentina/Buenos_Aires',
                    })}{' '}
                    ·{' '}
                    {event.status === 'sent' ? 'Aceptado por Gmail' : 'Fallido'}
                    {event.errorCode ? ` · ${event.errorCode}` : ''}
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            <p className="mt-3 text-xs text-[#64717d]">
              Todavía no hay intentos de envío registrados.
            </p>
          )}
        </section>

        <div className="mt-6 overflow-hidden rounded-3xl border border-[#dbe2df] bg-white shadow-[0_24px_60px_-50px_#10253d]">
          <div className="flex items-center justify-between border-b border-[#e5e9e7] px-5 py-4 sm:px-6">
            <div>
              <h2 className="font-bold">Clientes de Nexo</h2>
              <p className="mt-0.5 text-xs text-[#76818a]">
                Uso, actividad y situación comercial de cada PF.
              </p>
            </div>
            <Badge variant="outline">{accounts.length} cuentas</Badge>
          </div>

          {loading ? (
            <div className="grid min-h-64 place-items-center text-sm text-[#76818a]">
              <RefreshCw className="mb-2 size-5 animate-spin" />
              Cargando negocio…
            </div>
          ) : accounts.length === 0 ? (
            <div className="grid min-h-64 place-items-center p-8 text-center">
              <div>
                <Building2 className="mx-auto size-8 text-[#8aa04d]" />
                <p className="mt-3 font-semibold">Todavía no hay cuentas</p>
                <p className="mt-1 text-sm text-[#76818a]">
                  Creá el primer acceso para un PF.
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[#e8ecea]">
              {accounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => openEdit(account)}
                  className="grid w-full gap-4 px-5 py-5 text-left transition hover:bg-[#f8faf7] sm:px-6 lg:grid-cols-[minmax(240px,1.2fr)_150px_150px_180px_130px] lg:items-center"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#eef4e1] text-[#597523]">
                      <Building2 className="size-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-bold">
                          {account.businessName}
                        </span>
                        <StatusBadge
                          access={account.accessStatus}
                          subscription={account.subscriptionStatus}
                        />
                      </span>
                      <span className="mt-1 block truncate text-xs text-[#78838c]">
                        {account.ownerName || 'Sin titular'} ·{' '}
                        {account.contactEmail}
                      </span>
                      <span className="mt-1 block text-[10px] text-[#9aa3aa]">
                        Última actividad: {relativeDate(account.lastActivityAt)}
                      </span>
                    </span>
                  </div>
                  <DataBlock
                    label="Plan"
                    value={planLabel(account.plan)}
                    detail={`${formatMoney(account.monthlyPriceCents, account.currency)}/mes`}
                  />
                  <DataBlock
                    label="Uso"
                    value={`${account.athleteCount} / ${account.maxAthletes}`}
                    detail="deportistas"
                    progress={Math.min(
                      100,
                      (account.athleteCount /
                        Math.max(1, account.maxAthletes)) *
                        100,
                    )}
                  />
                  <DataBlock
                    label="Operación"
                    value={`${account.groupCount} grupos · ${account.routineCount} rutinas`}
                    detail={`${account.sessions30d} sesiones en 30 días`}
                  />
                  <DataBlock
                    label="Próximo corte"
                    value={shortDate(
                      account.currentPeriodEndsAt ?? account.trialEndsAt,
                    )}
                    detail="Editar cuenta →"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <AccountDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Dar de alta un PF"
        description="Creá su espacio y habilitá el ingreso por enlace al email."
        form={form}
        setForm={setForm}
        saving={saving}
        createMode
        onSave={() => void createAccount()}
      />
      <AccountDialog
        open={Boolean(editAccount)}
        onOpenChange={(open) => !open && setEditAccount(null)}
        title={editAccount?.businessName ?? 'Editar cuenta'}
        description="El estado de acceso define si el PF y sus jugadores pueden entrar."
        form={form}
        setForm={setForm}
        saving={saving}
        onSave={() => void updateAccount()}
        accessEmail={editAccount?.contactEmail}
        canSendAccess={
          editAccount?.accessStatus === 'active' &&
          editAccount?.ownerStatus === 'active'
        }
        sendingAccess={sendingAccess}
        accessNotice={accessNotice}
        onSendAccess={() => void sendAccess()}
      />
    </main>
  );
}

function AccountDialog({
  open,
  onOpenChange,
  title,
  description,
  form,
  setForm,
  saving,
  createMode = false,
  onSave,
  accessEmail,
  canSendAccess,
  sendingAccess,
  accessNotice,
  onSendAccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  form: FormState;
  setForm: (next: FormState) => void;
  saving: boolean;
  createMode?: boolean;
  onSave: () => void;
  accessEmail?: string;
  canSendAccess?: boolean;
  sendingAccess?: boolean;
  accessNotice?: string;
  onSendAccess?: () => void;
}) {
  const field = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm({ ...form, [key]: value });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          {createMode ? (
            <>
              <Field label="Negocio o marca">
                <Input
                  value={form.businessName}
                  onChange={(event) =>
                    field('businessName', event.target.value)
                  }
                  placeholder="Rendimiento Juan Pérez"
                />
              </Field>
              <Field label="Nombre del titular">
                <Input
                  value={form.ownerName}
                  onChange={(event) => field('ownerName', event.target.value)}
                  placeholder="Juan Pérez"
                />
              </Field>
              <Field label="Email de ingreso">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(event) => field('email', event.target.value)}
                  placeholder="pf@ejemplo.com"
                />
              </Field>
              <p className="self-end text-xs text-muted-foreground">
                El PF ingresa con un enlace de un solo uso recibido en su email.
              </p>
            </>
          ) : null}
          <Field label="Plan">
            <Select
              value={form.plan}
              onChange={(value) => field('plan', value as FormState['plan'])}
            >
              <option value="starter">Inicial</option>
              <option value="pro">Profesional</option>
              <option value="team">Equipo</option>
            </Select>
          </Field>
          <Field label="Suscripción">
            <Select
              value={form.subscriptionStatus}
              onChange={(value) =>
                field(
                  'subscriptionStatus',
                  value as FormState['subscriptionStatus'],
                )
              }
            >
              <option value="trialing">Prueba</option>
              <option value="active">Activa</option>
              <option value="past_due">Pago pendiente</option>
              <option value="canceled">Cancelada</option>
            </Select>
          </Field>
          {!createMode ? (
            <Field label="Acceso a la app">
              <Select
                value={form.accessStatus}
                onChange={(value) =>
                  field('accessStatus', value as FormState['accessStatus'])
                }
              >
                <option value="active">Habilitado</option>
                <option value="paused">Pausado</option>
                <option value="blocked">Bloqueado</option>
              </Select>
            </Field>
          ) : null}
          <Field label="Precio mensual">
            <div className="flex gap-2">
              <Input
                inputMode="decimal"
                value={form.monthlyPrice}
                onChange={(event) => field('monthlyPrice', event.target.value)}
              />
              <Select
                value={form.currency}
                onChange={(value) =>
                  field('currency', value as FormState['currency'])
                }
                className="w-24"
              >
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </Select>
            </div>
          </Field>
          <Field label="Máximo de deportistas">
            <Input
              type="number"
              min={1}
              max={5000}
              value={form.maxAthletes}
              onChange={(event) => field('maxAthletes', event.target.value)}
            />
          </Field>
          <Field
            label={
              form.subscriptionStatus === 'trialing'
                ? 'Fin de prueba'
                : 'Próximo vencimiento'
            }
          >
            <Input
              type="date"
              value={form.periodEndsOn}
              onChange={(event) => field('periodEndsOn', event.target.value)}
            />
          </Field>
          {!createMode ? (
            <div className="sm:col-span-2">
              <Field label="Notas comerciales">
                <Textarea
                  value={form.notes}
                  onChange={(event) => field('notes', event.target.value)}
                  placeholder="Acuerdos, forma de pago, seguimiento…"
                />
              </Field>
            </div>
          ) : null}
        </div>
        {!createMode && accessEmail ? (
          <div className="rounded-xl border p-4 text-sm">
            <p className="font-semibold">Acceso del PF</p>
            <p className="mt-1 break-all text-muted-foreground">
              {accessEmail}
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              disabled={!canSendAccess || sendingAccess || saving}
              onClick={onSendAccess}
            >
              <Mail className="size-4" />{' '}
              {sendingAccess ? 'Enviando…' : 'Enviar enlace de acceso'}
            </Button>
            {!canSendAccess ? (
              <p className="mt-2 text-xs">
                Guardá la cuenta con acceso activo para habilitar el envío.
              </p>
            ) : null}
            {accessNotice ? (
              <output className="mt-2 block text-xs">{accessNotice}</output>
            ) : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={onSave}
            disabled={saving}
            className="bg-[#10253d] text-white hover:bg-[#183653]"
          >
            {saving
              ? 'Guardando…'
              : createMode
                ? 'Crear cuenta'
                : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function Select({
  value,
  onChange,
  children,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 ${className}`}
    >
      {children}
    </select>
  );
}
function Stat({
  icon: Icon,
  label,
  value,
  detail,
  warning = false,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  detail: string;
  warning?: boolean;
}) {
  return (
    <Card className="border-none bg-white ring-1 ring-[#dbe2df]">
      <CardContent className="flex items-center gap-3 p-4">
        <span
          className={`grid size-10 place-items-center rounded-2xl ${warning ? 'bg-[#fff0ec] text-[#b34231]' : 'bg-[#edf4e1] text-[#597523]'}`}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xl font-bold tracking-[-0.04em]">
            {value}
          </p>
          <p className="text-[11px] font-bold">{label}</p>
          <p className="truncate text-[10px] text-[#88929a]">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}
function DataBlock({
  label,
  value,
  detail,
  progress,
}: {
  label: string;
  value: string;
  detail: string;
  progress?: number;
}) {
  return (
    <span>
      <span className="block text-[10px] font-bold uppercase tracking-[0.1em] text-[#9aa3aa]">
        {label}
      </span>
      <span className="mt-1 block text-xs font-semibold">{value}</span>
      <span className="mt-0.5 block text-[10px] text-[#849098]">{detail}</span>
      {progress !== undefined ? (
        <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-[#e9eeeb]">
          <span
            className="block h-full rounded-full bg-[#9fc33c]"
            style={{ width: `${progress}%` }}
          />
        </span>
      ) : null}
    </span>
  );
}
function StatusBadge({
  access,
  subscription,
}: {
  access: Account['accessStatus'];
  subscription: Account['subscriptionStatus'];
}) {
  const blocked = access !== 'active';
  const pending = subscription === 'past_due';
  return (
    <Badge
      className={
        blocked
          ? 'bg-[#fff0ec] text-[#a33f30]'
          : pending
            ? 'bg-[#fff6dc] text-[#856015]'
            : 'bg-[#eef6df] text-[#4d691b]'
      }
    >
      {blocked
        ? access === 'paused'
          ? 'Pausado'
          : 'Bloqueado'
        : subscriptionLabel(subscription)}
    </Badge>
  );
}
function subscriptionLabel(value: Account['subscriptionStatus']) {
  return {
    trialing: 'Prueba',
    active: 'Activo',
    past_due: 'Pago pendiente',
    canceled: 'Cancelado',
  }[value];
}
function planLabel(value: Account['plan']) {
  return { starter: 'Inicial', pro: 'Profesional', team: 'Equipo' }[value];
}
function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(cents || 0) / 100);
}
function formatMrr(summary: Summary | null) {
  const ars = Number(summary?.mrrArsCents ?? 0);
  const usd = Number(summary?.mrrUsdCents ?? 0);
  if (ars && usd)
    return `${formatMoney(ars, 'ARS')} · ${formatMoney(usd, 'USD')}`;
  return usd ? formatMoney(usd, 'USD') : formatMoney(ars, 'ARS');
}
function shortDate(value: number | null) {
  return value
    ? new Intl.DateTimeFormat('es-AR', {
        day: '2-digit',
        month: 'short',
        year: '2-digit',
        timeZone: 'America/Argentina/Buenos_Aires',
      }).format(new Date(value))
    : 'Sin fecha';
}
function relativeDate(value: number | null) {
  if (!value) return 'sin ingresos';
  const days = Math.floor((Date.now() - value) / 86_400_000);
  return days <= 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`;
}
function timestampToInput(value: number | null) {
  if (!value) return '';
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function futureDate(days: number) {
  return timestampToInput(Date.now() + days * 86_400_000);
}
function messageOf(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Ocurrió un error inesperado.';
}
