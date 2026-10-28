export const dynamic = 'force-dynamic';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string }>;
}) {
  const connected = (await searchParams).connected === '1';
  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f3ec] p-5">
      <section className="w-full max-w-lg rounded-3xl border bg-white p-8 shadow-sm">
        <p className="font-bold text-[#52751d]">NEXO · CONEXIÓN DE CORREO</p>
        <h1 className="mt-4 text-2xl font-bold text-[#10253d]">
          Reconectar el envío de Gmail
        </h1>
        {connected ? (
          <p
            role="status"
            className="mt-4 rounded-xl bg-[#edf4e1] p-4 text-sm text-[#52751d]"
          >
            Terminaste el proceso de conexión. Volvé al login y solicitá un
            enlace nuevo para comprobar el envío.
          </p>
        ) : (
          <>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Esta herramienta es sólo para el dueño del correo remitente de
              Nexo, no para los alumnos. Permite renovar su autorización de
              envío sin iniciar sesión en la aplicación.
            </p>
            <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm">
              <li>Abrí la conexión con Google.</li>
              <li>
                Elegí <strong>nexo.cuenta.oficial@gmail.com</strong>.
              </li>
              <li>Revisá y autorizá el permiso para enviar correos.</li>
            </ol>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              Google verifica la cuenta. No se cambia el remitente, no se inicia
              sesión en Nexo y no se habilita acceso a los datos. Si Google
              bloquea la autorización, guardá el mensaje del error para
              revisarlo.
            </p>
            <a
              href="/api/admin/email/connect?recover=1"
              className="mt-6 flex h-12 items-center justify-center rounded-xl bg-[#10253d] font-semibold text-white"
            >
              Reconectar con Google
            </a>
          </>
        )}
        <a
          href="/login?first=1"
          className="mt-5 block text-center text-sm font-semibold text-[#52751d] underline"
        >
          Volver al primer ingreso
        </a>
      </section>
    </main>
  );
}
