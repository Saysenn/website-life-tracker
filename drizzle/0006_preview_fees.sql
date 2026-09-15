ALTER TABLE `companies` ADD `currency` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `gas_fees` text DEFAULT '{}' NOT NULL;