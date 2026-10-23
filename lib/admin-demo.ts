import { scheduleDate } from '@/lib/routine-schedule';

export const DEMO_OWNER_EMAIL = 'leandroboveda@gmail.com';
const people = [
  ['Lucas', 'Pérez', 'Lateral'],
  ['Sofía', 'Gómez', 'Central'],
  ['Mateo', 'Rodríguez', 'Extremo'],
  ['Valentina', 'López', 'Pivot'],
  ['Tomás', 'Martínez', 'Corredor'],
  ['Camila', 'Ruiz', 'Corredora'],
  ['Nicolás', 'Acosta', 'General'],
  ['Lucía', 'Medina', 'General'],
];
const shift = (date: string, days: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);

/** Fixed, authorized demo dataset. Never accepts arbitrary targets or replaces records. */
export async function prepareAdminDemo(
  db: D1Database,
  userId: string,
  now = new Date(),
) {
  const owner = await db
    .prepare(`SELECT u.id, u.email, u.trainer_account_id AS tenant,
      ta.max_athletes AS capacity, ta.access_status AS accessStatus
      FROM users u JOIN trainer_accounts ta ON ta.id = u.trainer_account_id
      WHERE u.id = ? AND lower(trim(u.email)) = ? AND u.status = 'active' AND u.role != 'athlete'`)
    .bind(userId, DEMO_OWNER_EMAIL)
    .first<{
      id: string;
      email: string;
      tenant: string;
      capacity: number;
      accessStatus: string;
    }>();
  if (!owner || owner.accessStatus !== 'active')
    throw new Error(
      'La demostración sólo está disponible en el espacio activo del administrador.',
    );
  const prefix = `nexo-demo-v1-${owner.id}`;
  const orgId = `${prefix}-org`;
  const existing = await db
    .prepare(
      'SELECT id FROM organizations WHERE id = ? AND trainer_account_id = ?',
    )
    .bind(orgId, owner.tenant)
    .first();
  if (existing) return { ready: true, alreadyPrepared: true };
  const count = await db
    .prepare(
      "SELECT COUNT(*) AS count FROM athletes WHERE trainer_account_id = ? AND status != 'archived'",
    )
    .bind(owner.tenant)
    .first<{ count: number }>();
  if ((count?.count ?? 0) + people.length > owner.capacity)
    throw new Error(
      'Necesitás al menos 8 lugares libres en tu cupo para cargar la demostración. Ampliá tu cupo desde el panel y reintentá.',
    );
  const today = scheduleDate(now).dateKey;
  const start = shift(today, -28);
  const timestamp = now.getTime();
  const statements: D1PreparedStatement[] = [];
  const insert = (
    table: string,
    columns: string[],
    rows: unknown[][],
    conflict = 'id',
  ) => {
    const chunkSize = Math.max(1, Math.floor(90 / columns.length));
    for (let offset = 0; offset < rows.length; offset += chunkSize) {
      const chunk = rows.slice(offset, offset + chunkSize);
      statements.push(
        db
          .prepare(
            `INSERT INTO ${table} (${columns.join(',')}) VALUES ${chunk.map((row) => `(${row.map(() => '?').join(',')})`).join(',')} ON CONFLICT(${conflict}) DO NOTHING`,
          )
          .bind(...chunk.flat()),
      );
    }
  };
  // Marker and all related data commit atomically; retries cannot duplicate or reset edits.
  insert(
    'organizations',
    ['id', 'trainer_account_id', 'name', 'type', 'country_code'],
    [[orgId, owner.tenant, 'DEMO · Academia Nexo', 'Demostración', 'AR']],
  );
  const groupNames = [
    'DEMO · Plantel deportivo',
    'DEMO · Running',
    'DEMO · Gimnasio',
  ];
  insert(
    'groups',
    ['id', 'organization_id', 'name', 'sport', 'season'],
    groupNames.map((name, index) => [
      `${prefix}-g${index}`,
      orgId,
      name,
      ['Handball', 'Atletismo', 'Preparación física'][index],
      String(now.getFullYear()),
    ]),
  );
  const plans = [
    [1, 3, 5],
    [2, 4],
    [1, 2, 4, 6],
  ];
  const routines = plans.map((days, index) => ({
    id: `${prefix}-r${index}`,
    content: {
      activeWeek: 0,
      weekPlans: [0, 1, 2, 3, 4, 5, 6, 7].map((week) => ({
        number: String(week + 1),
        phase: week % 4 === 3 ? 'Descarga' : 'Carga',
        objective: 'Progresión técnica y física',
        pse: week % 4 === 3 ? '4' : '6',
      })),
      sessions: days.map((weekday, day) => ({
        id: `d${day}`,
        weekday,
        name: `Día ${day + 1} · ${['Fuerza y potencia', 'Resistencia', 'Fuerza general'][index]}`,
        warmup:
          '8 minutos de movilidad, activación y calentamiento progresivo.',
        instructions:
          'DEMO: contenido ficticio para recorrer la aplicación, no una prescripción individual.',
        rows: [
          {
            id: 'e1',
            block: 'A',
            category: 'Principal',
            name: [
              'Sentadilla goblet',
              'Carrera continua',
              'Sentadilla a banco',
            ][index],
            values: Array(8).fill(
              index === 1 ? '20 min · ritmo cómodo' : '3 × 8',
            ),
            rir: Array(8).fill('3'),
          },
          {
            id: 'e2',
            block: 'B',
            category: 'Complementario',
            name: [
              'Remo con mancuerna',
              'Técnica de carrera',
              'Press con mancuernas',
            ][index],
            values: Array(8).fill(index === 1 ? '4 × 30 m' : '3 × 10'),
            rir: Array(8).fill('2'),
          },
          {
            id: 'e3',
            block: 'C',
            category: 'Core',
            name: 'Plancha frontal',
            values: Array(8).fill('3 × 25 s'),
            rir: Array(8).fill('—'),
          },
        ],
      })),
    },
  }));
  for (const [index, routine] of routines.entries()) {
    insert(
      'routines',
      [
        'id',
        'trainer_account_id',
        'organization_id',
        'name',
        'description',
        'status',
        'created_by',
      ],
      [
        [
          routine.id,
          owner.tenant,
          orgId,
          `DEMO · ${['Fuerza deportiva · 3 días', 'Running · 2 días', 'Acondicionamiento · 4 días'][index]}`,
          'Plan ficticio editable para conocer Nexo.',
          'published',
          owner.id,
        ],
      ],
    );
    insert(
      'routine_versions',
      ['id', 'routine_id', 'version_number', 'content'],
      [[`${routine.id}-v1`, routine.id, 1, JSON.stringify(routine.content)]],
    );
    insert(
      'routine_assignments',
      [
        'id',
        'routine_version_id',
        'target_type',
        'target_id',
        'starts_on',
        'ends_on',
        'assigned_by',
      ],
      [
        [
          `${routine.id}-assignment`,
          `${routine.id}-v1`,
          'group',
          `${prefix}-g${index}`,
          start,
          shift(today, 56),
          owner.id,
        ],
      ],
    );
  }
  const templateId = `${prefix}-tests`;
  insert(
    'evaluation_templates',
    ['id', 'trainer_account_id', 'name', 'sport', 'description', 'created_by'],
    [
      [
        templateId,
        owner.tenant,
        'DEMO · Evaluación física general',
        'Multideporte',
        'Resultados ficticios en tres fechas para visualizar gráficos de evolución.',
        owner.id,
      ],
    ],
  );
  insert(
    'evaluation_metrics',
    [
      'id',
      'template_id',
      'key',
      'label',
      'unit',
      'better_direction',
      'protocol',
      'sort_order',
    ],
    [
      [
        `${prefix}-m0`,
        templateId,
        'salto',
        'Salto vertical',
        'cm',
        'higher',
        'Mismo protocolo en las tres mediciones.',
        0,
      ],
      [
        `${prefix}-m1`,
        templateId,
        'sprint',
        'Sprint 20 metros',
        's',
        'lower',
        'Misma superficie y distancia.',
        1,
      ],
      [
        `${prefix}-m2`,
        templateId,
        'fuerza',
        'Carga de referencia',
        'kg',
        'higher',
        'Carga ficticia del mismo ejercicio.',
        2,
      ],
    ],
  );
  for (const [index, [first, last, position]] of people.entries()) {
    const athleteId = `${prefix}-a${index}`;
    const groupIndex = index < 4 ? 0 : index < 6 ? 1 : 2;
    const routine = routines[groupIndex];
    const instanceId = `${athleteId}-instance`;
    insert(
      'athletes',
      [
        'id',
        'trainer_account_id',
        'first_name',
        'last_name',
        'email',
        'country_code',
        'primary_position',
        'primary_context',
      ],
      [
        [
          athleteId,
          owner.tenant,
          first,
          `${last} · DEMO`,
          `nexo.demo.${index + 1}.${owner.id}@example.test`,
          'AR',
          position,
          'Datos ficticios de demostración',
        ],
      ],
    );
    insert(
      'group_memberships',
      ['athlete_id', 'group_id'],
      [[athleteId, `${prefix}-g${groupIndex}`]],
      'athlete_id,group_id',
    );
    insert(
      'athlete_routine_instances',
      ['id', 'assignment_id', 'athlete_id', 'status'],
      [[instanceId, `${routine.id}-assignment`, athleteId, 'active']],
    );
    const logs: unknown[][] = [];
    for (let offset = 21; offset >= 0; offset--) {
      const date = shift(today, -offset);
      const weekday = scheduleDate(new Date(`${date}T12:00:00-03:00`)).weekday;
      const session = routine.content.sessions.find(
        (item) => item.weekday === weekday,
      );
      if (!session || (index + offset) % 5 === 0) continue;
      logs.push([
        `${athleteId}-log-${date}`,
        instanceId,
        athleteId,
        `date-${date}-session-${session.id}`,
        `${instanceId}:${athleteId}:${date}:${session.id}`,
        date,
        Date.parse(`${date}T12:00:00-03:00`),
        5 + (index % 3),
        index === 2 && offset < 5 ? 4 : 0,
        'DEMO · Sesión registrada para visualizar seguimiento.',
        JSON.stringify({ completedExerciseIds: ['e1', 'e2', 'e3'] }),
        timestamp,
      ]);
    }
    if (logs.length)
      insert(
        'workout_logs',
        [
          'id',
          'instance_id',
          'athlete_id',
          'session_key',
          'entry_key',
          'trained_on',
          'completed_at',
          'pse',
          'pain',
          'notes',
          'actual_values',
          'updated_at',
        ],
        logs,
      );
    const sessions = [28, 14, 0].map((days, measure) => [
      `${athleteId}-eval${measure}`,
      templateId,
      athleteId,
      `${prefix}-g${groupIndex}`,
      Date.parse(`${shift(today, -days)}T12:00:00-03:00`),
      'Gimnasio',
      'DEMO · Medición ficticia.',
    ]);
    insert(
      'evaluation_sessions',
      [
        'id',
        'template_id',
        'athlete_id',
        'group_id',
        'evaluated_at',
        'surface',
        'notes',
      ],
      sessions,
    );
    insert(
      'evaluation_results',
      ['session_id', 'metric_id', 'value'],
      sessions.flatMap((row, measure) => [
        [row[0], `${prefix}-m0`, 30 + index + measure * 2],
        [
          row[0],
          `${prefix}-m1`,
          Number((3.9 + index * 0.03 - measure * 0.1).toFixed(2)),
        ],
        [row[0], `${prefix}-m2`, 30 + index * 2 + measure * 5],
      ]),
      'session_id,metric_id',
    );
  }
  await db.batch(statements);
  return {
    ready: true,
    alreadyPrepared: false,
    athletes: people.length,
    groups: 3,
    routines: 3,
    evaluations: 24,
  };
}
