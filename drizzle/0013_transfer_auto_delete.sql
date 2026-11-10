ALTER TABLE `transfer_link` ADD `auto_delete` integer DEFAULT true NOT NULL;--> statement-breakpoint
UPDATE `transfer_files` SET `expires_at` = (SELECT `created_at` + 604800000 FROM `transfer_chats` WHERE `transfer_chats`.`id` = `transfer_files`.`chat_id`) WHERE `chat_id` IN (SELECT `id` FROM `transfer_chats`);
