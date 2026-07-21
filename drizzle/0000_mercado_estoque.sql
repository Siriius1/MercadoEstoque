CREATE TABLE `movements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`type` text NOT NULL,
	`quantity` real NOT NULL,
	`previous_stock` real NOT NULL,
	`resulting_stock` real NOT NULL,
	`unit_cost` real DEFAULT 0 NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `movements_product_idx` ON `movements` (`product_id`);--> statement-breakpoint
CREATE INDEX `movements_created_idx` ON `movements` (`created_at`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sku` text NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT 'Mercearia' NOT NULL,
	`unit` text DEFAULT 'un' NOT NULL,
	`cost_price` real DEFAULT 0 NOT NULL,
	`sale_price` real DEFAULT 0 NOT NULL,
	`current_stock` real DEFAULT 0 NOT NULL,
	`minimum_stock` real DEFAULT 0 NOT NULL,
	`supplier_id` integer,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_sku_unique` ON `products` (`sku`);--> statement-breakpoint
CREATE INDEX `products_supplier_idx` ON `products` (`supplier_id`);--> statement-breakpoint
CREATE INDEX `products_name_idx` ON `products` (`name`);--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`document` text DEFAULT '' NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `suppliers` (`name`,`document`,`contact`,`email`,`phone`) VALUES
('Walmart Distribuição','00.000.000/0001-00','Central comercial','compras@walmart.com.br','(11) 4000-1000'),
('Atacado Brasil','11.111.111/0001-11','Marina Souza','pedidos@atacadobrasil.com.br','(11) 4000-2000');
--> statement-breakpoint
INSERT INTO `products` (`sku`,`name`,`category`,`unit`,`cost_price`,`sale_price`,`current_stock`,`minimum_stock`,`supplier_id`) VALUES
('#0001','Macarrão','Massas','un',3.20,5.99,24,8,1),
('#0002','Manga','Hortifrúti','kg',4.10,7.00,5,10,NULL),
('#0004','Leite','Laticínios','un',4.89,6.49,16,8,2),
('#0005','Arroz','Grãos','pct',18.50,25.90,15,6,2),
('#0006','Salgadinho','Mercearia','un',5.30,8.99,10,5,NULL),
('#0007','Feijão','Grãos','pct',6.20,10.99,7,8,1),
('#0008','Danone','Laticínios','un',2.40,4.50,20,10,1),
('#0010','Sal','Mercearia','pct',2.00,4.00,32,8,1);
