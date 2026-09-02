import { ArrowUpRight, CalendarRange, Copy, FileSpreadsheet, MoreHorizontal, Plus, Users } from 'lucide-react';

import { AppShell } from '@/components/nexo/app-shell';
import { Badge } from '@/components/ui/badge';
import { buttonVariants, Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const routines = [
  { name: 'Competitivo 1 · Full Body', group: 'Selección Beach', cycle: 'Semanas 12–15', sessions: '4 sesiones', assigned: '18 deportistas', status: 'En curso', color: 'lime' },
  { name: 'Fuerza estructural · Superior', group: 'Club · Plantel superior', cycle: 'Semanas 8–11', sessions: '3 sesiones', assigned: '22 deportistas', status: 'En curso', color: 'blue' },
  { name: 'Reintegro rodilla · Fase 3', group: 'Asignación individual', cycle: '6 semanas', sessions: '3 sesiones', assigned: 'Tomás Silva', status: 'Individual', color: 'amber' },
  { name: 'Base internacional · Septiembre', group: 'Clientes internacionales', cycle: '4 semanas', sessions: '4 sesiones', assigned: '9 deportistas', status: 'Borrador', color: 'slate' },
];

export default function RoutinesPage() {
  return (
    <AppShell active="rutinas">
      <div className="mx-auto max-w-[1500px] px-5 py-6 sm:px-7 lg:px-9 lg:py-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Planificación</p><h1 className="mt-1 text-2xl font-bold tracking-[-0.04em] sm:text-[28px]">Rutinas</h1><p className="mt-1 text-sm text-muted-foreground">Creá una base, asignala al grupo y adaptala por persona.</p></div>
          <div className="flex gap-2"><Button variant="outline" className="h-9 rounded-xl"><FileSpreadsheet /> Importar Excel</Button><a href="/rutinas/nueva" className={cn(buttonVariants({ size: 'lg' }), 'h-9 rounded-xl bg-[#10253d] px-3.5 text-white hover:bg-[#183653]')}><Plus className="size-4" /> Nueva rutina</a></div>
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <Stat label="Rutinas activas" value="8" icon={CalendarRange} />
          <Stat label="Asignaciones vigentes" value="67" icon={Users} />
          <Stat label="Plantillas propias" value="14" icon={Copy} />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {routines.map((routine) => (
            <Card key={routine.name} className="border-none bg-card ring-1 ring-border shadow-[0_18px_50px_-42px_#10253d] transition hover:-translate-y-0.5 hover:shadow-[0_22px_58px_-38px_#10253d]">
              <CardHeader>
                <div className={`mb-2 h-1.5 w-12 rounded-full ${routine.color === 'lime' ? 'bg-[#9fcf2d]' : routine.color === 'blue' ? 'bg-[#5c7f9e]' : routine.color === 'amber' ? 'bg-[#e8ad35]' : 'bg-[#9ba8b2]'}`} />
                <CardTitle className="text-[15px] font-bold">{routine.name}</CardTitle><CardDescription className="text-xs">{routine.group}</CardDescription>
                <CardAction><Button variant="ghost" size="icon-sm" aria-label="Más opciones"><MoreHorizontal /></Button></CardAction>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3 rounded-xl bg-muted/45 p-3 text-[11px]"><div><p className="text-muted-foreground">Ciclo</p><p className="mt-1 font-semibold">{routine.cycle}</p></div><div><p className="text-muted-foreground">Frecuencia</p><p className="mt-1 font-semibold">{routine.sessions}</p></div><div><p className="text-muted-foreground">Asignada a</p><p className="mt-1 truncate font-semibold">{routine.assigned}</p></div></div>
                <div className="mt-4 flex items-center justify-between"><Badge variant="outline" className={routine.status === 'En curso' ? 'border-[#cfe0ac] bg-[#f1f7e8] text-[#52751d]' : routine.status === 'Borrador' ? 'bg-muted/50' : 'border-[#ead4a1] bg-[#fff8e8] text-[#876016]'}>{routine.status}</Badge><a href="/rutinas/nueva" className="flex items-center gap-1 text-xs font-semibold text-[#29445e] hover:underline">Abrir planificación <ArrowUpRight className="size-3.5" /></a></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof CalendarRange }) {
  return <Card className="border-none bg-card ring-1 ring-border"><CardContent className="flex items-center gap-4"><span className="grid size-10 place-items-center rounded-xl bg-[#eef2f5] text-[#29445e]"><Icon className="size-4" /></span><div><p className="text-2xl font-bold tracking-tight">{value}</p><p className="text-[11px] text-muted-foreground">{label}</p></div></CardContent></Card>;
}
