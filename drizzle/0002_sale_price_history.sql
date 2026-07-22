ALTER TABLE `products` ADD `sale_price_updated_at` text;
--> statement-breakpoint
UPDATE `products`
SET `sale_price_updated_at` = COALESCE(`updated_at`, CURRENT_TIMESTAMP)
WHERE `sale_price_updated_at` IS NULL;
