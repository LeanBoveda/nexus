import { ArrowUpRight, ChevronDown, Filter, Search, Users } from 'lucide-react';

import { AppShell } from '@/components/nexo/app-shell';
import { NewAthleteDialog } from '@/components/nexo/new-athlete-dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const athletes = [
  { id: 'lucia-mendez', initials: 'LM', name: 'Lucía Méndez', role: 'Lateral', group: 'Selección Beach', mode: 'Beach', status: 'Disponible', adherence: '92%', activity: 'Hoy, 08:42' },
  { id: 'tomas-silva', initials: 'TS', name: 'Tomás Silva', role: 'Pivote', group: 'Club · Superior', mode: 'Indoor', status: 'Adaptado', adherence: '78%', activity: 'Ayer, 19:14' },
  { id: 'martina-ruiz', initials: 'MR', name: 'Martina Ruiz', role: 'Extremo', group: 'Selección Beach', mode: 'Ambas', status: 'Seguimiento', adherence: '64%', activity: 'Hace 5 días' },
  { id: 'agustin-ferreyra', initials: 'AF', name: 'Agustín Ferreyra', role: 'Arquero', group: 'Club · Superior', mode: 'Indoor', status: 'Disponible', adherence: '88%', activity: 'Hoy, 07:50' },
  { id: 'valentina-costa', initials: 'VC', name: 'Valentina Costa', role: 'Especialista', group: 'Selección Beach', mode: 'Beach', status: 'Disponible', adherence: '95%', activity: 'Ayer, 21:03' },
  { id: 'nicolas-rojas', initials: 'NR', name: 'Nicolás Rojas', role: 'Central', group: 'Internacionales', mode: 'Indoor', status: 'Disponible', adherence: '81%', activity: 'Hoy, 06:17' },
];

export default function AthletesPage() {
  return (
    <AppShell active="deportistas">
      <div className="mx-auto max-w-[1500px] px-5 py-6 sm:px-7 lg:px-9 lg:py-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Base de deportistas</p><h1 className="mt-1 text-2xl font-bold tracking-[-0.04em] sm:text-[28px]">Deportistas</h1><p className="mt-1 text-sm text-muted-foreground">Una sola ficha, todos sus contextos deportivos.</p></div>
          <NewAthleteDialog />
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Summary label="Activos" value="84" detail="En 4 organizaciones" />
          <Summary label="Beach + indoor" value="19" detail="Perfiles de doble modalidad" />
          <Summary label="Sin actividad reciente" value="7" detail="Requieren seguimiento" alert />
        </div>

        <Card className="mt-4 border-none bg-card py-0 ring-1 ring-border shadow-[0_18px_50px_-42px_#10253d]">
          <div className="flex flex-col gap-3 border-b border-border px-4 py-3.5 sm:flex-row sm:items-center">
            <label className="flex h-9 flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3 text-muted-foreground sm:max-w-sm"><Search className="size-4" /><input aria-label="Buscar deportista" placeholder="Buscar por nombre o grupo..." className="w-full bg-transparent text-xs text-foreground outline-none" /></label>
            <div className="flex gap-2 sm:ml-auto"><Button variant="outline" className="h-9 rounded-xl"><Users /> Todos los grupos <ChevronDown /></Button><Button variant="outline" className="h-9 rounded-xl"><Filter /> Filtros</Button></div>
          </div>
          <CardContent className="px-0">
            <Table>
              <TableHeader><TableRow className="bg-muted/35 hover:bg-muted/35"><TableHead className="pl-4 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Deportista</TableHead><TableHead className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Grupo</TableHead><TableHead className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Modalidad</TableHead><TableHead className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Estado</TableHead><TableHead className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Adherencia</TableHead><TableHead className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Última actividad</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {athletes.map((athlete) => (
                  <TableRow key={athlete.id}>
                    <TableCell className="pl-4"><div className="flex items-center gap-3"><Avatar className="size-9"><AvatarFallback className="bg-[#eef2f5] text-[11px] font-bold text-[#29445e]">{athlete.initials}</AvatarFallback></Avatar><div><p className="text-[13px] font-semibold">{athlete.name}</p><p className="text-[11px] text-muted-foreground">{athlete.role}</p></div></div></TableCell>
                    <TableCell className="text-xs">{athlete.group}</TableCell>
                    <TableCell><Badge variant="outline" className="bg-muted/40">{athlete.mode}</Badge></TableCell>
                    <TableCell><Badge variant="outline" className={athlete.status === 'Disponible' ? 'border-[#cfe0ac] bg-[#f1f7e8] text-[#52751d]' : athlete.status === 'Adaptado' ? 'border-[#ead4a1] bg-[#fff8e8] text-[#876016]' : 'border-[#d8e0e6] bg-[#f4f7f8] text-[#526573]'}>{athlete.status}</Badge></TableCell>
                    <TableCell className="font-semibold tabular-nums">{athlete.adherence}</TableCell><TableCell className="text-xs text-muted-foreground">{athlete.activity}</TableCell>
                    <TableCell className="pr-4 text-right"><a href={`/deportistas/${athlete.id}`} aria-label={`Abrir perfil de ${athlete.name}`} className="inline-grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><ArrowUpRight className="size-4" /></a></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function Summary({ label, value, detail, alert = false }: { label: string; value: string; detail: string; alert?: boolean }) {
  return <Card className="border-none bg-card ring-1 ring-border"><CardContent className="flex items-end justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-bold tracking-[-0.05em]">{value}</p></div><span className={alert ? 'text-[11px] text-[#b34231]' : 'text-[11px] text-muted-foreground'}>{detail}</span></CardContent></Card>;
}
