import {
  ArrowUpRight,
  ClipboardCheck,
  ClipboardPlus,
  Clock3,
  Gauge,
  MoreHorizontal,
  TimerReset,
  TriangleAlert,
  UserRoundCheck,
  Users,
  Zap,
} from 'lucide-react';

import { AppShell } from '@/components/nexo/app-shell';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { buttonVariants, Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

const attentionItems = [
  { id: 'lucia-mendez', initials: 'LM', name: 'Lucía Méndez', detail: 'PSE mayor al esperado en 3 sesiones', tag: 'Revisar carga', tone: 'amber' },
  { id: 'tomas-silva', initials: 'TS', name: 'Tomás Silva', detail: 'Reportó molestia en hombro derecho', tag: 'Molestia', tone: 'red' },
  { id: 'martina-ruiz', initials: 'MR', name: 'Martina Ruiz', detail: 'Sin registrar actividad hace 5 días', tag: 'Seguimiento', tone: 'slate' },
];

const schedule = [
  { time: '09:00', title: 'Fuerza · Plantel beach', meta: '18 deportistas · Arena' },
  { time: '11:30', title: 'Evaluaciones U21', meta: 'Sprint 15 m + CMJ' },
  { time: '17:00', title: 'Gimnasio · Grupo tarde', meta: '8 deportistas · Fuerza' },
];

export default function Home() {
  return (
    <AppShell active="inicio">
      <div className="mx-auto max-w-[1500px] px-5 py-6 sm:px-7 lg:px-9 lg:py-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span>Martes, 1 de septiembre</span><span className="size-1 rounded-full bg-border" /><span>Semana competitiva 3</span>
            </div>
            <h1 className="text-2xl font-bold tracking-[-0.04em] sm:text-[28px]">Buen día, Manuel</h1>
            <p className="mt-1 text-sm text-muted-foreground">Tu operación deportiva, ordenada para hoy.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/evaluaciones" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-9 rounded-xl bg-card')}><ClipboardPlus className="size-4" /> Cargar evaluación</a>
            <a href="/deportistas" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-9 rounded-xl bg-card')}><UserRoundCheck className="size-4" /> Nuevo deportista</a>
          </div>
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border-none bg-[#10253d] text-white ring-0 shadow-[0_20px_50px_-34px_#10253d]">
            <CardHeader>
              <CardDescription className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">Deportistas activos</CardDescription>
              <CardAction className="grid size-8 place-items-center rounded-lg bg-white/10"><Users className="size-4 text-[#c8f15a]" /></CardAction>
            </CardHeader>
            <CardContent><div className="flex items-end justify-between"><span className="text-3xl font-bold tracking-[-0.06em]">84</span><span className="mb-1 flex items-center gap-1 text-[11px] text-[#c8f15a]"><ArrowUpRight className="size-3" /> 6 este mes</span></div></CardContent>
          </Card>
          <MetricCard icon={Gauge} label="Cumplimiento semanal" value="86%" detail="+4,2% vs. semana anterior" accent="lime" />
          <MetricCard icon={ClipboardCheck} label="Evaluaciones pendientes" value="12" detail="5 llevan más de 30 días" accent="amber" />
          <MetricCard icon={TriangleAlert} label="Requieren atención" value="7" detail="2 molestias nuevas hoy" accent="coral" />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(330px,0.75fr)]">
          <Card className="border-none bg-card ring-1 ring-border shadow-[0_18px_50px_-42px_#10253d]">
            <CardHeader className="border-b border-border/70 pb-4">
              <CardTitle className="text-[15px] font-bold tracking-tight">Requieren atención</CardTitle>
              <CardDescription className="text-xs">Señales recientes que conviene revisar</CardDescription>
              <CardAction><a href="/deportistas" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Ver todos</a></CardAction>
            </CardHeader>
            <CardContent className="divide-y divide-border/70 px-0">
              {attentionItems.map((item) => (
                <a key={item.name} href={`/deportistas/${item.id}`} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-muted/40">
                  <Avatar className="size-9"><AvatarFallback className="bg-[#eef2f5] text-[11px] font-bold text-[#29445e]">{item.initials}</AvatarFallback></Avatar>
                  <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold">{item.name}</p><p className="mt-0.5 truncate text-[11px] text-muted-foreground">{item.detail}</p></div>
                  <Badge variant="outline" className={item.tone === 'red' ? 'border-[#f2b9ae] bg-[#fff2ef] text-[#b34231]' : item.tone === 'amber' ? 'border-[#ead4a1] bg-[#fff8e8] text-[#876016]' : 'border-[#d8e0e6] bg-[#f4f7f8] text-[#526573]'}>{item.tag}</Badge>
                  <ArrowUpRight className="size-3.5 text-muted-foreground" />
                </a>
              ))}
            </CardContent>
          </Card>

          <Card className="border-none bg-card ring-1 ring-border shadow-[0_18px_50px_-42px_#10253d]">
            <CardHeader className="border-b border-border/70 pb-4">
              <CardTitle className="text-[15px] font-bold tracking-tight">Agenda de hoy</CardTitle><CardDescription className="text-xs">3 actividades programadas</CardDescription>
              <CardAction><Button variant="ghost" size="icon-sm" aria-label="Más opciones"><MoreHorizontal /></Button></CardAction>
            </CardHeader>
            <CardContent className="space-y-1 px-3">
              {schedule.map((item, index) => (
                <div key={item.time} className="grid grid-cols-[48px_1fr] gap-3 rounded-xl px-2 py-2.5 hover:bg-muted/50">
                  <div className="pt-0.5 text-[11px] font-semibold text-muted-foreground">{item.time}</div>
                  <div className="relative border-l border-border pl-3"><span className={`absolute -left-[4.5px] top-1 size-2 rounded-full ring-2 ring-card ${index === 0 ? 'bg-[#9fcf2d]' : index === 1 ? 'bg-[#e8ad35]' : 'bg-[#5c7f9e]'}`} /><p className="text-[12px] font-semibold">{item.title}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{item.meta}</p></div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card className="border-none bg-[#edf4e1] ring-0">
            <CardContent className="grid gap-5 py-1 sm:grid-cols-[1fr_auto] sm:items-center">
              <div><div className="mb-2 flex items-center gap-2"><span className="grid size-7 place-items-center rounded-lg bg-[#d9ecae] text-[#3f6110]"><Zap className="size-3.5" /></span><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#52751d]">Progreso destacado</span></div><p className="text-sm font-bold text-[#21320e]">Plantel Beach · Potencia de salto</p><p className="mt-1 max-w-md text-xs leading-relaxed text-[#587034]">El promedio de CMJ mejoró 6,8% desde la primera concentración.</p></div>
              <div className="flex items-center gap-3"><span className="text-[32px] font-bold tracking-[-0.06em] text-[#3f6110]">+6,8%</span><a href="/evaluaciones" aria-label="Ver evaluación" className={cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'border-[#c5db99] bg-white/65 text-[#3f6110] hover:bg-white')}><ArrowUpRight /></a></div>
            </CardContent>
          </Card>
          <Card className="border-none bg-card ring-1 ring-border">
            <CardHeader><CardTitle className="text-[14px] font-bold">Carga del plantel</CardTitle><CardDescription className="text-xs">Sesiones completadas esta semana</CardDescription><CardAction><Badge variant="outline" className="bg-muted/50">Selección Beach</Badge></CardAction></CardHeader>
            <CardContent><div className="flex items-end justify-between gap-4"><div><span className="text-2xl font-bold tracking-tight">42 / 48</span><p className="mt-1 text-[11px] text-muted-foreground">6 registros pendientes</p></div><div className="flex items-center gap-1.5 text-[11px] font-medium text-[#58751a]"><TimerReset className="size-3.5" /> 87,5%</div></div><Progress value={87.5} className="mt-4 [&_[data-slot=progress-indicator]]:bg-[#9fcf2d] [&_[data-slot=progress-track]]:h-2" /></CardContent>
          </Card>
        </div>
        <div className="mt-5 flex items-center justify-between border-t border-border/70 pt-4 text-[11px] text-muted-foreground"><span>Última actualización hace 4 minutos</span><span className="flex items-center gap-1.5"><Clock3 className="size-3" /> Zona horaria: Buenos Aires</span></div>
      </div>
    </AppShell>
  );
}

function MetricCard({ icon: Icon, label, value, detail, accent }: { icon: typeof Gauge; label: string; value: string; detail: string; accent: 'lime' | 'amber' | 'coral' }) {
  const styles = { lime: 'bg-[#edf4e1] text-[#52751d]', amber: 'bg-[#fff5dc] text-[#9a6b12]', coral: 'bg-[#fff0ec] text-[#c14d38]' };
  return <Card className="border-none bg-card ring-1 ring-border shadow-[0_18px_50px_-42px_#10253d]"><CardHeader><CardDescription className="text-[11px] font-semibold uppercase tracking-[0.11em]">{label}</CardDescription><CardAction className={`grid size-8 place-items-center rounded-lg ${styles[accent]}`}><Icon className="size-4" /></CardAction></CardHeader><CardContent><span className="text-3xl font-bold tracking-[-0.06em]">{value}</span><p className="mt-2 text-[11px] text-muted-foreground">{detail}</p></CardContent></Card>;
}
