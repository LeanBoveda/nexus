/* eslint-disable next/no-html-link-for-pages -- Vinext's Link runtime currently throws during RSC prefetch. */
import { ArrowLeft, Link2Off, ShieldCheck, Zap } from 'lucide-react';
import { redirect } from 'next/navigation';

import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AthleteAccessPage() {
  const user = await getSession();
  if (user?.role === 'athlete') redirect('/mi-entrenamiento');

  return (
    <main className="grid min-h-screen place-items-center bg-[#f3f5ef] px-5 py-12 text-[#17283a]">
      <section className="w-full max-w-md rounded-[28px] border border-[#dce2d8] bg-white p-7 text-center shadow-[0_24px_80px_-50px_#10253d] sm:p-9">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#10253d] text-[#c8f15a]">
          <Link2Off className="size-6" />
        </span>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-[#73808a]">
          Acceso personal
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-[-0.04em]">
          Este enlace ya no está disponible
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#64717a]">
          Los accesos son personales, se usan una sola vez y vencen por
          seguridad. Pedile a tu preparador físico que te envíe uno nuevo.
        </p>
        <div className="mt-6 flex items-center gap-3 rounded-2xl bg-[#f1f5ea] px-4 py-3 text-left">
          <ShieldCheck className="size-5 shrink-0 text-[#6b921f]" />
          <p className="text-xs font-medium leading-5 text-[#526143]">
            Una vez que ingreses, tu sesión quedará activa en este dispositivo.
          </p>
        </div>
        <a
          href="/login"
          className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#d6ddd2] px-4 text-sm font-semibold transition hover:bg-[#f5f7f2]"
        >
          <ArrowLeft className="size-4" /> Volver al inicio
        </a>
        <p className="mt-7 flex items-center justify-center gap-2 text-xs font-bold tracking-wide text-[#60707b]">
          <span className="grid size-6 place-items-center rounded-lg bg-[#c8f15a] text-[#26340f]">
            <Zap className="size-3" fill="currentColor" />
          </span>
          NEXO
        </p>
      </section>
    </main>
  );
}
