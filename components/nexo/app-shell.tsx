import {
  Activity,
  Bell,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  Dumbbell,
  LayoutDashboard,
  Plus,
  Search,
  Sparkles,
  Users,
  UsersRound,
  Zap,
} from 'lucide-react';
import Link from 'next/link';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { buttonVariants } from '@/components/ui/button';
import { LogoutButton } from '@/components/nexo/logout-button';
import { requireSession } from '@/lib/auth';
import { cn } from '@/lib/utils';

export type NexoSection = 'inicio' | 'deportistas' | 'grupos' | 'rutinas' | 'evaluaciones' | 'agenda' | 'carga';

const navigation: Array<{ id: NexoSection; label: string; href: string; icon: typeof LayoutDashboard; soon?: boolean }> = [
  { id: 'inicio', label: 'Inicio', href: '/', icon: LayoutDashboard },
  { id: 'deportistas', label: 'Deportistas', href: '/deportistas', icon: Users },
  { id: 'grupos', label: 'Grupos', href: '/grupos', icon: UsersRound },
  { id: 'rutinas', label: 'Rutinas', href: '/rutinas', icon: Dumbbell },
  { id: 'evaluaciones', label: 'Evaluaciones', href: '/evaluaciones', icon: ClipboardCheck },
  { id: 'agenda', label: 'Agenda', href: '/agenda', icon: CalendarDays, soon: true },
  { id: 'carga', label: 'Carga y bienestar', href: '/carga', icon: Activity, soon: true },
];

export async function AppShell({ active, children }: { active: NexoSection; children: React.ReactNode }) {
  const user = await requireSession();
  const initials = user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return (
    <main className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[244px] border-r border-sidebar-border bg-sidebar px-4 py-5 lg:flex lg:flex-col">
        <Link href="/" className="flex items-center gap-3 px-2">
          <LogoMark />
          <div>
            <p className="text-[15px] font-bold leading-none tracking-[-0.03em]">NEXO</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Rendimiento</p>
          </div>
        </Link>

        <Link href="/grupos" className="mt-7 flex w-full items-center gap-3 rounded-xl border border-sidebar-border bg-white/75 px-3 py-2.5 text-left shadow-sm transition hover:bg-white">
          <span className="grid size-8 place-items-center rounded-lg bg-[#10253d] text-white"><UsersRound className="size-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold">Grupos y planteles</span>
            <span className="block truncate text-[11px] text-muted-foreground">Organizar deportistas</span>
          </span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </Link>

        <nav aria-label="Navegación principal" className="mt-6 space-y-1">
          {navigation.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition',
                active === item.id
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                  : 'text-sidebar-foreground/68 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )}
            >
              <item.icon className="size-4" strokeWidth={1.9} />
              <span>{item.label}</span>
              {item.soon && <span className="ml-auto rounded-full bg-[#e6ebde] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-[#677154]">Pronto</span>}
            </Link>
          ))}
        </nav>

        <div className="mt-auto rounded-2xl bg-[#10253d] p-4 text-white shadow-[0_16px_40px_-24px_#10253d]">
          <div className="mb-3 flex items-center justify-between">
            <span className="grid size-7 place-items-center rounded-lg bg-white/10"><Sparkles className="size-3.5 text-[#c8f15a]" /></span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Primeros pasos</span>
          </div>
          <p className="text-sm font-semibold">Armá tu base real</p>
          <p className="mt-1 text-[11px] leading-relaxed text-white/60">Cargá deportistas y asignales uno o varios grupos.</p>
          <Link href="/deportistas" className="mt-3 inline-block text-[11px] font-semibold text-[#c8f15a] hover:underline">Ir a Deportistas</Link>
        </div>

        <div className="mt-3 flex items-center gap-3 rounded-xl px-2 py-2 text-left">
          <Avatar size="lg"><AvatarFallback className="bg-[#dce6ee] text-xs font-bold text-[#10253d]">{initials}</AvatarFallback></Avatar>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold">{user.name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{user.email}</span>
          </span>
          <LogoutButton />
        </div>
      </aside>

      <section className="pb-20 lg:pl-[244px] lg:pb-0">
        <header className="sticky top-0 z-20 flex h-[68px] items-center border-b border-border/80 bg-background/90 px-5 backdrop-blur-xl sm:px-7 lg:px-9">
          <Link href="/" className="flex items-center gap-3 lg:hidden"><LogoMark compact /><span className="text-sm font-bold tracking-tight">NEXO</span></Link>
          <label className="ml-auto hidden h-9 w-[min(360px,36vw)] items-center gap-2 rounded-xl border border-border bg-card px-3 text-muted-foreground shadow-sm md:flex lg:ml-0">
            <Search className="size-4" />
            <input aria-label="Buscar deportistas, grupos o rutinas" placeholder="Buscar deportistas, grupos o rutinas..." className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground" />
            <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px]">⌘ K</kbd>
          </label>
          <div className="ml-auto flex items-center gap-2">
            <button aria-label="Notificaciones" className="relative grid size-9 place-items-center rounded-xl border border-border bg-card text-foreground transition hover:bg-muted">
              <Bell className="size-4" /><span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[#ef664d] ring-2 ring-card" />
            </button>
            <Link href="/rutinas/nueva" className={cn(buttonVariants({ size: 'lg' }), 'h-9 rounded-xl bg-[#10253d] px-3.5 text-white hover:bg-[#183653]')}>
              <Plus className="size-4" /> Nueva rutina
            </Link>
          </div>
        </header>
        {children}
      </section>

      <nav aria-label="Navegación móvil" className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 rounded-2xl border border-border bg-card/95 p-1.5 shadow-xl backdrop-blur-xl lg:hidden">
        {navigation.slice(0, 5).map((item) => (
          <Link key={item.id} href={item.href} className={cn('flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[9px] font-semibold', active === item.id ? 'bg-[#10253d] text-white' : 'text-muted-foreground')}>
            <item.icon className="size-4" /> {item.label}
          </Link>
        ))}
      </nav>
    </main>
  );
}

function LogoMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={cn('grid place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_8px_24px_-10px_var(--primary)]', compact ? 'size-8' : 'size-9')}>
      <Zap className="size-4" fill="currentColor" />
    </span>
  );
}
