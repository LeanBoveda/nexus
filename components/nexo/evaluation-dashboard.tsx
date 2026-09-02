'use client';

import { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Check, ChevronDown, ClipboardPlus, Download, Plus, Save, TrendingUp, Users } from 'lucide-react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const chartData = [
  { date: '10 Ene', value: 42 },
  { date: '14 Mar', value: 43.5 },
  { date: '22 May', value: 45 },
  { date: '18 Jul', value: 46 },
  { date: '28 Ago', value: 47 },
];

const chartConfig = { value: { label: 'CMJ', color: '#9fcf2d' } } satisfies ChartConfig;

const results = [
  { test: 'CMJ', unit: 'cm', initial: 42, previous: 46, current: 47, better: 'high' },
  { test: 'Sprint 15 m · arena', unit: 's', initial: 2.86, previous: 2.79, current: 2.72, better: 'low' },
  { test: 'Lanzamiento 6 m', unit: 'km/h', initial: 72, previous: 75, current: 77, better: 'high' },
  { test: 'Agarre derecho', unit: 'kg', initial: 48, previous: 49, current: 51, better: 'high' },
  { test: 'Agarre izquierdo', unit: 'kg', initial: 47, previous: 48, current: 49, better: 'high' },
];

const bulkAthletes = ['Lucía Méndez', 'Martina Ruiz', 'Valentina Costa', 'Sofía Acosta', 'Camila Torres'];

