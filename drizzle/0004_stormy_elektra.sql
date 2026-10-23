CREATE TABLE `athlete_identities` (
	`athlete_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`athlete_id`) REFERENCES `athletes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `athlete_identities_user_idx` ON `athlete_identities` (`user_id`);--> statement-breakpoint
CREATE TABLE `email_delivery_events` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_hash` text NOT NULL,
	`status` text NOT NULL,
	`error_code` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `email_delivery_events_created_idx` ON `email_delivery_events` (`created_at`);--> statement-breakpoint
DROP INDEX `athletes_email_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `athletes_account_email_unique` ON `athletes` (`trainer_account_id`,lower(trim("email")));--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD `active_athlete_id` text REFERENCES athletes(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD `scoped_athlete_id` text REFERENCES athletes(id) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `evaluation_metrics` ADD `archived_at` integer;--> statement-breakpoint
ALTER TABLE `evaluation_sessions` ADD `archived_at` integer;--> statement-breakpoint
ALTER TABLE `evaluation_templates` ADD `archived_at` integer;--> statement-breakpoint
ALTER TABLE `workout_logs` ADD `entry_key` text;--> statement-breakpoint
ALTER TABLE `workout_logs` ADD `trained_on` text;--> statement-breakpoint
ALTER TABLE `workout_logs` ADD `updated_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `workout_logs_entry_key_unique` ON `workout_logs` (`entry_key`);
