import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, Dumbbell, Mail, MapPin, MoreHorizontal, ShieldCheck } from 'lucide-react';

import { AppShell } from '@/components/nexo/app-shell';
import { EvaluationDashboard } from '@/components/nexo/evaluation-dashboard';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const people: Record<string, { name: string; initials: string; role: string; groups: string[]; city: string; email: string }> = {
  'lucia-mendez': { name: 'Lucía Méndez', initials: 'LM', role: 'Lateral derecho', groups: ['Selección Beach', 'Club · Superior'], city: 'Buenos Aires, AR', email: 'lucia.mendez@nexo.demo' },
  'tomas-silva': { name: 'Tomás Silva', initials: 'TS', role: 'Pivote', groups: ['Club · Superior'], city: 'Córdoba, AR', email: 'tomas.silva@nexo.demo' },
  'martina-ruiz': { name: 'Martina Ruiz', initials: 'MR', role: 'Extremo izquierdo', groups: ['Selección Beach', 'Gimnasio'], city: 'Rosario, AR', email: 'martina.ruiz@nexo.demo' },
  'agustin-ferreyra': { name: 'Agustín Ferreyra', initials: 'AF', role: 'Arquero', groups: ['Club · Superior'], city: 'Buenos Aires, AR', email: 'agustin.ferreyra@nexo.demo' },
  'valentina-costa': { name: 'Valentina Costa', initials: 'VC', role: 'Especialista beach', groups: ['Selección Beach'], city: 'Mendoza, AR', email: 'valentina.costa@nexo.demo' },
  'nicolas-rojas': { name: 'Nicolás Rojas', initials: 'NR', role: 'Central', groups: ['Internacionales'], city: 'Madrid, ES', email: 'nicolas.rojas@nexo.demo' },
};

