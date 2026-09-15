ALTER TABLE `companies` ADD `domain_currency` text;--> statement-breakpoint
ALTER TABLE `companies` ADD `hosting_currency` text;--> statement-breakpoint
ALTER TABLE `companies` ADD `rdp_currency` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `rates` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `rates_updated_at` text;