# Nexo

Aplicación multideporte para preparadores físicos y sus deportistas.

## Uso

- El administrador habilita PF y controla planes, precios, cupos y acceso. Vencimientos y cobros siguen siendo manuales.
- Cada PF administra fichas y grupos. Puede importar hasta 500 alumnos desde XLSX, CSV o TSV con revisión previa.
- El primer ingreso verifica el correo por enlace y exige crear una contraseña. Luego se ingresa con email y contraseña. El acceso temporal de configuración no permite consultar ni modificar datos de la aplicación.
- Una persona puede tener fichas de distintos PF usando el mismo email. Al verificar su correo puede elegir el profesor; cada ficha conserva sus datos separados. Los enlaces antiguos de PF llevan al primer ingreso, sin iniciar sesión automáticamente.
- Las rutinas tienen entre 2 y 4 días. La semana avanza cada 7 días desde el inicio de la asignación, aunque falten sesiones. La última semana continúa hasta el fin configurado de la asignación.
- El deportista puede elegir una fecha anterior y corregirla. Se validan versión, sesión y ejercicios; no se admiten registros futuros. Se guardan fecha entrenada y fecha de edición.
- Editar una rutina crea una versión nueva. Las asignaciones existentes conservan su versión; la nueva se entrega mediante otra asignación.
- Quitar un integrante o archivar una rutina conserva el historial. La baja de esas sesiones se hace efectiva al finalizar el día de Buenos Aires, para no ocultar entrenamientos ya registrados ese día.
- Agenda y Carga muestran sesiones previstas y registradas, PSE, dolor y comentarios del espacio del PF.
- Las rutinas admiten adjuntos PDF, XLSX, CSV, TSV, PNG y JPEG de hasta 10 MB, con descargas autorizadas. Los adjuntos no se transforman automáticamente en ejercicios.
- Evaluaciones permite gestionar plantillas, tests y resultados. Las correcciones conservan el resultado anterior. Cambiar unidad, dirección o protocolo de un test usado crea otra versión. Los gráficos separan test y superficie.

## Desarrollo

Node 24 y pnpm 11.25.0:

```sh
pnpm install --frozen-lockfile
pnpm run dev
pnpm exec tsc --noEmit --incremental false
pnpm test
pnpm run build
```

Las suites `scripts/test-*.mjs` usan SQLite en memoria, las migraciones reales y APIs/lógica del proyecto. Algunas rutas usan autenticación simulada; Gmail y R2 se simulan. No sustituyen una prueba de recepción de correo ni una prueba del sitio publicado.

`scripts/qa-multitenancy.mjs` reúne regresiones aisladas de identidad multi-PF, cupos, membresías y adjuntos. Ya no depende de contraseñas ni crea cuentas en una base de ejecución.

GitHub verifica tipos, pruebas y build. `pnpm run lint` permite auditar las reglas del proyecto.

## Persistencia y despliegue

React/Vinext sobre Workers, D1/Drizzle para datos y R2 para archivos. `.openai/hosting.json` conserva la identidad del sitio y sus bindings. Las migraciones son de esquema; los vínculos de identidades antiguas se incorporan de forma idempotente al resolver el acceso.

Validar las migraciones sobre una copia local antes de publicar. Los entrenamientos antiguos se preservan; los registros nuevos los sustituyen para los cálculos mediante una clave única sin borrar originales.

La configuración de Gmail está en [scripts/EMAIL-LOGIN.md](scripts/EMAIL-LOGIN.md). Las credenciales son secretos del alojamiento. El panel de negocio informa configuración y resultados de envío sin mostrar secretos.
