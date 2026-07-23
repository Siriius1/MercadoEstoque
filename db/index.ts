import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

let initialization: Promise<void> | null = null;

async function initializeDatabase() {
  if (!env.DB) throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  const d1 = env.DB;
  await d1.batch([
    d1.prepare("CREATE TABLE IF NOT EXISTS suppliers (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, name text NOT NULL, document text DEFAULT '' NOT NULL, contact text DEFAULT '' NOT NULL, email text DEFAULT '' NOT NULL, phone text DEFAULT '' NOT NULL, active integer DEFAULT 1 NOT NULL, created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS products (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, sku text NOT NULL UNIQUE, name text NOT NULL, category text DEFAULT 'Mercearia' NOT NULL, unit text DEFAULT 'un' NOT NULL, cost_price real DEFAULT 0 NOT NULL, sale_price real DEFAULT 0 NOT NULL, sale_price_updated_at text DEFAULT CURRENT_TIMESTAMP, current_stock real DEFAULT 0 NOT NULL, minimum_stock real DEFAULT 0 NOT NULL, supplier_id integer REFERENCES suppliers(id) ON DELETE SET NULL, active integer DEFAULT 1 NOT NULL, created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS movements (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, product_id integer NOT NULL REFERENCES products(id) ON DELETE RESTRICT, type text NOT NULL, quantity real NOT NULL, previous_stock real NOT NULL, resulting_stock real NOT NULL, unit_cost real DEFAULT 0 NOT NULL, reason text DEFAULT '' NOT NULL, notes text DEFAULT '' NOT NULL, created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS product_sequence (id integer PRIMARY KEY NOT NULL, last_value integer DEFAULT 0 NOT NULL)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS products_supplier_idx ON products (supplier_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS products_name_idx ON products (name)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS movements_product_idx ON movements (product_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS movements_created_idx ON movements (created_at)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS users (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, name text NOT NULL, email text NOT NULL UNIQUE, password_hash text NOT NULL, google_sub text UNIQUE, email_verified_at text, role text DEFAULT 'admin' NOT NULL, created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS auth_sessions (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash text NOT NULL UNIQUE, expires_at text NOT NULL, created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS auth_tokens (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash text NOT NULL UNIQUE, type text NOT NULL, expires_at text NOT NULL, used_at text, created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS users_email_idx ON users (email)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions (user_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS auth_sessions_token_idx ON auth_sessions (token_hash)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS auth_tokens_user_idx ON auth_tokens (user_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS auth_tokens_token_idx ON auth_tokens (token_hash)"),
  ]);
  const productColumns = await d1.prepare("PRAGMA table_info(products)").all<{ name: string }>();
  if (!productColumns.results.some((column) => column.name === "sale_price_updated_at")) {
    await d1.prepare("ALTER TABLE products ADD COLUMN sale_price_updated_at text").run();
    await d1.prepare("UPDATE products SET sale_price_updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP) WHERE sale_price_updated_at IS NULL").run();
  }
  const userColumns = await d1.prepare("PRAGMA table_info(users)").all<{ name: string }>();
  if (!userColumns.results.some((column) => column.name === "google_sub")) {
    await d1.prepare("ALTER TABLE users ADD COLUMN google_sub text").run();
    await d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_unique ON users (google_sub)").run();
  }
  const count = await d1.prepare("SELECT count(*) AS total FROM products").first<{ total: number }>();
  if (!count?.total) await d1.batch([
    d1.prepare("INSERT INTO suppliers (name,document,contact,email,phone) VALUES (?,?,?,?,?)").bind("Walmart Distribuição", "00.000.000/0001-00", "Central comercial", "compras@walmart.com.br", "(11) 4000-1000"),
    d1.prepare("INSERT INTO suppliers (name,document,contact,email,phone) VALUES (?,?,?,?,?)").bind("Atacado Brasil", "11.111.111/0001-11", "Marina Souza", "pedidos@atacadobrasil.com.br", "(11) 4000-2000"),
    d1.prepare("INSERT INTO products (sku,name,category,unit,cost_price,sale_price,current_stock,minimum_stock,supplier_id) VALUES (?,?,?,?,?,?,?,?,?)").bind("#0001", "Macarrão", "Massas", "un", 3.2, 5.99, 24, 8, 1),
    d1.prepare("INSERT INTO products (sku,name,category,unit,cost_price,sale_price,current_stock,minimum_stock,supplier_id) VALUES (?,?,?,?,?,?,?,?,?)").bind("#0002", "Manga", "Hortifrúti", "kg", 4.1, 7, 5, 10, null),
    d1.prepare("INSERT INTO products (sku,name,category,unit,cost_price,sale_price,current_stock,minimum_stock,supplier_id) VALUES (?,?,?,?,?,?,?,?,?)").bind("#0004", "Leite", "Laticínios", "un", 4.89, 6.49, 16, 8, 2),
    d1.prepare("INSERT INTO products (sku,name,category,unit,cost_price,sale_price,current_stock,minimum_stock,supplier_id) VALUES (?,?,?,?,?,?,?,?,?)").bind("#0005", "Arroz", "Grãos", "pct", 18.5, 25.9, 15, 6, 2),
    d1.prepare("INSERT INTO products (sku,name,category,unit,cost_price,sale_price,current_stock,minimum_stock,supplier_id) VALUES (?,?,?,?,?,?,?,?,?)").bind("#0006", "Salgadinho", "Mercearia", "un", 5.3, 8.99, 10, 5, null),
    d1.prepare("INSERT INTO products (sku,name,category,unit,cost_price,sale_price,current_stock,minimum_stock,supplier_id) VALUES (?,?,?,?,?,?,?,?,?)").bind("#0007", "Feijão", "Grãos", "pct", 6.2, 10.99, 7, 8, 1),
    d1.prepare("INSERT INTO products (sku,name,category,unit,cost_price,sale_price,current_stock,minimum_stock,supplier_id) VALUES (?,?,?,?,?,?,?,?,?)").bind("#0008", "Danone", "Laticínios", "un", 2.4, 4.5, 20, 10, 1),
    d1.prepare("INSERT INTO products (sku,name,category,unit,cost_price,sale_price,current_stock,minimum_stock,supplier_id) VALUES (?,?,?,?,?,?,?,?,?)").bind("#0010", "Sal", "Mercearia", "pct", 2, 4, 32, 8, 1),
  ]);
  await d1.prepare("INSERT OR IGNORE INTO product_sequence (id, last_value) SELECT 1, COALESCE(MAX(CAST(REPLACE(sku, '#', '') AS INTEGER)), 0) FROM products").run();
}

export async function getDb() {
  initialization ??= initializeDatabase();
  await initialization;
  return drizzle(env.DB, { schema });
}

export async function getD1() {
  initialization ??= initializeDatabase();
  await initialization;
  return env.DB;
}
