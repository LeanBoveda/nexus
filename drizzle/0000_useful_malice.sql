CREATE TABLE `athlete_routine_instances` (
	`id` text PRIMARY KEY NOT NULL,
	`assignment_id` text NOT NULL,
	`athlete_id` text NOT NULL,
	`overrides` text,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`assignment_id`) REFERENCES `routine_assignments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`athlete_id`) REFERENCES `athletes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `athlete_routine_instance_unique` ON `athlete_routine_instances` (`assignment_id`,`athlete_id`);--> statement-breakpoint
CREATE INDEX `athlete_routine_instances_athlete_idx` ON `athlete_routine_instances` (`athlete_id`);--> statement-breakpoint
CREATE TABLE `athletes` (
	`id` text PRIMARY KEY NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text,
	`document_fingerprint` text,
	`birth_date` text,
	`country_code` text(2),
	`primary_position` text,
	`primary_context` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `athletes_email_unique` ON `athletes` (`email`);--> statement-breakpoint
CREATE INDEX `athletes_status_idx` ON `athletes` (`status`);--> statement-breakpoint
CREATE TABLE `evaluation_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`unit` text NOT NULL,
	`better_direction` text NOT NULL,
	`protocol` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `evaluation_templates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `evaluation_metrics_key_unique` ON `evaluation_metrics` (`template_id`,`key`);--> statement-breakpoint
CREATE TABLE `evaluation_results` (
	`session_id` text NOT NULL,
	`metric_id` text NOT NULL,
	`value` real NOT NULL,
	PRIMARY KEY(`session_id`, `metric_id`),
	FOREIGN KEY (`session_id`) REFERENCES `evaluation_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`metric_id`) REFERENCES `evaluation_metrics`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `evaluation_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`athlete_id` text NOT NULL,
	`group_id` text,
	`evaluated_at` integer NOT NULL,
	`surface` text NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `evaluation_templates`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`athlete_id`) REFERENCES `athletes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `evaluation_sessions_athlete_date_idx` ON `evaluation_sessions` (`athlete_id`,`evaluated_at`);--> statement-breakpoint
CREATE TABLE `evaluation_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sport` text NOT NULL,
	`description` text,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`storage_key` text NOT NULL,
	`original_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`uploaded_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `files_storage_key_unique` ON `files` (`storage_key`);--> statement-breakpoint
CREATE TABLE `group_memberships` (
	`athlete_id` text NOT NULL,
	`group_id` text NOT NULL,
	`role` text,
	`joined_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`ended_at` integer,
	PRIMARY KEY(`athlete_id`, `group_id`),
	FOREIGN KEY (`athlete_id`) REFERENCES `athletes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `memberships_group_idx` ON `group_memberships` (`group_id`);--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`sport` text NOT NULL,
	`season` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `groups_organization_idx` ON `groups` (`organization_id`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`country_code` text(2),
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `routine_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_version_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text,
	`assigned_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`routine_version_id`) REFERENCES `routine_versions`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `routine_assignments_target_idx` ON `routine_assignments` (`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `routine_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`content` text NOT NULL,
	`source_file_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `routine_versions_number_unique` ON `routine_versions` (`routine_id`,`version_number`);--> statement-breakpoint
CREATE INDEX `routine_versions_routine_idx` ON `routine_versions` (`routine_id`);--> statement-breakpoint
CREATE TABLE `routines` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`name` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `routines_organization_idx` ON `routines` (`organization_id`);--> statement-breakpoint
CREATE TABLE `workout_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text NOT NULL,
	`athlete_id` text NOT NULL,
	`session_key` text NOT NULL,
	`completed_at` integer,
	`pse` real,
	`pain` real,
	`notes` text,
	`actual_values` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `athlete_routine_instances`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`athlete_id`) REFERENCES `athletes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workout_logs_athlete_date_idx` ON `workout_logs` (`athlete_id`,`completed_at`);