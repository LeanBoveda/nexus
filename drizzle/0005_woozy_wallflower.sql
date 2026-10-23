CREATE TABLE `routine_files` (
	`routine_id` text NOT NULL,
	`file_id` text NOT NULL,
	PRIMARY KEY(`routine_id`, `file_id`),
	FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE cascade
);
