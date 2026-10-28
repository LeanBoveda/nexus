'use client';

import { useMemo, useState } from 'react';
import { Check, LoaderCircle, Search, UserPlus } from 'lucide-react';
import {
  filterGroupCandidates,
  type GroupCandidate,
  type CandidateMembership,
} from '@/lib/group-member-filters';

const fieldClass =
  'h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-[#8fbc29] focus:ring-2 focus:ring-[#b9dc68]/20';
export function GroupMemberPicker({
  athletes,
  groups,
  memberships,
  targetId,
  selected,
  onSelectedChange,
  saving,
  onAdd,
  error,
}: {
  athletes: GroupCandidate[];
  groups: { id: string; name: string; organizationName: string }[];
  memberships: CandidateMembership[];
  targetId: string;
  selected: string[];
  onSelectedChange: (ids: string[]) => void;
  saving: boolean;
  onAdd: () => void;
  error?: string;
}) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [position, setPosition] = useState('');
  const [membership, setMembership] = useState('');
  const positions = useMemo(
    () =>
      [
        ...new Set(
          athletes
            .map((a) => a.primaryPosition?.trim())
            .filter((value): value is string => Boolean(value)),
        ),
      ].sort((a, b) => a.localeCompare(b, 'es')),
    [athletes],
  );
  const filtered = useMemo(
    () =>
      filterGroupCandidates(athletes, memberships, groups, targetId, {
        query,
        group,
        position,
        membership,
      }),
    [
      athletes,
      memberships,
      groups,
      targetId,
      query,
      group,
      position,
      membership,
    ],
  );
  const existing = useMemo(
    () =>
      new Set(
        memberships
          .filter((m) => m.groupId === targetId)
          .map((m) => m.athleteId),
      ),
    [memberships, targetId],
  );
  const selectedSet = new Set(selected);
  const visibleIds = new Set(filtered.map((a) => a.id));
  const hidden = selected.filter((id) => !visibleIds.has(id)).length;
  const hasFilters = Boolean(query || group || position || membership);
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={saving}
          aria-label="Buscar alumnos para agregar al grupo"
          placeholder="Nombre, apellido, email, posición o grupo…"
          className="h-10 min-w-0 w-full bg-transparent text-sm outline-none"
        />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-semibold">
          Grupo actual
          <select
            className={fieldClass}
            value={group}
            onChange={(event) => setGroup(event.target.value)}
            disabled={saving}
          >
            <option value="">Todos los grupos</option>
            <option value="__ungrouped">Sin grupo</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.organizationName} · {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-semibold">
          Posición o rol
          <select
            className={fieldClass}
            value={position}
            onChange={(event) => setPosition(event.target.value)}
            disabled={saving}
          >
            <option value="">Todas las posiciones</option>
            <option value="__no_position">Sin posición</option>
            {positions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-semibold sm:col-span-2">
          Pertenencia a este grupo
          <select
            className={fieldClass}
            value={membership}
            onChange={(event) => setMembership(event.target.value)}
            disabled={saving}
          >
            <option value="">Todos los alumnos</option>
            <option value="available">Disponibles para agregar</option>
            <option value="members">Ya pertenecen al grupo</option>
          </select>
        </label>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <p aria-live="polite">
          {filtered.length} de {athletes.length} alumnos
        </p>
        {hasFilters && (
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setQuery('');
              setGroup('');
              setPosition('');
              setMembership('');
            }}
            className="font-semibold text-[#52751d] hover:underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>
      <div
        role="group"
        aria-label="Alumnos disponibles y miembros del grupo"
        className="max-h-64 space-y-2 overflow-y-auto pr-1"
      >
        {filtered.map((athlete) => {
          const already = existing.has(athlete.id),
            checked = selectedSet.has(athlete.id);
          return (
            <button
              key={athlete.id}
              type="button"
              role="checkbox"
              aria-checked={already || checked}
              disabled={already || saving}
              onClick={() =>
                onSelectedChange(
                  checked
                    ? selected.filter((id) => id !== athlete.id)
                    : [...selected, athlete.id],
                )
              }
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${already ? 'border-border bg-muted/45 opacity-70' : checked ? 'border-[#a9d04e] bg-[#f1f7e8]' : 'border-border hover:bg-muted/40'}`}
            >
              <span
                aria-hidden="true"
                className={`grid size-5 shrink-0 place-items-center rounded-md border ${already || checked ? 'border-[#86b31f] bg-[#edf4e1] text-[#52751d]' : 'border-border bg-card'}`}
              >
                {(already || checked) && <Check className="size-3" />}
              </span>
              <span
                aria-hidden="true"
                className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#eef2f5] text-[10px] font-bold text-[#29445e]"
              >
                {`${athlete.firstName[0] ?? ''}${athlete.lastName[0] ?? ''}`.toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {athlete.firstName} {athlete.lastName}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {athlete.primaryPosition || 'Sin posición'} · {athlete.email}
                </span>
              </span>
              {already && (
                <span className="text-[10px] font-semibold text-[#52751d]">
                  Ya pertenece
                </span>
              )}
            </button>
          );
        })}
        {!athletes.length ? (
          <div className="rounded-xl bg-muted/50 p-5 text-center text-sm">
            <p>Todavía no cargaste alumnos. Creá sus fichas en Deportistas.</p>
            <a
              href="/deportistas"
              className="mt-3 inline-block text-xs font-semibold text-[#52751d] hover:underline"
            >
              Ir a Deportistas
            </a>
          </div>
        ) : (
          !filtered.length && (
            <p className="rounded-xl bg-muted/50 p-5 text-center text-sm">
              No hay alumnos que coincidan. Probá cambiando la búsqueda o los
              filtros.
            </p>
          )
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-[#a23f30]">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <div className="text-xs text-muted-foreground">
          <p aria-live="polite">{selected.length} nuevas seleccionadas</p>
          {hidden > 0 && (
            <p>{hidden} fuera de estos filtros; se agregarán también.</p>
          )}
        </div>
        <button
          type="button"
          onClick={onAdd}
          disabled={saving || !selected.length}
          className="flex h-9 items-center gap-2 rounded-xl bg-[#10253d] px-4 text-xs font-semibold text-white disabled:opacity-50"
        >
          {saving ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <UserPlus className="size-3.5" />
          )}{' '}
          Agregar al grupo
        </button>
      </div>
    </div>
  );
}