export default async function AthleteProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const athlete = people[id] ?? people['lucia-mendez'];
  return (
    <AppShell active="deportistas">
      <div className="mx-auto max-w-[1500px] px-5 py-6 sm:px-7 lg:px-9 lg:py-8">
        <div className="flex flex-col gap-5 border-b border-border pb-6 xl:flex-row xl:items-center">
          <div className="flex items-center gap-4"><a href="/deportistas" className="grid size-9 place-items-center rounded-xl border border-border bg-card hover:bg-muted" aria-label="Volver a deportistas"><ArrowLeft className="size-4" /></a><Avatar className="size-14"><AvatarFallback className="bg-[#dce6ee] text-sm font-bold text-[#10253d]">{athlete.initials}</AvatarFallback></Avatar><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold tracking-[-0.04em]">{athlete.name}</h1><Badge variant="outline" className="border-[#cfe0ac] bg-[#f1f7e8] text-[#52751d]">Disponible</Badge></div><p className="mt-1 text-sm text-muted-foreground">{athlete.role} · Handball indoor y beach</p></div></div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-muted-foreground xl:ml-auto"><span className="flex items-center gap-1.5"><MapPin className="size-3.5" />{athlete.city}</span><span className="flex items-center gap-1.5"><Mail className="size-3.5" />{athlete.email}</span><span className="flex items-center gap-1.5"><ShieldCheck className="size-3.5" />Acceso activado</span></div>
          <Button variant="outline" size="icon" aria-label="Más opciones"><MoreHorizontal /></Button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MiniMetric label="Adherencia" value="92%" detail="Últimos 28 días" tone="lime" />
          <MiniMetric label="PSE promedio" value="6,4" detail="Objetivo: 6,0" tone="amber" />
          <MiniMetric label="Última evaluación" value="28 Ago" detail="5 tests registrados" />
          <MiniMetric label="Próxima sesión" value="Hoy 09:00" detail="Fuerza · Beach" />
        </div>

        <Tabs defaultValue="overview" className="mt-6">
          <TabsList variant="line"><TabsTrigger value="overview">Resumen</TabsTrigger><TabsTrigger value="evaluations">Evaluaciones</TabsTrigger><TabsTrigger value="routines">Rutinas</TabsTrigger><TabsTrigger value="history">Historial</TabsTrigger></TabsList>
          <TabsContent value="overview" className="mt-5">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
              <Card className="border-none bg-card ring-1 ring-border">
                <CardHeader><CardTitle className="text-[15px] font-bold">Planificación actual</CardTitle><CardDescription>Competitivo 1 · Día A Full Body</CardDescription><CardAction><Badge className="bg-[#10253d] text-white">Semana 14 · Carga</Badge></CardAction></CardHeader>
                <CardContent className="space-y-3">
                  {[['Arranque desde cajón', '3 / 3 / 3', 'RIR 3'], ['Caminata con trineo', '12 + 12 m', 'Unilateral'], ['Peso muerto', '4 / 4 / 3', 'RIR 3'], ['Sprint con chaleco', '15 m', '8 kg']].map((exercise, index) => <div key={exercise[0]} className="flex items-center gap-3 rounded-xl border border-border p-3"><span className="grid size-8 place-items-center rounded-lg bg-[#eef2f5] text-[11px] font-bold text-[#29445e]">{String.fromCharCode(65 + Math.floor(index / 2))}{index + 1}</span><div className="flex-1"><p className="text-[12px] font-semibold">{exercise[0]}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{exercise[2]}</p></div><span className="text-sm font-bold tabular-nums">{exercise[1]}</span></div>)}
                  <div className="flex items-center justify-between pt-2"><div><p className="text-[11px] text-muted-foreground">PSE esperado</p><p className="mt-1 font-bold">6 · Duro</p></div><Button className="bg-[#10253d] text-white hover:bg-[#183653]"><Dumbbell /> Abrir rutina completa</Button></div>
                </CardContent>
              </Card>
              <div className="space-y-4">
                <Card className="border-none bg-[#10253d] text-white ring-0"><CardHeader><CardTitle className="text-[14px] font-bold">Estado semanal</CardTitle><CardDescription className="text-white/50">3 de 4 sesiones completadas</CardDescription><CardAction><CheckCircle2 className="size-5 text-[#c8f15a]" /></CardAction></CardHeader><CardContent><div className="flex items-end justify-between"><span className="text-3xl font-bold">75%</span><span className="text-[11px] text-white/50">1 pendiente</span></div><Progress value={75} className="mt-4 [&_[data-slot=progress-track]]:h-2 [&_[data-slot=progress-track]]:bg-white/10 [&_[data-slot=progress-indicator]]:bg-[#c8f15a]" /></CardContent></Card>
                <Card className="border-none bg-card ring-1 ring-border"><CardHeader><CardTitle className="text-[14px] font-bold">Contextos activos</CardTitle></CardHeader><CardContent className="space-y-2">{athlete.groups.map((group) => <div key={group} className="flex items-center gap-3 rounded-xl bg-muted/45 p-3"><span className="grid size-8 place-items-center rounded-lg bg-card ring-1 ring-border"><CalendarDays className="size-3.5" /></span><div className="flex-1"><p className="text-[12px] font-semibold">{group}</p><p className="text-[10px] text-muted-foreground">Planificación compartida</p></div><Badge variant="outline" className="bg-card">Activo</Badge></div>)}</CardContent></Card>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="evaluations" className="mt-5"><EvaluationDashboard athleteName={athlete.name} embedded /></TabsContent>
          <TabsContent value="routines" className="mt-5"><Card className="border-none bg-card ring-1 ring-border"><CardContent className="grid min-h-64 place-items-center text-center"><div><Dumbbell className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 font-semibold">2 planificaciones activas</p><p className="mt-1 text-xs text-muted-foreground">Selección Beach y Club · Plantel superior</p></div></CardContent></Card></TabsContent>
          <TabsContent value="history" className="mt-5"><Card className="border-none bg-card ring-1 ring-border"><CardContent className="grid min-h-64 place-items-center text-center"><div><Clock3 className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 font-semibold">Historial longitudinal disponible</p><p className="mt-1 text-xs text-muted-foreground">Entrenamientos, evaluaciones, grupos y modificaciones.</p></div></CardContent></Card></TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function MiniMetric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: 'lime' | 'amber' }) {
  return <Card className={`border-none ring-0 ${tone === 'lime' ? 'bg-[#edf4e1]' : tone === 'amber' ? 'bg-[#fff5dc]' : 'bg-card ring-1 ring-border'}`}><CardContent><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</p><p className="mt-2 text-xl font-bold tracking-tight">{value}</p><p className="mt-1 text-[10px] text-muted-foreground">{detail}</p></CardContent></Card>;
}
