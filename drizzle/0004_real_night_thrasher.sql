ALTER TABLE `users` ADD `google_sub` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_sub_unique` ON `users` (`google_sub`);