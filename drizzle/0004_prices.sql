ALTER TABLE `companies` ADD `domain_price` real;--> statement-breakpoint
ALTER TABLE `companies` ADD `hosting_price` real;--> statement-breakpoint
ALTER TABLE `companies` ADD `rdp_price` real;--> statement-breakpoint
ALTER TABLE `settings` ADD `currency` text DEFAULT 'GBP' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `usdt_rate` real DEFAULT 1.35 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `service_prices` text DEFAULT '{}' NOT NULL;