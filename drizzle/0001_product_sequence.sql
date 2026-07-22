CREATE TABLE `product_sequence` (
	`id` integer PRIMARY KEY NOT NULL,
	`last_value` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
INSERT INTO `product_sequence` (`id`, `last_value`)
SELECT 1, COALESCE(MAX(CAST(REPLACE(`sku`, '#', '') AS INTEGER)), 0) FROM `products`;
