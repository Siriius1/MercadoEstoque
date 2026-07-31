CREATE TABLE `companies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_key` text NOT NULL,
	`name` text NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_public_key_unique` ON `companies` (`public_key`);--> statement-breakpoint
INSERT INTO `companies` (`id`, `public_key`, `name`, `is_demo`) VALUES (1, 'legacy', 'Mercado+', false);--> statement-breakpoint
DROP INDEX `products_sku_unique`;--> statement-breakpoint
ALTER TABLE `products` ADD `company_id` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `products_company_sku_unique` ON `products` (`company_id`,`sku`);--> statement-breakpoint
CREATE INDEX `products_company_idx` ON `products` (`company_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_payment_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer DEFAULT 1 NOT NULL,
	`pix_enabled` integer DEFAULT false NOT NULL,
	`pix_key_type` text DEFAULT 'cnpj' NOT NULL,
	`pix_key` text DEFAULT '' NOT NULL,
	`pix_receiver_name` text DEFAULT '' NOT NULL,
	`pix_city` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_payment_settings`("id", "company_id", "pix_enabled", "pix_key_type", "pix_key", "pix_receiver_name", "pix_city", "updated_at") SELECT "id", 1, "pix_enabled", "pix_key_type", "pix_key", "pix_receiver_name", "pix_city", "updated_at" FROM `payment_settings`;--> statement-breakpoint
DROP TABLE `payment_settings`;--> statement-breakpoint
ALTER TABLE `__new_payment_settings` RENAME TO `payment_settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `payment_settings_company_id_unique` ON `payment_settings` (`company_id`);--> statement-breakpoint
CREATE TABLE `__new_product_sequence` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer DEFAULT 1 NOT NULL,
	`last_value` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_product_sequence`("id", "company_id", "last_value") SELECT "id", 1, "last_value" FROM `product_sequence`;--> statement-breakpoint
DROP TABLE `product_sequence`;--> statement-breakpoint
ALTER TABLE `__new_product_sequence` RENAME TO `product_sequence`;--> statement-breakpoint
CREATE UNIQUE INDEX `product_sequence_company_id_unique` ON `product_sequence` (`company_id`);--> statement-breakpoint
ALTER TABLE `movements` ADD `company_id` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX `movements_company_idx` ON `movements` (`company_id`);--> statement-breakpoint
ALTER TABLE `suppliers` ADD `company_id` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX `suppliers_company_idx` ON `suppliers` (`company_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `company_id` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX `users_company_idx` ON `users` (`company_id`);
