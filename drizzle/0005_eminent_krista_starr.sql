CREATE TABLE `payment_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`pix_enabled` integer DEFAULT false NOT NULL,
	`pix_key_type` text DEFAULT 'cnpj' NOT NULL,
	`pix_key` text DEFAULT '' NOT NULL,
	`pix_receiver_name` text DEFAULT '' NOT NULL,
	`pix_city` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
