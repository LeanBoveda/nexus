CREATE TABLE `trainer_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`business_name` text NOT NULL,
	`slug` text NOT NULL,
	`owner_user_id` text,
	`contact_email` text NOT NULL,
	`country_code` text(2) DEFAULT 'AR' NOT NULL,
	`access_status` text DEFAULT 'active' NOT NULL,
	`subscription_status` text DEFAULT 'trialing' NOT NULL,
	`plan` text DEFAULT 'starter' NOT NULL,
	`monthly_price_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'ARS' NOT NULL,
	`max_athletes` integer DEFAULT 30 NOT NULL,
	`trial_ends_at` integer,
	`current_period_ends_at` integer,
	`notes` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trainer_accounts_slug_unique` ON `trainer_accounts` (`slug`);--> statement-breakpoint
CREATE INDEX `trainer_accounts_status_idx` ON `trainer_accounts` (`access_status`,`subscription_status`);--> statement-breakpoint
ALTER TABLE `athletes` ADD `trainer_account_id` text REFERENCES trainer_accounts(id);--> statement-breakpoint
ALTER TABLE `evaluation_templates` ADD `trainer_account_id` text REFERENCES trainer_accounts(id);--> statement-breakpoint
ALTER TABLE `files` ADD `trainer_account_id` text REFERENCES trainer_accounts(id);--> statement-breakpoint
ALTER TABLE `organizations` ADD `trainer_account_id` text REFERENCES trainer_accounts(id);--> statement-breakpoint
ALTER TABLE `routines` ADD `trainer_account_id` text REFERENCES trainer_accounts(id);--> statement-breakpoint
ALTER TABLE `users` ADD `trainer_account_id` text REFERENCES trainer_accounts(id);--> statement-breakpoint
ALTER TABLE `users` ADD `is_platform_admin` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `users_trainer_account_idx` ON `users` (`trainer_account_id`);