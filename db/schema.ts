import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const createdAt = integer('created_at', { mode: 'timestamp_ms' })
  .notNull()
  .default(sql`(unixepoch() * 1000)`);

export const organizations = sqliteTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type', { enum: ['national_team', 'club', 'gym', 'independent'] }).notNull(),
  countryCode: text('country_code', { length: 2 }),
  createdAt,
});

export const groups = sqliteTable(
  'groups',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sport: text('sport', { enum: ['handball_indoor', 'beach_handball', 'general'] }).notNull(),
    season: text('season'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt,
  },
  (table) => [index('groups_organization_idx').on(table.organizationId)],
);

export const athletes = sqliteTable(
  'athletes',
  {
    id: text('id').primaryKey(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    documentFingerprint: text('document_fingerprint'),
    birthDate: text('birth_date'),
    countryCode: text('country_code', { length: 2 }),
    primaryPosition: text('primary_position'),
    primaryContext: text('primary_context'),
    status: text('status', { enum: ['active', 'paused', 'archived'] }).notNull().default('active'),
    createdAt,
  },
  (table) => [uniqueIndex('athletes_email_unique').on(table.email), index('athletes_status_idx').on(table.status)],
);

export const groupMemberships = sqliteTable(
  'group_memberships',
  {
    athleteId: text('athlete_id').notNull().references(() => athletes.id, { onDelete: 'cascade' }),
    groupId: text('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
    role: text('role'),
    joinedAt: integer('joined_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
    endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
  },
  (table) => [primaryKey({ columns: [table.athleteId, table.groupId] }), index('memberships_group_idx').on(table.groupId)],
);

export const routines = sqliteTable(
  'routines',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    description: text('description'),
    status: text('status', { enum: ['draft', 'published', 'archived'] }).notNull().default('draft'),
    createdBy: text('created_by').notNull(),
    createdAt,
  },
  (table) => [index('routines_organization_idx').on(table.organizationId)],
);

export const routineVersions = sqliteTable(
  'routine_versions',
  {
    id: text('id').primaryKey(),
    routineId: text('routine_id').notNull().references(() => routines.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    content: text('content', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    sourceFileId: text('source_file_id'),
    createdAt,
  },
  (table) => [uniqueIndex('routine_versions_number_unique').on(table.routineId, table.versionNumber), index('routine_versions_routine_idx').on(table.routineId)],
);

export const routineAssignments = sqliteTable(
  'routine_assignments',
  {
    id: text('id').primaryKey(),
    routineVersionId: text('routine_version_id').notNull().references(() => routineVersions.id, { onDelete: 'restrict' }),
    targetType: text('target_type', { enum: ['group', 'athlete'] }).notNull(),
    targetId: text('target_id').notNull(),
    startsOn: text('starts_on').notNull(),
    endsOn: text('ends_on'),
    assignedBy: text('assigned_by').notNull(),
    createdAt,
  },
  (table) => [index('routine_assignments_target_idx').on(table.targetType, table.targetId)],
);

export const athleteRoutineInstances = sqliteTable(
  'athlete_routine_instances',
  {
    id: text('id').primaryKey(),
    assignmentId: text('assignment_id').notNull().references(() => routineAssignments.id, { onDelete: 'cascade' }),
    athleteId: text('athlete_id').notNull().references(() => athletes.id, { onDelete: 'cascade' }),
    overrides: text('overrides', { mode: 'json' }).$type<Record<string, unknown>>(),
    status: text('status', { enum: ['scheduled', 'active', 'completed', 'cancelled'] }).notNull().default('scheduled'),
    createdAt,
  },
  (table) => [uniqueIndex('athlete_routine_instance_unique').on(table.assignmentId, table.athleteId), index('athlete_routine_instances_athlete_idx').on(table.athleteId)],
);

export const workoutLogs = sqliteTable(
  'workout_logs',
  {
    id: text('id').primaryKey(),
    instanceId: text('instance_id').notNull().references(() => athleteRoutineInstances.id, { onDelete: 'cascade' }),
    athleteId: text('athlete_id').notNull().references(() => athletes.id, { onDelete: 'cascade' }),
    sessionKey: text('session_key').notNull(),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    pse: real('pse'),
    pain: real('pain'),
    notes: text('notes'),
    actualValues: text('actual_values', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    createdAt,
  },
  (table) => [index('workout_logs_athlete_date_idx').on(table.athleteId, table.completedAt)],
);

export const evaluationTemplates = sqliteTable('evaluation_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sport: text('sport', { enum: ['handball_indoor', 'beach_handball', 'general'] }).notNull(),
  description: text('description'),
  createdBy: text('created_by').notNull(),
  createdAt,
});

export const evaluationMetrics = sqliteTable(
  'evaluation_metrics',
  {
    id: text('id').primaryKey(),
    templateId: text('template_id').notNull().references(() => evaluationTemplates.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    label: text('label').notNull(),
    unit: text('unit').notNull(),
    betterDirection: text('better_direction', { enum: ['higher', 'lower', 'neutral'] }).notNull(),
    protocol: text('protocol'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [uniqueIndex('evaluation_metrics_key_unique').on(table.templateId, table.key)],
);

export const evaluationSessions = sqliteTable(
  'evaluation_sessions',
  {
    id: text('id').primaryKey(),
    templateId: text('template_id').notNull().references(() => evaluationTemplates.id, { onDelete: 'restrict' }),
    athleteId: text('athlete_id').notNull().references(() => athletes.id, { onDelete: 'cascade' }),
    groupId: text('group_id').references(() => groups.id, { onDelete: 'set null' }),
    evaluatedAt: integer('evaluated_at', { mode: 'timestamp_ms' }).notNull(),
    surface: text('surface', { enum: ['indoor', 'sand', 'gym', 'other'] }).notNull(),
    notes: text('notes'),
    createdAt,
  },
  (table) => [index('evaluation_sessions_athlete_date_idx').on(table.athleteId, table.evaluatedAt)],
);

export const evaluationResults = sqliteTable(
  'evaluation_results',
  {
    sessionId: text('session_id').notNull().references(() => evaluationSessions.id, { onDelete: 'cascade' }),
    metricId: text('metric_id').notNull().references(() => evaluationMetrics.id, { onDelete: 'restrict' }),
    value: real('value').notNull(),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.metricId] })],
);

export const files = sqliteTable(
  'files',
  {
    id: text('id').primaryKey(),
    storageKey: text('storage_key').notNull(),
    originalName: text('original_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    uploadedBy: text('uploaded_by').notNull(),
    createdAt,
  },
  (table) => [uniqueIndex('files_storage_key_unique').on(table.storageKey)],
);