export function EvaluationDashboard({ athleteName = 'Lucía Méndez', embedded = false }: { athleteName?: string; embedded?: boolean }) {
  const [saved, setSaved] = useState(false);
  const [selectedTest, setSelectedTest] = useState('CMJ');

  return (
    <Tabs defaultValue="individual" className={embedded ? '' : 'mt-6'}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TabsList><TabsTrigger value="individual">Evolución individual</TabsTrigger><TabsTrigger value="bulk">Carga masiva</TabsTrigger></TabsList>
        <div className="flex gap-2"><Button variant="outline" className="h-8"><Download /> Exportar</Button><Button className="h-8 bg-[#10253d] text-white hover:bg-[#183653]"><ClipboardPlus /> Nueva jornada</Button></div>
      </div>

      <TabsContent value="individual" className="mt-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]">
          <Card className="border-none bg-card ring-1 ring-border">
            <CardHeader className="border-b border-border/70 pb-4">
              <CardTitle className="text-[15px] font-bold">Historial de evaluaciones</CardTitle><CardDescription>{athleteName} · Beach handball</CardDescription>
              <CardAction><Badge variant="outline" className="border-[#cfe0ac] bg-[#f1f7e8] text-[#52751d]">5 testeos comparables</Badge></CardAction>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader><TableRow className="bg-muted/35 hover:bg-muted/35"><TableHead className="pl-4 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Test</TableHead><TableHead className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Inicial</TableHead><TableHead className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Anterior</TableHead><TableHead className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Actual</TableHead><TableHead className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Último cambio</TableHead><TableHead className="pr-4 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Desde el inicio</TableHead></TableRow></TableHeader>
                <TableBody>{results.map((row) => { const recent = improvement(row.previous, row.current, row.better); const total = improvement(row.initial, row.current, row.better); return <TableRow key={row.test} className={selectedTest === row.test ? 'bg-[#f5f9ed]' : ''} onClick={() => setSelectedTest(row.test)}><TableCell className="pl-4"><button className="text-left"><p className="text-[12px] font-semibold">{row.test}</p><p className="text-[10px] text-muted-foreground">{row.unit}</p></button></TableCell><TableCell>{row.initial} {row.unit}</TableCell><TableCell>{row.previous} {row.unit}</TableCell><TableCell className="font-bold">{row.current} {row.unit}</TableCell><TableCell><Trend value={recent} /></TableCell><TableCell className="pr-4"><Trend value={total} /></TableCell></TableRow>; })}</TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="border-none bg-[#10253d] text-white ring-0">
            <CardHeader><CardDescription className="text-white/50">Evolución · {selectedTest}</CardDescription><CardTitle className="text-2xl font-bold">47 cm</CardTitle><CardAction><span className="flex items-center gap-1 text-xs font-semibold text-[#c8f15a]"><TrendingUp className="size-3.5" /> +11,9%</span></CardAction></CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[230px] w-full aspect-auto text-white/50" initialDimension={{ width: 360, height: 230 }}>
                <LineChart data={chartData} margin={{ top: 12, right: 8, bottom: 0, left: -22 }}><CartesianGrid vertical={false} stroke="rgba(255,255,255,.10)" /><XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: 'rgba(255,255,255,.45)', fontSize: 10 }} /><YAxis domain={[38, 50]} tickLine={false} axisLine={false} tick={{ fill: 'rgba(255,255,255,.35)', fontSize: 10 }} /><ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} /><Line type="monotone" dataKey="value" stroke="var(--color-value)" strokeWidth={3} dot={{ fill: '#c8f15a', strokeWidth: 0, r: 4 }} activeDot={{ r: 6 }} /></LineChart>
              </ChartContainer>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]"><div className="rounded-xl bg-white/7 p-3"><p className="text-white/45">Mejor marca</p><p className="mt-1 font-semibold">47 cm · 28 Ago</p></div><div className="rounded-xl bg-white/7 p-3"><p className="text-white/45">Objetivo</p><p className="mt-1 font-semibold">49 cm · faltan 2</p></div></div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="bulk" className="mt-4">
        <Card className="border-none bg-card py-0 ring-1 ring-border">
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center"><div><p className="text-sm font-bold">Jornada Beach · Septiembre</p><p className="mt-0.5 text-[11px] text-muted-foreground">Selección Argentina · Arena · Protocolo versión 2</p></div><div className="flex gap-2 sm:ml-auto"><Button variant="outline" className="h-8"><Users /> Plantel Beach <ChevronDown /></Button><Button variant="outline" className="h-8"><Plus /> Agregar test</Button></div></div>
          <CardContent className="px-0">
            <Table><TableHeader><TableRow className="bg-[#10253d] hover:bg-[#10253d]"><TableHead className="pl-4 text-white">Deportista</TableHead><TableHead className="text-center text-white">CMJ <span className="font-normal text-white/45">cm</span></TableHead><TableHead className="text-center text-white">Sprint 15 m <span className="font-normal text-white/45">s</span></TableHead><TableHead className="text-center text-white">Lanzamiento <span className="font-normal text-white/45">km/h</span></TableHead><TableHead className="text-center text-white">Agarre D <span className="font-normal text-white/45">kg</span></TableHead><TableHead className="text-center text-white">Agarre I <span className="font-normal text-white/45">kg</span></TableHead></TableRow></TableHeader><TableBody>{bulkAthletes.map((athlete, index) => <TableRow key={athlete}><TableCell className="pl-4 font-semibold">{athlete}</TableCell>{[47 - index, 2.72 + index * 0.03, 77 - index, 51 - index, 49 - index].map((value, cell) => <TableCell key={cell} className="p-1"><Input defaultValue={value.toFixed(cell === 1 ? 2 : 0)} className="h-9 border-transparent text-center font-semibold focus-visible:bg-[#f1f7e8]" /></TableCell>)}</TableRow>)}</TableBody></Table>
          </CardContent>
          <div className="flex items-center justify-between border-t border-border bg-muted/35 p-3"><p className="text-[11px] text-muted-foreground">Los resultados se agregarán al historial individual de cada deportista.</p><Button onClick={() => setSaved(true)} className={saved ? 'bg-[#52751d] text-white hover:bg-[#52751d]' : 'bg-[#10253d] text-white hover:bg-[#183653]'}>{saved ? <Check /> : <Save />}{saved ? 'Resultados guardados' : 'Guardar resultados'}</Button></div>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

function improvement(previous: number, current: number, better: string) { const raw = better === 'low' ? (previous - current) / previous : (current - previous) / previous; return raw * 100; }

function Trend({ value }: { value: number }) {
  const positive = value >= 0;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${positive ? 'bg-[#edf4e1] text-[#52751d]' : 'bg-[#fff0ec] text-[#b34231]'}`}>{positive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}{positive ? '+' : ''}{value.toFixed(1).replace('.', ',')}%</span>;
}
