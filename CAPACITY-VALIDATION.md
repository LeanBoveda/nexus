# Validación de capacidad de Nexo — 28/10/2026

## Dictamen

El volumen de datos de 5 PF y 375 alumnos funciona en la prueba local. Las comprobaciones funcionales e integridad pasaron. **Esto no certifica la capacidad del hosting publicado ni un lanzamiento sin demoras.** El ensayo encuentra degradación importante bajo concurrencia y pantallas que conviene optimizar antes de ampliar el uso.

No se accedió a la base de producción, no se enviaron correos y no se modificó la landing ni el comportamiento publicado de la aplicación.

## Datos sintéticos

- 5 cuentas de PF y 75 alumnos activos por cuenta: 375 alumnos.
- 15 grupos y rutinas, 4 días semanales, 6 ejercicios por día, planificación de 54 semanas.
- 78.000 registros iniciales: 52 semanas × 4 entrenamientos × 375 alumnos.
- 4.500 evaluaciones: 12 por alumno; 22.500 resultados: 5 métricas por evaluación.
- 380 usuarios y sesiones locales con tokens aleatorios y hashes reales.
- Base SQLite en disco/WAL, creada de cero con todas las migraciones reales y claves foráneas activas.
- Tamaño final de páginas de la base: 26.791.936 bytes, aproximadamente 25,6 MiB. No incluye WAL, archivos adjuntos ni backups.

Los guardados durante el ensayo dejaron 78.120 registros. Los reintentos sobre la misma sesión no duplicaron registros.

## Método y alcance

Se ejecutó un adaptador HTTP en 127.0.0.1 con las funciones reales de autenticación por sesión, portal, listado de alumnos, API de evaluaciones y guardado de progreso. Únicamente se sustituyeron los bindings Cloudflare/D1 y las dependencias de navegación/cookies del framework para ejecutarlos en Node.

Para Carga y cumplimiento se midieron las consultas y el renderizado HTML del componente real `TrainingOverviewView`, consultando 90 días. No es el pipeline completo Vinext/RSC ni una prueba con navegador.

Carga cerrada, sin pausas entre solicitudes: 50% portal, 30% guardados, 10% listado de alumnos, 5% evaluaciones y 5% Carga. Es un estrés sintético; **concurrencia significa solicitudes en vuelo, no alumnos registrados ni 100 personas navegando de forma realista**. No se limita la carga de profesores a cinco operaciones simultáneas.

Cliente y servidor corren en la misma computadora y proceso Node, con SQLite síncrono. Comparten CPU: las colas y tiempos no se extrapolan a Workers/D1. Se incluye parseo de respuestas y renderizado de Carga, pero se excluyen navegador, AppShell, red externa, Gmail, R2, ráfagas de login con contraseña, cuotas y tiempos de red/cola de D1.

## Resultado HTTP local

| Concurrencia | Solicitudes | Errores | Mediana | Percentil 95 | Solicitudes/s |
|---|---:|---:|---:|---:|---:|
| 1 | 50 | 0 | 10,20 ms | 26,30 ms | 19,8 |
| 25 | 100 | 0 | 1.282,26 ms | 2.333,33 ms | 16,2 |
| 50 | 200 | 0 | 2.660,03 ms | 3.770,25 ms | 15,5 |
| 100 | 400 | 0 | 6.182,59 ms | 8.697,50 ms | 15,8 |

El percentil 95 significa que el 95% de las solicitudes terminó dentro de ese tiempo. La mediana a concurrencia 1 no representa las pantallas pesadas: el percentil 99 de esa tanda fue 1.064,73 ms. No se establece un máximo de usuarios de producción a partir de estos números.

En una pasada anterior con el timeout de conexiones persistentes predeterminado del adaptador local hubo 58 errores `fetch failed` en 400 solicitudes a concurrencia 100. Se repitió con keep-alive de 120 segundos y timeout de headers de 130 segundos, sin errores. El ajuste corresponde al banco de pruebas, no a Nexo publicado; las demoras de la segunda pasada siguen siendo un resultado desfavorable de rendimiento.

## Hallazgos

1. **Carga y cumplimiento:** calcula hasta 90 días para 75 alumnos, resuelve cada planificación por fecha, busca registros dentro de listas y renderiza todos los registros. El HTML del componente alcanzó 1.400.002 bytes sin comprimir. Conviene paginar la tabla, precalcular índices por alumno/fecha y evitar repetir resolución/parseo de rutinas durante el cálculo del calendario. Los totales deben seguir representando todo el período.
2. **Evaluaciones:** la respuesta alcanzó 1.329.191 bytes sin comprimir, incluyendo 4.500 resultados de un PF. Conviene aplicar filtros temporales y paginación en servidor sin cortar los datos necesarios para comparaciones históricas.
3. **SQL:** los planes inspeccionados utilizan índices de alumnos/cuenta, sesiones y registros por alumno. También aparecen ordenamientos temporales. No se justifica cambiar de motor por falta de almacenamiento con estos datos; conviene revisar índices de fecha cuando se acoten consultas y medir lecturas reales en D1.
4. **Portal:** devuelve alrededor de 8 KB y consulta el historial del alumno. Debe medirse su crecimiento a varios años, además de este año sintético.
5. Se observaron hasta 10 sentencias SQL por petición del portal, 6 por guardado, 5 por listado, 9 por evaluaciones y 4 por Carga en el adaptador. Se comprobó un presupuesto diagnóstico de 50 sentencias y 100 parámetros; esto no verifica las cuotas contratadas del hosting.

