ALTER TABLE `auth_sessions` ADD `password_setup` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `password_configured_at` integer;