'use client';
import { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { scheduleDate } from '@/lib/routine-schedule';

type Target = {
  id: string;
  name: string;
  detail: string;
  type: 'group' | 'athlete';
};
export function RoutineQuickAssign({
  routineId,
  routineName,
  onAssigned,
}: {
  routineId: string;
  routineName: string;
  onAssigned: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<Target[]>([]);
  const [selected, setSelected] = useState('');
  const [query, setQuery] = useState('');
  const [startsOn, setStartsOn] = useState(scheduleDate().dateKey);
  const [endsOn, setEndsOn] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function show() {
    setOpen(true);
    setLoading(true);
    setError('');
    setSelected('');
    setQuery('');
    try {
      const response = await fetch('/api/groups', { cache: 'no-store' });
      const data = (await response.json()) as {
        error?: string;
        groups?: { id: string; name: string; organizationName: string }[];
        athletes?: {
          id: string;
          firstName: string;
          lastName: string;
          email: string;
        }[];
      };
      if (!response.ok)
        throw new Error(data.error || 'No pudimos cargar los destinatarios.');
      setTargets([
        ...(data.groups ?? []).map((g) => ({
          id: `group:${g.id}`,
          name: g.name,
          detail: g.organizationName,
          type: 'group' as const,
        })),
        ...(data.athletes ?? []).map((a) => ({
          id: `athlete:${a.id}`,
          name: `${a.firstName} ${a.lastName}`,
          detail: a.email,
          type: 'athlete' as const,
        })),
      ]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'No pudimos cargar los destinatarios.',
      );
    } finally {
      setLoading(false);
    }
  }
  async function assign() {
    const target = targets.find((t) => t.id === selected);
    if (!target) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/routines', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'assign',
          routineId,
          targetType: target.type,
          targetId: target.id.slice(target.id.indexOf(':') + 1),
          startsOn,
          endsOn: endsOn || null,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || 'No pudimos asignar la rutina.');
      setOpen(false);
      onAssigned();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'No pudimos asignar la rutina.',
      );
    } finally {
      setBusy(false);
    }
  }
  const search = query
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  const filtered = targets.filter((t) =>
    `${t.name} ${t.detail}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .includes(search),
  );
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => void show()}>
        <Send /> Asignar
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Asignar rutina</DialogTitle>
            <DialogDescription>
              {routineName} · Elegí un grupo o una persona. Se asignará la
              última versión guardada.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Buscar destinatario"
            placeholder="Buscar grupo, persona o email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={busy}
          />
          <div
            className="max-h-60 space-y-2 overflow-y-auto"
            role="radiogroup"
            aria-label="Destinatarios"
          >
            {loading ? (
              <p role="status">Cargando destinatarios…</p>
            ) : (
              filtered.map((target) => (
                <label
                  key={target.id}
                  className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${selected === target.id ? 'border-[#9fcf2d] bg-[#f1f7e8]' : ''}`}
                >
                  <input
                    type="radio"
                    name={`target-${routineId}`}
                    checked={selected === target.id}
                    onChange={() => setSelected(target.id)}
                    disabled={busy}
                  />
                  <span className="min-w-0 text-sm">
                    <strong className="block">{target.name}</strong>
                    <span className="block break-words text-muted-foreground">
                      {target.type === 'group' ? 'Grupo' : 'Persona'} ·{' '}
                      {target.detail}
                    </span>
                  </span>
                </label>
              ))
            )}
            {!loading && !filtered.length && (
              <p className="text-sm text-muted-foreground">
                No hay destinatarios que coincidan. Cargá personas o grupos, o
                probá otra búsqueda.
              </p>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">
              Comienza
              <Input
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
                disabled={busy}
              />
            </label>
            <label className="text-sm font-semibold">
              Finaliza (opcional)
              <Input
                type="date"
                min={startsOn}
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
                disabled={busy}
              />
            </label>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              disabled={
                busy ||
                loading ||
                !selected ||
                !startsOn ||
                Boolean(endsOn && endsOn < startsOn)
              }
              onClick={() => void assign()}
            >
              {busy ? 'Asignando…' : 'Asignar ahora'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
