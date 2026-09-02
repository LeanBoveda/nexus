'use client';

import { useEffect, useState } from 'react';
import { Check, Plus, UserPlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

export function NewAthleteDialog() {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [groups, setGroups] = useState<Array<{ id: string; name: string; organizationName: string }>>([]);

  useEffect(() => {
    fetch('/api/groups')
      .then((response) => response.ok ? response.json() : { groups: [] })
      .then((result: { groups?: Array<{ id: string; name: string; organizationName: string }> }) => setGroups(result.groups ?? []))
      .catch(() => setGroups([]));
  }, []);

  async function createAthlete(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch('/api/athletes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          firstName: form.get('firstName'),
          lastName: form.get('lastName'),
          email: form.get('email'),
          groupId: form.get('groupId'),
          position: form.get('position'),
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'No pudimos guardar el deportista.');
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos guardar el deportista.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog onOpenChange={(open) => !open && setSaved(false)}>
      <DialogTrigger render={<Button className="h-9 rounded-xl bg-[#10253d] px-3.5 text-white hover:bg-[#183653]" />}>
        <Plus /> Nuevo deportista
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        {saved ? (
          <div className="grid min-h-64 place-items-center px-8 text-center">
            <div>
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#edf4e1] text-[#52751d]"><Check className="size-5" /></span>
              <DialogTitle className="mt-4 text-lg">Deportista agregado</DialogTitle>
              <DialogDescription className="mt-2">El perfil quedó guardado y listo para generar su acceso seguro sin contraseña.</DialogDescription>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <span className="mb-1 grid size-9 place-items-center rounded-xl bg-[#edf4e1] text-[#52751d]"><UserPlus className="size-4" /></span>
              <DialogTitle>Agregar deportista</DialogTitle>
              <DialogDescription>Completá los datos básicos. Podrás ampliar el perfil más adelante.</DialogDescription>
            </DialogHeader>
            <form className="grid gap-4 py-2" onSubmit={createAthlete}>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label htmlFor="first-name">Nombre</Label><Input id="first-name" name="firstName" placeholder="Nombre" required /></div>
                <div className="space-y-1.5"><Label htmlFor="last-name">Apellido</Label><Input id="last-name" name="lastName" placeholder="Apellido" required /></div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="athlete-email">Email</Label><Input id="athlete-email" name="email" type="email" placeholder="jugador@email.com" required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label htmlFor="group">Grupo</Label><NativeSelect id="group" name="groupId" defaultValue=""><NativeSelectOption value="">Sin grupo por ahora</NativeSelectOption>{groups.map((group) => <NativeSelectOption key={group.id} value={group.id}>{group.organizationName} · {group.name}</NativeSelectOption>)}</NativeSelect>{groups.length === 0 && <a href="/grupos" className="text-[10px] font-semibold text-[#52751d] hover:underline">Crear un grupo primero</a>}</div>
                <div className="space-y-1.5"><Label htmlFor="position">Posición / rol</Label><NativeSelect id="position" name="position" defaultValue="Lateral"><NativeSelectOption value="Lateral">Lateral</NativeSelectOption><NativeSelectOption value="Extremo">Extremo</NativeSelectOption><NativeSelectOption value="Central">Central</NativeSelectOption><NativeSelectOption value="Pivote">Pivote</NativeSelectOption><NativeSelectOption value="Arquero">Arquero</NativeSelectOption><NativeSelectOption value="Especialista beach">Especialista beach</NativeSelectOption></NativeSelect></div>
              </div>
              {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{error}</p>}
              <DialogFooter className="mt-2"><Button type="submit" disabled={saving} className="bg-[#10253d] text-white hover:bg-[#183653]">{saving ? 'Guardando…' : 'Agregar deportista'}</Button></DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
