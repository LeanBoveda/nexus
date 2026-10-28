'use client';

/* eslint-disable next/no-html-link-for-pages -- Vinext's Link runtime currently throws during RSC prefetch. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Check,
  Copy,
  Eye,
  Link2,
  LoaderCircle,
  Mail,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  UserRoundCheck,
  UsersRound,
} from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AthleteImportDialog } from '@/components/nexo/athlete-import-dialog';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type Athlete = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  birthDate: string | null;
  countryCode: string | null;
  primaryPosition: string | null;
  primaryContext: string | null;
  status: 'active' | 'paused';
  groupNames: string;
  groupCount: number;
};

type Group = { id: string; name: string; organizationName: string };

export function AthletesManager() {
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({
    active: 0,
    paused: 0,
    withoutGroup: 0,
  });
  const requestController = useRef<AbortController | null>(null);
  const requestGeneration = useRef(0);
  const pageSize = 50;
  const [statusFilter, setStatusFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Athlete | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Athlete | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [accessTarget, setAccessTarget] = useState<Athlete | null>(null);
  const [accessUrl, setAccessUrl] = useState('');
  const [accessError, setAccessError] = useState('');
  const [generatingAccess, setGeneratingAccess] = useState(false);
  const [accessCopied, setAccessCopied] = useState(false);

  const loadData = useCallback(async () => {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    const generation = ++requestGeneration.current;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        q: debouncedSearch,
        status: statusFilter,
        group: groupFilter,
      });
      const [athleteResponse, groupResponse] = await Promise.all([
        fetch(`/api/athletes?${params}`, {
          cache: 'no-store',
          signal: controller.signal,
        }),
        fetch('/api/groups?groupsOnly=1', {
          cache: 'no-store',
          signal: controller.signal,
        }),
      ]);
      if (!athleteResponse.ok)
        throw new Error('No pudimos cargar los clientes.');
      const athleteResult = (await athleteResponse.json()) as {
        athletes?: Athlete[];
        total: number;
        page: number;
        summary: { active: number; paused: number; withoutGroup: number };
      };
      const groupResult = groupResponse.ok
        ? ((await groupResponse.json()) as { groups?: Group[] })
        : { groups: [] };
      if (generation !== requestGeneration.current || controller.signal.aborted)
        return;
      setAthletes(athleteResult.athletes ?? []);
      setTotal(athleteResult.total);
      setPage(athleteResult.page);
      setSummary(athleteResult.summary);
      setGroups(groupResult.groups ?? []);
    } catch (caught) {
      if (controller.signal.aborted || generation !== requestGeneration.current)
        return;
      setError(
        caught instanceof Error
          ? caught.message
          : 'No pudimos cargar los clientes.',
      );
    } finally {
      if (
        generation === requestGeneration.current &&
        !controller.signal.aborted
      )
        setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, statusFilter, groupFilter]);

  useEffect(() => {
    if (search === debouncedSearch) return;
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, debouncedSearch]);

  useEffect(() => {
    const request = window.setTimeout(() => void loadData(), 0);
    return () => {
      window.clearTimeout(request);
      requestController.current?.abort();
    };
  }, [loadData]);

  const availableGroups = useMemo(
    () =>
      Array.from(new Set(groups.map((group) => group.name))).sort(
        (left, right) => left.localeCompare(right, 'es'),
      ),
    [groups],
  );

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(athlete: Athlete) {
    setEditing(athlete);
    setFormOpen(true);
  }

  async function archiveAthlete() {
    if (!archiveTarget) return;
    setArchiving(true);
    setError('');
    try {
      const response = await fetch('/api/athletes', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: archiveTarget.id }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(
          result.error ?? 'No pudimos dar de baja al deportista.',
        );
      setNotice(
        `${archiveTarget.firstName} ${archiveTarget.lastName} fue dado de baja.`,
      );
      setArchiveTarget(null);
      await loadData();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'No pudimos dar de baja al deportista.',
      );
    } finally {
      setArchiving(false);
    }
  }

  function openAccess(athlete: Athlete) {
    setAccessTarget(athlete);
    setAccessUrl('');
    setAccessError('');
    setAccessCopied(false);
  }

  async function generateAccess() {
    if (!accessTarget) return;
    setGeneratingAccess(true);
    setAccessError('');
    setAccessCopied(false);
    try {
      const response = await fetch('/api/athletes/access', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ athleteId: accessTarget.id }),
      });
      const result = (await response.json()) as {
        url?: string;
        error?: string;
      };
      if (!response.ok || !result.url) {
        throw new Error(result.error ?? 'No pudimos generar el acceso.');
      }
      setAccessUrl(result.url);
    } catch (caught) {
      setAccessError(
        caught instanceof Error
          ? caught.message
          : 'No pudimos generar el acceso.',
      );
    } finally {
      setGeneratingAccess(false);
    }
  }

  async function copyAccess() {
    if (!accessUrl) return;
    await navigator.clipboard.writeText(accessUrl);
    setAccessCopied(true);
  }

  const activeCount = summary.active;
  const pausedCount = summary.paused;
  const withoutGroupCount = summary.withoutGroup;

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-6 sm:px-7 lg:px-9 lg:py-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Administración de clientes
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-[-0.04em] sm:text-[28px]">
            Clientes y deportistas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Altas, modificaciones y bajas desde una sola lista.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AthleteImportDialog
            groups={groups}
            onImported={(count, skipped) => {
              setNotice(
                `Se importaron ${count} alumnos.${skipped ? ` Se omitieron ${skipped} filas.` : ''}`,
              );
              void loadData();
            }}
          />
          <Button
            onClick={openCreate}
            className="h-9 rounded-xl bg-[#10253d] px-3.5 text-white hover:bg-[#183653]"
          >
            <Plus /> Nuevo cliente
          </Button>
        </div>
      </div>

      {notice && (
        <output className="mt-5 flex items-center gap-2 rounded-xl border border-[#cfe0ac] bg-[#f1f7e8] px-4 py-3 text-sm font-medium text-[#3f6110]">
          <Check className="size-4" />
          {notice}
        </output>
      )}
      {error && (
        <div
          role="alert"
          className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-[#edc5bd] bg-[#fff1ee] px-4 py-3 text-sm text-[#963b2d]"
        >
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => void loadData()}>
            Reintentar
          </Button>
        </div>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Summary
          icon={UserRoundCheck}
          label="Activos"
          value={activeCount}
          detail="Disponibles para asignaciones"
        />
        <Summary
          icon={Archive}
          label="Pausados"
          value={pausedCount}
          detail="Conservan todo su historial"
        />
        <Summary
          icon={UsersRound}
          label="Sin grupo"
          value={withoutGroupCount}
          detail="Pendientes de organización"
          alert={withoutGroupCount > 0}
        />
      </div>

      <Card className="mt-4 border-none bg-card py-0 ring-1 ring-border shadow-[0_18px_50px_-42px_#10253d]">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3.5 lg:flex-row lg:items-center">
          <label className="flex h-10 flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3 text-muted-foreground lg:max-w-md">
            <Search className="size-4" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Buscar cliente"
              placeholder="Buscar por nombre, email, posición o grupo…"
              className="w-full bg-transparent text-sm text-foreground outline-none"
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-2 lg:ml-auto">
            <NativeSelect
              value={groupFilter}
              onChange={(event) => {
                setGroupFilter(event.target.value);
                setPage(1);
              }}
              aria-label="Filtrar por grupo"
              className="w-full sm:min-w-48"
            >
              <NativeSelectOption value="all">
                Todos los grupos
              </NativeSelectOption>
              <NativeSelectOption value="none">Sin grupo</NativeSelectOption>
              {availableGroups.map((group) => (
                <NativeSelectOption key={group} value={group}>
                  {group}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
              aria-label="Filtrar por estado"
              className="w-full sm:min-w-40"
            >
              <NativeSelectOption value="all">
                Todos los estados
              </NativeSelectOption>
              <NativeSelectOption value="active">Activos</NativeSelectOption>
              <NativeSelectOption value="paused">Pausados</NativeSelectOption>
            </NativeSelect>
          </div>
        </div>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/35 hover:bg-muted/35">
                  <TableHead className="pl-4 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Cliente
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Contacto
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Grupo
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Contexto
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Estado
                  </TableHead>
                  <TableHead className="w-14" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <LoadingRows />
                ) : athletes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-52 text-center">
                      <p className="font-semibold">
                        {summary.active + summary.paused === 0
                          ? 'Todavía no cargaste clientes'
                          : 'No encontramos coincidencias'}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {summary.active + summary.paused === 0
                          ? 'Creá el primero para comenzar a organizar su trabajo.'
                          : 'Probá cambiando la búsqueda o los filtros.'}
                      </p>
                      {summary.active + summary.paused === 0 && (
                        <Button
                          onClick={openCreate}
                          className="mt-4 bg-[#10253d] text-white hover:bg-[#183653]"
                        >
                          <Plus /> Crear primer cliente
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  athletes.map((athlete) => {
                    const groupNames = splitGroups(athlete.groupNames);
                    return (
                      <TableRow key={athlete.id}>
                        <TableCell className="pl-4">
                          <div className="flex items-center gap-3">
                            <Avatar className="size-10">
                              <AvatarFallback className="bg-[#eef2f5] text-xs font-bold text-[#29445e]">
                                {initials(athlete)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <a
                                href={`/deportistas/${encodeURIComponent(athlete.id)}`}
                                className="text-sm font-semibold hover:text-[#52751d] hover:underline"
                              >
                                {athlete.firstName} {athlete.lastName}
                              </a>
                              <p className="text-xs text-muted-foreground">
                                {athlete.primaryPosition ??
                                  'Sin posición definida'}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="flex items-center gap-1.5 text-sm">
                            <Mail className="size-3.5 text-muted-foreground" />
                            {athlete.email}
                          </p>
                          {athlete.phone && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {athlete.phone}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          {groupNames.length === 0 ? (
                            <span className="text-sm text-muted-foreground">
                              Sin grupo
                            </span>
                          ) : (
                            <div className="flex max-w-xs flex-wrap gap-1">
                              {groupNames.map((group) => (
                                <Badge
                                  key={group}
                                  variant="outline"
                                  className="bg-muted/35"
                                >
                                  {group}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {contextLabel(athlete.primaryContext)}
                          {athlete.countryCode && (
                            <span className="ml-1 text-muted-foreground">
                              · {athlete.countryCode}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              athlete.status === 'active'
                                ? 'border-[#cfe0ac] bg-[#f1f7e8] text-[#52751d]'
                                : 'border-[#ead4a1] bg-[#fff8e8] text-[#876016]'
                            }
                          >
                            {athlete.status === 'active' ? 'Activo' : 'Pausado'}
                          </Badge>
                        </TableCell>
                        <TableCell className="pr-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Acciones de ${athlete.firstName} ${athlete.lastName}`}
                                />
                              }
                            >
                              <MoreHorizontal />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem
                                onClick={() => {
                                  window.location.href = `/deportistas/${encodeURIComponent(athlete.id)}`;
                                }}
                              >
                                <Eye /> Ver perfil
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => openAccess(athlete)}
                              >
                                <Link2 /> Crear acceso móvil
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => openEdit(athlete)}
                              >
                                <Pencil /> Editar cliente
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setArchiveTarget(athlete)}
                              >
                                <Archive /> Dar de baja
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          <div
            className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3"
            aria-label="Paginación de clientes"
          >
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {total === 0
                ? '0 clientes'
                : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} de ${total} clientes`}{' '}
              · Página {page} de {Math.max(1, Math.ceil(total / pageSize))}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={loading || page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={loading || page * pageSize >= total}
                onClick={() => setPage((current) => current + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <AthleteFormDialog
        key={editing?.id ?? 'new'}
        open={formOpen}
        athlete={editing}
        groups={groups}
        onOpenChange={setFormOpen}
        onSaved={async (message) => {
          setNotice(message);
          setFormOpen(false);
          await loadData();
        }}
      />

      <Dialog
        open={Boolean(accessTarget)}
        onOpenChange={(open) => {
          if (!open && !generatingAccess) setAccessTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Acceso de {accessTarget?.firstName} {accessTarget?.lastName}
            </DialogTitle>
            <DialogDescription>
              Generá un enlace personal para que ingrese desde su teléfono sin
              contraseña.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-2xl border border-[#dbe4d4] bg-[#f3f7ed] p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#dff0b9] text-[#52751d]">
                <ShieldCheck className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold">Acceso a Nexo</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  El primer ingreso verifica el correo y permite crear la
                  contraseña. Si ya la creó, ingresa con su email y contraseña.
                </p>
              </div>
            </div>
          </div>

          {accessUrl ? (
            <div className="space-y-3">
              <Label htmlFor="athlete-access-url">Enlace para enviar</Label>
              <div className="flex gap-2">
                <Input
                  id="athlete-access-url"
                  value={accessUrl}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void copyAccess()}
                >
                  {accessCopied ? <Check /> : <Copy />}
                  {accessCopied ? 'Copiado' : 'Copiar'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Copialo y enviáselo al deportista. No lo abras desde tu cuenta
                de preparador físico.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Cuando lo generes, sólo tendrás que copiarlo y compartirlo por el
              medio que uses habitualmente.
            </p>
          )}

          {accessError && (
            <p
              role="alert"
              className="rounded-xl bg-[#fff0ed] px-3 py-2.5 text-sm font-medium text-[#a23f30]"
            >
              {accessError}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={generatingAccess}
              onClick={() => setAccessTarget(null)}
            >
              Cerrar
            </Button>
            <Button
              type="button"
              disabled={generatingAccess}
              onClick={() => void generateAccess()}
              className="bg-[#10253d] text-white hover:bg-[#183653]"
            >
              {generatingAccess ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Link2 />
              )}
              {generatingAccess
                ? 'Generando…'
                : accessUrl
                  ? 'Generar uno nuevo'
                  : 'Generar acceso'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => !open && !archiving && setArchiveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Dar de baja a {archiveTarget?.firstName}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se ocultará de las listas activas y dejará sus grupos. Sus
              evaluaciones e historial se conservarán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={archiving}
              onClick={() => void archiveAthlete()}
              className="bg-[#a23f30] text-white hover:bg-[#873327]"
            >
              {archiving ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Archive />
              )}{' '}
              Confirmar baja
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AthleteFormDialog({
  open,
  athlete,
  groups,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  athlete: Athlete | null;
  groups: Group[];
  onOpenChange: (open: boolean) => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const editing = Boolean(athlete);

  async function save(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/athletes', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: athlete?.id,
          firstName: form.get('firstName'),
          lastName: form.get('lastName'),
          email: form.get('email'),
          phone: form.get('phone'),
          birthDate: form.get('birthDate'),
          countryCode: form.get('countryCode'),
          primaryContext: form.get('primaryContext'),
          position: form.get('position'),
          status: form.get('status'),
          groupId: form.get('groupId'),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error ?? 'No pudimos guardar los cambios.');
      await onSaved(
        editing
          ? 'Los datos del cliente fueron actualizados.'
          : 'El nuevo cliente fue agregado.',
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'No pudimos guardar los cambios.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => !saving && onOpenChange(nextOpen)}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? 'Editar cliente' : 'Nuevo cliente'}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? 'Actualizá la información personal y su disponibilidad.'
              : 'Completá los datos básicos para crear su ficha.'}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={save}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre" htmlFor="client-first-name">
              <Input
                id="client-first-name"
                name="firstName"
                defaultValue={athlete?.firstName ?? ''}
                required
              />
            </Field>
            <Field label="Apellido" htmlFor="client-last-name">
              <Input
                id="client-last-name"
                name="lastName"
                defaultValue={athlete?.lastName ?? ''}
                required
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" htmlFor="client-email">
              <Input
                id="client-email"
                name="email"
                type="email"
                defaultValue={athlete?.email ?? ''}
                required
              />
            </Field>
            <Field label="Teléfono" htmlFor="client-phone">
              <Input
                id="client-phone"
                name="phone"
                type="tel"
                defaultValue={athlete?.phone ?? ''}
                placeholder="Opcional"
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Fecha de nacimiento" htmlFor="client-birth-date">
              <Input
                id="client-birth-date"
                name="birthDate"
                type="date"
                defaultValue={athlete?.birthDate ?? ''}
              />
            </Field>
            <Field label="País" htmlFor="client-country">
              <Input
                id="client-country"
                name="countryCode"
                defaultValue={athlete?.countryCode ?? 'AR'}
                maxLength={2}
                placeholder="AR"
                className="uppercase"
              />
            </Field>
            <Field label="Posición / rol" htmlFor="client-position">
              <Input
                id="client-position"
                name="position"
                defaultValue={athlete?.primaryPosition ?? ''}
                placeholder="Escribí la posición o el rol"
                maxLength={100}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Contexto principal" htmlFor="client-context">
              <Input
                id="client-context"
                name="primaryContext"
                defaultValue={
                  athlete?.primaryContext
                    ? contextLabel(athlete.primaryContext)
                    : ''
                }
                placeholder="Deporte, disciplina o ámbito"
                maxLength={100}
              />
            </Field>
            {editing ? (
              <Field label="Estado" htmlFor="client-status">
                <NativeSelect
                  id="client-status"
                  name="status"
                  defaultValue={athlete?.status ?? 'active'}
                  className="w-full"
                >
                  <NativeSelectOption value="active">Activo</NativeSelectOption>
                  <NativeSelectOption value="paused">
                    Pausado
                  </NativeSelectOption>
                </NativeSelect>
              </Field>
            ) : (
              <Field label="Grupo inicial" htmlFor="client-group">
                <NativeSelect
                  id="client-group"
                  name="groupId"
                  defaultValue=""
                  className="w-full"
                >
                  <NativeSelectOption value="">
                    Sin grupo por ahora
                  </NativeSelectOption>
                  {groups.map((group) => (
                    <NativeSelectOption key={group.id} value={group.id}>
                      {group.organizationName} · {group.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            )}
          </div>
          {editing && (
            <p className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              La pertenencia a planteles se modifica desde la sección Grupos.
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-xl bg-[#fff0ed] px-3 py-2.5 text-sm font-medium text-[#a23f30]"
            >
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-[#10253d] text-white hover:bg-[#183653]"
            >
              {saving ? <LoaderCircle className="animate-spin" /> : <Check />}
              {saving
                ? 'Guardando…'
                : editing
                  ? 'Guardar cambios'
                  : 'Crear cliente'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function LoadingRows() {
  return (
    <>
      {Array.from({ length: 4 }, (_, index) => (
        <TableRow key={index}>
          <TableCell colSpan={6} className="px-4 py-4">
            <div className="h-10 animate-pulse rounded-xl bg-muted" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function Summary({
  icon: Icon,
  label,
  value,
  detail,
  alert = false,
}: {
  icon: typeof UserRoundCheck;
  label: string;
  value: number;
  detail: string;
  alert?: boolean;
}) {
  return (
    <Card className="border-none bg-card ring-1 ring-border">
      <CardContent className="flex items-center gap-4">
        <span
          className={`grid size-11 shrink-0 place-items-center rounded-2xl ${alert ? 'bg-[#fff0ed] text-[#a23f30]' : 'bg-[#edf4e1] text-[#52751d]'}`}
        >
          <Icon className="size-5" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-2xl font-bold tracking-[-0.04em]">{value}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function splitGroups(value: string) {
  return value ? value.split('|||').filter(Boolean) : [];
}

function initials(athlete: Athlete) {
  return `${athlete.firstName[0] ?? ''}${athlete.lastName[0] ?? ''}`.toUpperCase();
}

function contextLabel(value: string | null) {
  if (value === 'national_team') return 'Selección';
  if (value === 'club') return 'Club';
  if (value === 'gym') return 'Gimnasio';
  if (value === 'independent') return 'Particular';
  if (value === 'international') return 'Exterior';
  return value || 'Sin definir';
}
