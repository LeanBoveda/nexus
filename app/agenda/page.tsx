import { CalendarDays, Clock3, MapPin, Plus } from 'lucide-react';
import { AppShell } from '@/components/nexo/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function AgendaPage() {
  const events = [['09:00', 'Fuerza · Plantel Beach', 'Arena principal', '18 deportistas'], ['11:30', 'Evaluaciones U21', 'Gimnasio CENARD', '12 deportistas'], ['17:00', 'Grupo tarde', 'Gimnasio', '8 deportistas']];
  return <AppShell active="agenda"><div className="mx-auto max-w-[1200px] px-5 py-8 sm:px-7 lg:px-9"><div className="flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Organización</p><h1 className="mt-1 text-2xl font-bold tracking-tight">Agenda</h1><p className="mt-1 text-sm text-muted-foreground">Sesiones, testeos y concentraciones.</p></div><Button className="bg-[#10253d] text-white"><Plus /> Nueva actividad</Button></div><Card className="mt-6 border-none bg-card ring-1 ring-border"><CardContent className="space-y-2">{events.map((event) => <div key={event[0]} className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-[70px_1fr_auto] sm:items-center"><span className="text-lg font-bold">{event[0]}</span><div><p className="font-semibold">{event[1]}</p><p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3" /> {event[2]}</p></div><span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="size-3" /> {event[3]}</span></div>)}</CardContent></Card></div></AppShell>;
}
