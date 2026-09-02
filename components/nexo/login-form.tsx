'use client';

import { useState } from 'react';
import { ArrowRight, CheckCircle2, Eye, EyeOff, KeyRound, Link2, ShieldCheck, Sparkles, Zap } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LoginForm({ setupRequired }: { setupRequired: boolean }) {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: setupRequired ? 'bootstrap' : 'login',
          name: form.get('name'),
          email: form.get('email'),
          password: form.get('password'),
          activationCode: form.get('activationCode'),
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'No pudimos completar el ingreso.');
      window.location.assign('/');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos completar el ingreso.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-[#f5f3ec] lg:grid-cols-[minmax(420px,0.9fr)_minmax(520px,1.1fr)]">
      <section className="relative hidden overflow-hidden bg-[#10253d] px-12 py-10 text-white lg:flex lg:flex-col">
        <div className="absolute -right-28 top-20 size-80 rounded-full border border-white/10" />
        <div className="absolute -right-8 top-48 size-44 rounded-full bg-[#c8f15a]/10 blur-2xl" />
        <div className="relative flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-[#c8f15a] text-[#10253d]"><Zap className="size-5" fill="currentColor" /></span>
          <div><p className="text-lg font-bold tracking-[-0.04em]">NEXO</p><p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/45">Rendimiento deportivo</p></div>
        </div>

        <div className="relative my-auto max-w-md pb-16">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#dcefaa]"><Sparkles className="size-3" /> Todo el rendimiento, conectado</span>
          <h1 className="mt-6 text-4xl font-bold leading-[1.08] tracking-[-0.055em]">Decisiones más claras para cada deportista.</h1>
          <p className="mt-5 text-sm leading-7 text-white/60">Planificá, asigná y evaluá equipos de handball desde un mismo lugar, conservando la flexibilidad de tus planillas.</p>
          <div className="mt-9 space-y-4">
            {['Rutinas por grupo con ajustes individuales', 'Evaluaciones históricas y porcentajes de mejora', 'Seguimiento de carga, bienestar y cumplimiento'].map((item) => (
              <div key={item} className="flex items-center gap-3 text-sm text-white/78"><CheckCircle2 className="size-4 text-[#c8f15a]" />{item}</div>
            ))}
          </div>
        </div>
        <p className="relative text-[10px] text-white/35">Nexo protege la información de tus deportistas.</p>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[440px]">
          <div className="mb-9 flex items-center gap-3 lg:hidden"><span className="grid size-9 place-items-center rounded-xl bg-[#c8f15a] text-[#10253d]"><Zap className="size-4" fill="currentColor" /></span><span className="font-bold tracking-tight text-[#10253d]">NEXO</span></div>
          <div className="rounded-[24px] border border-[#dedaCE] bg-white p-6 shadow-[0_24px_70px_-50px_#10253d] sm:p-8">
            <span className="grid size-11 place-items-center rounded-2xl bg-[#edf4e1] text-[#52751d]"><ShieldCheck className="size-5" /></span>
            <h2 className="mt-5 text-2xl font-bold tracking-[-0.045em] text-[#10253d]">{setupRequired ? 'Activá tu cuenta de PF' : 'Ingresá a Nexo'}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{setupRequired ? 'Creá la primera cuenta administradora. Esto se realiza una sola vez.' : 'Usá las credenciales de tu cuenta de preparador físico.'}</p>

            <form onSubmit={submit} className="mt-7 space-y-4">
              {setupRequired && <div className="space-y-1.5"><Label htmlFor="login-name">Nombre completo</Label><Input id="login-name" name="name" autoComplete="name" placeholder="Manuel Abalsamo" required /></div>}
              <div className="space-y-1.5"><Label htmlFor="login-email">Email</Label><Input id="login-email" name="email" type="email" autoComplete="email" placeholder="pf@equipo.com" required /></div>
              <div className="space-y-1.5">
                <Label htmlFor="login-password">Contraseña</Label>
                <div className="relative"><Input id="login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={setupRequired ? 'new-password' : 'current-password'} placeholder={setupRequired ? 'Mínimo 10 caracteres' : 'Tu contraseña'} minLength={setupRequired ? 10 : undefined} required className="pr-11" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground hover:text-foreground">{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div>
              </div>
              {setupRequired && <div className="space-y-1.5"><Label htmlFor="activation-code">Código de activación</Label><div className="relative"><KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="activation-code" name="activationCode" autoComplete="one-time-code" placeholder="Código entregado por Nexo" required className="pl-9 font-mono uppercase tracking-wider" /></div></div>}
              {error && <p role="alert" className="rounded-xl bg-[#fff0ed] px-3 py-2.5 text-xs font-medium text-[#a23f30]">{error}</p>}
              <Button type="submit" disabled={loading} className="h-11 w-full rounded-xl bg-[#10253d] text-white hover:bg-[#183653]">{loading ? 'Ingresando…' : setupRequired ? 'Crear cuenta e ingresar' : 'Ingresar'}<ArrowRight className="size-4" /></Button>
            </form>
          </div>

          <div className="mt-4 flex gap-3 rounded-2xl border border-[#dedaCE] bg-white/55 p-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#fff5dc] text-[#8c661e]"><Link2 className="size-4" /></span>
            <div><p className="text-sm font-semibold text-[#10253d]">¿Sos deportista?</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Ingresarás desde el enlace personal que te envíe tu PF. No necesitás crear una contraseña.</p></div>
          </div>
        </div>
      </section>
    </main>
  );
}
