CREATE TABLE `transfer_chats` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`ip` text,
	`location` text,
	`user_agent` text,
	`blocked` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`active_at` integer NOT NULL,
	`guest_seen_at` integer,
	`admin_seen_at` integer,
	`guest_typing_at` integer,
	`admin_typing_at` integer,
	`guest_read_id` integer DEFAULT 0 NOT NULL,
	`admin_read_id` integer DEFAULT 0 NOT NULL,
	`notified_at` integer
);
--> statement-breakpoint
CREATE INDEX `transfer_chats_active_idx` ON `transfer_chats` (`active_at`);--> statement-breakpoint
CREATE INDEX `transfer_chats_ip_idx` ON `transfer_chats` (`ip`,`created_at`);--> statement-breakpoint
CREATE TABLE `transfer_chunks` (
	`file_id` text NOT NULL,
	`idx` integer NOT NULL,
	`data` blob NOT NULL,
	PRIMARY KEY(`file_id`, `idx`)
);
--> statement-breakpoint
CREATE TABLE `transfer_files` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`sender` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`size` integer NOT NULL,
	`chunk_size` integer NOT NULL,
	`chunk_count` integer NOT NULL,
	`status` text DEFAULT 'uploading' NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `transfer_files_chat_idx` ON `transfer_files` (`chat_id`);--> statement-breakpoint
CREATE INDEX `transfer_files_expires_idx` ON `transfer_files` (`expires_at`);--> statement-breakpoint
CREATE TABLE `transfer_link` (
	`id` integer PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`rotated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transfer_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chat_id` text NOT NULL,
	`sender` text NOT NULL,
	`body` text,
	`file_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `transfer_messages_chat_idx` ON `transfer_messages` (`chat_id`,`id`);