'use client';

import { useEffect, useMemo, useState } from 'react';
import { Archive, Building2, Check, ChevronRight, Dumbbell, Globe2, Layers3, LoaderCircle, Plus, Search, Trophy, UserMinus, UserPlus, UsersRound, X } from 'lucide-react';

type Group = {
  id: string;
  name: string;
  sport: 'handball_indoor' | 'beach_handball' | 'general';
  season: string | null;
  organizationId: string;
  organizationName: string;
  organizationType: 'national_team' | 'club' | 'gym' | 'independent';
  memberCount: number;
};

type Athlete = { id: string; firstName: string; lastName: string; email: string; primaryPosition: string | null };
type Membership = Athlete & { groupId: string; athleteId: string; role: string | null };
type GroupsData = { groups: Group[]; athletes: Athlete[]; memberships: Membership[] };

const emptyData: GroupsData = { groups: [], athletes: [], memberships: [] };
const fieldClass = 'h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-[#8fbc29] focus:ring-3 focus:ring-[#b9dc68]/20';

export function GroupsManager() {
  const [data, setData] = useState<GroupsData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [selectedAthletes, setSelectedAthletes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function load(preferredGroupId?: string) {
    setLoading(true);
    try {
      const response = await fetch('/api/groups', { cache: 'no-store' });
      const result = await response.json() as GroupsData & { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'No pudimos cargar los grupos.');
      setData(result);
      setSelectedGroupId((current) => preferredGroupId ?? (result.groups.some((group) => group.id === current) ? current : result.groups[0]?.id ?? ''));
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos cargar los grupos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const selectedGroup = data.groups.find((group) => group.id === selectedGroupId);
  const members = data.memberships.filter((membership) => membership.groupId === selectedGroupId);
  const filteredGroups = data.groups.filter((group) => `${group.name} ${group.organizationName}`.toLowerCase().includes(search.toLowerCase()));
  const uniqueMembers = new Set(data.memberships.map((membership) => membership.athleteId)).size;
  const membershipsPerAthlete = useMemo(() => data.memberships.reduce<Record<string, number>>((totals, membership) => ({ ...totals, [membership.athleteId]: (totals[membership.athleteId] ?? 0) + 1 }), {}), [data.memberships]);
  const multiGroupMembers = Object.values(membershipsPerAthlete).filter((count) => count > 1).length;

  async function action(payload: Record<string, unknown>) {
    const response = await fetch('/api/groups', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json() as { error?: string; groupId?: string };
    if (!response.ok) throw new Error(result.error ?? 'No pudimos guardar los cambios.');
    return result;
  }

  async function createGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const result = await action({ action: 'create', groupName: form.get('groupName'), organizationName: form.get('organizationName'), organizationType: form.get('organizationType'), sport: form.get('sport'), season: form.get('season') });
      setCreateOpen(false);
      await load(result.groupId);
      setSelectedAthletes([]);
      setMembersOpen(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos crear el grupo.');
    } finally {
      setSaving(false);
    }
  }

  async function addMembers() {
    if (!selectedGroup || selectedAthletes.length === 0) return;
    setSaving(true);
    try {
      await action({ action: 'addMembers', groupId: selectedGroup.id, athleteIds: selectedAthletes });
      setMembersOpen(false);
      setSelectedAthletes([]);
      await load(selectedGroup.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos agregar las personas.');
    } finally {
      setSaving(false);
    }
  }

  async function removeMember(athleteId: string) {
    if (!selectedGroup) return;
    try {
      await action({ action: 'removeMember', groupId: selectedGroup.id, athleteId });
      await load(selectedGroup.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos quitar la persona.');
    }
  }

  async function archiveGroup() {
    if (!selectedGroup || !window.confirm(`¿Archivar “${selectedGroup.name}”? Las fichas de los deportistas se conservarán.`)) return;
    try {
      await action({ action: 'archive', groupId: selectedGroup.id });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos archivar el grupo.');
    }
  }

  return (
    <div>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Estructura de trabajo</p><h1 className="mt-1 text-2xl font-bold tracking-[-0.04em] sm:text-[28px]">Grupos y planteles</h1><p className="mt-1 text-sm text-muted-foreground">Organizá personas por equipo, modalidad y temporada.</p></div>
        <button onClick={() => setCreateOpen(true)} className="flex h-10 items-center justify-center gap-2 rounded-xl bg-[#10253d] px-4 text-sm font-semibold text-white transition hover:bg-[#183653]"><Plus className="size-4" /> Nuevo grupo</button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Metric icon={Layers3} label="Grupos activos" value={String(data.groups.length)} detail={`${new Set(data.groups.map((group) => group.organizationId)).size} organizaciones`} />
        <Metric icon={UsersRound} label="Personas asignadas" value={String(uniqueMembers)} detail="Sin duplicar perfiles" />
        <Metric icon={Globe2} label="En más de un grupo" value={String(multiGroupMembers)} detail="Club, selección o gimnasio" />
      </div>

      {error && <div className="mt-4 flex items-center justify-between rounded-xl border border-[#edc5bd] bg-[#fff1ee] px-4 py-3 text-sm text-[#963b2d]"><span>{error}</span><button onClick={() => setError('')} aria-label="Cerrar mensaje"><X className="size-4" /></button></div>}

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(330px,0.72fr)_minmax(520px,1.28fr)]">
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_18px_50px_-42px_#10253d]">
          <div className="border-b border-border p-3"><label className="flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-3 text-muted-foreground"><Search className="size-4" /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Buscar grupo" placeholder="Buscar grupo u organización..." className="w-full bg-transparent text-xs text-foreground outline-none" /></label></div>
          <div className="max-h-[620px] space-y-1.5 overflow-y-auto p-2">
            {loading ? <Loading /> : filteredGroups.length === 0 ? <EmptyGroups onCreate={() => setCreateOpen(true)} /> : filteredGroups.map((group) => (
              <button key={group.id} onClick={() => setSelectedGroupId(group.id)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${selectedGroupId === group.id ? 'border-[#a9d04e] bg-[#f1f7e8]' : 'border-transparent hover:bg-muted/55'}`}>
                <GroupIcon type={group.organizationType} />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{group.name}</span><span className="mt-1 block truncate text-[11px] text-muted-foreground">{group.organizationName} · {sportLabel(group.sport)}</span></span>
                <span className="text-right"><span className="block text-sm font-bold tabular-nums">{group.memberCount}</span><span className="block text-[9px] uppercase tracking-wide text-muted-foreground">personas</span></span><ChevronRight className="size-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>

        <section className="min-h-[480px] overflow-hidden rounded-2xl border border-border bg-card shadow-[0_18px_50px_-42px_#10253d]">
          {!selectedGroup ? <div className="grid h-full min-h-[480px] place-items-center p-8 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground"><UsersRound className="size-5" /></span><p className="mt-4 font-semibold">Seleccioná o creá un grupo</p><p className="mt-1 text-sm text-muted-foreground">Acá vas a administrar su plantel.</p></div></div> : <>
            <div className="border-b border-border bg-[#10253d] p-5 text-white">
              <div className="flex items-start gap-4"><GroupIcon type={selectedGroup.organizationType} inverse /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold tracking-[-0.035em]">{selectedGroup.name}</h2><span className="rounded-full bg-white/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-[#dcefaa]">{sportLabel(selectedGroup.sport)}</span></div><p className="mt-1.5 text-xs text-white/55">{selectedGroup.organizationName}{selectedGroup.season ? ` · Temporada ${selectedGroup.season}` : ''}</p></div><button onClick={archiveGroup} aria-label="Archivar grupo" title="Archivar grupo" className="grid size-9 place-items-center rounded-xl bg-white/8 text-white/60 hover:bg-white/15 hover:text-white"><Archive className="size-4" /></button></div>
            </div>
            <div className="flex items-center justify-between border-b border-border px-5 py-3"><div><p className="text-sm font-semibold">Integrantes</p><p className="text-[11px] text-muted-foreground">Una persona puede estar en varios grupos.</p></div><button onClick={() => { setSelectedAthletes([]); setMembersOpen(true); }} className="flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-semibold hover:bg-muted"><UserPlus className="size-3.5" /> Agregar personas</button></div>
            <div className="divide-y divide-border">
              {members.length === 0 ? <div className="grid min-h-64 place-items-center px-6 text-center"><div><p className="text-sm font-semibold">Todavía no hay integrantes</p><p className="mt-1 text-xs text-muted-foreground">Agregá deportistas existentes sin duplicar sus fichas.</p><button onClick={() => setMembersOpen(true)} className="mt-4 text-xs font-semibold text-[#5f861f] hover:underline">Agregar la primera persona</button></div></div> : members.map((member) => {
                const groupCount = membershipsPerAthlete[member.athleteId] ?? 1;
                return <div key={member.athleteId} className="flex items-center gap-3 px-5 py-3.5"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#eef2f5] text-[11px] font-bold text-[#29445e]">{initials(member.firstName, member.lastName)}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{member.firstName} {member.lastName}</p><p className="mt-0.5 truncate text-[11px] text-muted-foreground">{member.primaryPosition ?? 'Sin posición'} · {member.email}</p></div>{groupCount > 1 && <span className="hidden rounded-full bg-[#fff5dc] px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-[#876016] sm:block">{groupCount} grupos</span>}<a href={`/deportistas/${member.athleteId}`} className="text-xs font-semibold text-[#52751d] hover:underline">Ver ficha</a><button onClick={() => removeMember(member.athleteId)} aria-label={`Quitar a ${member.firstName} del grupo`} title="Quitar del grupo" className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-[#fff0ed] hover:text-[#a23f30]"><UserMinus className="size-3.5" /></button></div>;
              })}
            </div>
          </>}
        </section>
      </div>

      {createOpen && <Modal title="Crear un grupo" description="Podés separar planteles por organización, modalidad y temporada." onClose={() => setCreateOpen(false)}><form onSubmit={createGroup} className="space-y-4"><Field label="Nombre del grupo"><input name="groupName" className={fieldClass} placeholder="Plantel superior" required /></Field><Field label="Organización"><input name="organizationName" className={fieldClass} placeholder="Selección Argentina, nombre del club…" required /></Field><div className="grid grid-cols-2 gap-3"><Field label="Tipo"><select name="organizationType" className={fieldClass} defaultValue="club"><option value="national_team">Selección</option><option value="club">Club</option><option value="gym">Gimnasio</option><option value="independent">Independiente</option></select></Field><Field label="Modalidad"><select name="sport" className={fieldClass} defaultValue="handball_indoor"><option value="handball_indoor">Handball indoor</option><option value="beach_handball">Beach handball</option><option value="general">Preparación general</option></select></Field></div><Field label="Temporada (opcional)"><input name="season" className={fieldClass} placeholder="2026" /></Field>{error && <p className="text-xs font-medium text-[#a23f30]">{error}</p>}<div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setCreateOpen(false)} className="h-9 rounded-xl px-3 text-xs font-semibold hover:bg-muted">Cancelar</button><button type="submit" disabled={saving} className="flex h-9 items-center gap-2 rounded-xl bg-[#10253d] px-4 text-xs font-semibold text-white disabled:opacity-50">{saving ? <LoaderCircle className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Crear grupo</button></div></form></Modal>}

      {membersOpen && selectedGroup && <Modal title={`Agregar a ${selectedGroup.name}`} description="Esta es la lista completa de deportistas cargados. Quienes ya integran el grupo aparecen identificados." onClose={() => setMembersOpen(false)}><div className="max-h-80 space-y-2 overflow-y-auto pr-1">{data.athletes.length === 0 ? <div className="rounded-xl bg-muted/50 p-5 text-center"><p className="text-sm font-semibold">Todavía no cargaste deportistas</p><p className="mt-1 text-xs text-muted-foreground">Creá sus fichas y luego vas a poder elegirlos desde esta lista.</p><a href="/deportistas" className="mt-3 inline-block text-xs font-semibold text-[#52751d] hover:underline">Ir a Deportistas</a></div> : data.athletes.map((athlete) => { const checked = selectedAthletes.includes(athlete.id); const alreadyMember = members.some((member) => member.athleteId === athlete.id); return <button key={athlete.id} type="button" disabled={alreadyMember} onClick={() => setSelectedAthletes((current) => checked ? current.filter((id) => id !== athlete.id) : [...current, athlete.id])} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${alreadyMember ? 'cursor-default border-border bg-muted/45 opacity-70' : checked ? 'border-[#a9d04e] bg-[#f1f7e8]' : 'border-border hover:bg-muted/40'}`}><span className={`grid size-5 place-items-center rounded-md border ${alreadyMember ? 'border-[#a9d04e] bg-[#edf4e1] text-[#52751d]' : checked ? 'border-[#86b31f] bg-[#9fcf2d] text-[#10253d]' : 'border-border bg-card'}`}>{(checked || alreadyMember) && <Check className="size-3" />}</span><span className="grid size-8 place-items-center rounded-lg bg-[#eef2f5] text-[10px] font-bold text-[#29445e]">{initials(athlete.firstName, athlete.lastName)}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{athlete.firstName} {athlete.lastName}</span><span className="block truncate text-[11px] text-muted-foreground">{athlete.primaryPosition ?? 'Sin posición'} · {athlete.email}</span></span>{alreadyMember && <span className="text-[10px] font-semibold text-[#52751d]">Ya pertenece</span>}</button>; })}</div><div className="mt-5 flex items-center justify-between border-t border-border pt-4"><p className="text-xs text-muted-foreground">{selectedAthletes.length} nuevas seleccionadas</p><button onClick={addMembers} disabled={saving || selectedAthletes.length === 0} className="flex h-9 items-center gap-2 rounded-xl bg-[#10253d] px-4 text-xs font-semibold text-white disabled:opacity-50">{saving ? <LoaderCircle className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />} Agregar al grupo</button></div></Modal>}
    </div>
  );
}

function Modal({ title, description, children, onClose }: { title: string; description: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#07131f]/55 p-4 backdrop-blur-sm"><div role="dialog" aria-modal="true" aria-labelledby="group-dialog-title" className="w-full max-w-lg rounded-[22px] border border-border bg-card p-5 shadow-2xl sm:p-6"><div className="flex items-start gap-4"><div className="flex-1"><h2 id="group-dialog-title" className="text-lg font-bold tracking-[-0.03em]">{title}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p></div><button onClick={onClose} aria-label="Cerrar" className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted"><X className="size-4" /></button></div><div className="mt-5">{children}</div></div></div>;
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof Layers3; label: string; value: string; detail: string }) {
  return <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4"><span className="grid size-10 place-items-center rounded-xl bg-[#edf4e1] text-[#52751d]"><Icon className="size-4" /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</p><p className="mt-0.5 text-xl font-bold tracking-tight">{value} <span className="text-[10px] font-normal text-muted-foreground">{detail}</span></p></div></div>;
}

function GroupIcon({ type, inverse = false }: { type: Group['organizationType']; inverse?: boolean }) {
  const Icon = type === 'national_team' ? Trophy : type === 'gym' ? Dumbbell : type === 'independent' ? Globe2 : Building2;
  return <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${inverse ? 'bg-white/10 text-[#c8f15a]' : 'bg-[#edf4e1] text-[#52751d]'}`}><Icon className="size-4" /></span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1.5"><span className="text-xs font-semibold">{label}</span>{children}</label>; }
function Loading() { return <div className="grid min-h-52 place-items-center text-muted-foreground"><LoaderCircle className="size-5 animate-spin" /></div>; }
function EmptyGroups({ onCreate }: { onCreate: () => void }) { return <div className="px-5 py-12 text-center"><span className="mx-auto grid size-11 place-items-center rounded-2xl bg-muted text-muted-foreground"><UsersRound className="size-5" /></span><p className="mt-4 text-sm font-semibold">Todavía no hay grupos</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Creá el primer plantel para empezar a organizar personas.</p><button onClick={onCreate} className="mt-4 text-xs font-semibold text-[#52751d] hover:underline">Crear primer grupo</button></div>; }
function sportLabel(sport: Group['sport']) { return sport === 'beach_handball' ? 'Beach handball' : sport === 'handball_indoor' ? 'Handball indoor' : 'General'; }
function initials(firstName: string, lastName: string) { return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase(); }