## Comprobaciones funcionales

- Rechazo de sesión inválida y de alumnos que intentan usar endpoints de PF.
- Rechazo de escritura de progreso sobre la rutina de otro alumno/cuenta y de plantilla de otro PF.
- Listado, Carga y evaluaciones sin datos de otra cuenta en las comprobaciones sintéticas.
- Portal con la rutina y ejercicios del alumno autenticado.
- Reintentos de guardado idempotentes.
- `PRAGMA foreign_key_check` sin problemas e `integrity_check = ok` después del estrés.
- Copia local mediante `VACUUM INTO`, apertura independiente, recuento de registros e integridad correctos. **No acredita que existan backups automáticos de producción.**
- `pnpm test`: 14 suites de comportamiento existentes aprobadas, independientes del ensayo de carga.

## Repetición

```powershell
pnpm test:capacity
```

Requiere Node compatible con `node:sqlite`, dependencias instaladas y permiso para HTTP en localhost. Es una prueba local, no admite URL ni credenciales de producción. Crea una carpeta temporal `nexo-capacity-*` con datos ficticios y escribe `outputs/capacity-validation.json` con métricas y planes SQL. La prueba no forma parte de `pnpm test` para evitar carga pesada en cada ejecución.

## Pendiente antes de certificar producción

Después de la primera optimización descrita abajo, falta optimizar Evaluaciones y usar un staging con los mismos recursos que producción, sesiones sintéticas y carga distribuida, con máximo cinco PF concurrentes y alumnos activos realistas. Medir tiempos por recorrido, errores, CPU, memoria, filas leídas/escritas y adjuntos; comprobar exportación/restauración y cuotas del proveedor. Esa fase necesita un entorno aislado de hosting y todavía no se realizó.

## Primera optimización: Carga y cumplimiento

Se agregó `getTrainingLoad`, utilizado por `/carga`:

- Filtros por alumno y grupo aplicados en SQL con aislamiento por cuenta y pertenencias actuales.
- Tabla de 50 registros por página, orden estable y enlaces que conservan filtros y fechas. Cambiar los filtros vuelve a la primera página.
- Totales y promedios calculados sobre todo el período filtrado, independientemente de la página. El promedio ignora valores nulos y conserva ceros.
- Para registros modernos, resumen SQL, fechas de finalización compactas y detalle con `LIMIT/OFFSET`. No se descargan todos los comentarios/valores del período.
- El calendario de cumplimiento resuelve los días de cada asignación una sola vez, sin construir todos los ejercicios/semanas para cada fecha. Agenda utiliza un mapa de registros por fecha y un formateador de fechas compartido.
- Los contenidos y ajustes de las asignaciones se parsean antes de recorrer las fechas.
- Registros antiguos sin fecha o clave conservan su deduplicación y cancelaciones mediante la ruta compatible. En ese caso la tabla igualmente se pagina, pero el cálculo interno aún puede leer los registros históricos del PF: no se presenta como paginación SQL completa del formato antiguo.
- El selector de alumnos se consulta aparte para que filtrar no elimine las otras opciones.

Se repitió el mismo escenario y mezcla de solicitudes con `node scripts/validate-capacity.mjs --optimized`:

| Concurrencia | P95 anterior | P95 optimizado | Errores optimizado |
|---|---:|---:|---:|
| 1 | 26,30 ms | 21,30 ms | 0 |
| 25 | 2.333,33 ms | 287,01 ms | 0 |
| 50 | 3.770,25 ms | 579,89 ms | 0 |
| 100 | 8.697,50 ms | 1.328,96 ms | 0 |

El HTML de Carga pasó de 1.400.002 a 28.381 bytes sin comprimir: aproximadamente 98% menos. El P95 de la mezcla a concurrencia 100 bajó aproximadamente 85%. Son mediciones locales observadas, no un SLA ni tiempos de producción. Evaluaciones sigue devolviendo aproximadamente 1,3 MB; esta etapa no modifica su comportamiento.

`outputs/capacity-validation-optimized.json` conserva el resultado posterior por separado. Se agregaron pruebas de 120 registros en tres páginas, ausencia de duplicados entre páginas, totales constantes, promedios, parámetros inválidos, grupos/usuarios ajenos, sin grupo, cancelaciones modernas y compatibilidad legacy. No requirió migraciones ni cambios en credenciales o datos reales.
