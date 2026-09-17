CREATE TABLE `digest_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`day` text NOT NULL,
	`round` text NOT NULL,
	`items` integer DEFAULT 0 NOT NULL,
	`sent_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `digest_log_unique` ON `digest_log` (`day`,`round`);