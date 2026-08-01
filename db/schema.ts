import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const companies = sqliteTable("companies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  publicKey: text("public_key").notNull().unique(),
  name: text("name").notNull(),
  isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const suppliers = sqliteTable("suppliers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id").notNull().default(1).references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  document: text("document").notNull().default(""),
  contact: text("contact").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("suppliers_company_idx").on(table.companyId)]);

export const productSequence = sqliteTable("product_sequence", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id").notNull().default(1).unique().references(() => companies.id, { onDelete: "cascade" }),
  lastValue: integer("last_value").notNull().default(0),
});

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id").notNull().default(1).references(() => companies.id, { onDelete: "cascade" }),
  sku: text("sku").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull().default("Mercearia"),
  unit: text("unit").notNull().default("un"),
  costPrice: real("cost_price").notNull().default(0),
  salePrice: real("sale_price").notNull().default(0),
  salePriceUpdatedAt: text("sale_price_updated_at").default(sql`CURRENT_TIMESTAMP`),
  currentStock: real("current_stock").notNull().default(0),
  minimumStock: real("minimum_stock").notNull().default(5),
  supplierId: integer("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("products_company_sku_unique").on(table.companyId, table.sku),
  index("products_company_idx").on(table.companyId),
  index("products_supplier_idx").on(table.supplierId),
  index("products_name_idx").on(table.name),
]);

export const movements = sqliteTable("movements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id").notNull().default(1).references(() => companies.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  type: text("type", { enum: ["entrada", "saida", "ajuste"] }).notNull(),
  quantity: real("quantity").notNull(),
  previousStock: real("previous_stock").notNull(),
  resultingStock: real("resulting_stock").notNull(),
  unitCost: real("unit_cost").notNull().default(0),
  reason: text("reason").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("movements_company_idx").on(table.companyId), index("movements_product_idx").on(table.productId), index("movements_created_idx").on(table.createdAt)]);

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id").notNull().default(1).references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  googleSub: text("google_sub").unique(),
  emailVerifiedAt: text("email_verified_at"),
  approvalStatus: text("approval_status", { enum: ["pending", "approved", "rejected"] }).notNull().default("approved"),
  role: text("role").notNull().default("admin"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("users_company_idx").on(table.companyId), index("users_email_idx").on(table.email)]);

export const authSessions = sqliteTable("auth_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("auth_sessions_user_idx").on(table.userId), index("auth_sessions_token_idx").on(table.tokenHash)]);

export const authTokens = sqliteTable("auth_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  type: text("type", { enum: ["verify_email", "reset_password", "employee_invite", "owner_approval"] }).notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("auth_tokens_user_idx").on(table.userId), index("auth_tokens_token_idx").on(table.tokenHash)]);

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull().default(1),
  resetAt: text("reset_at").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("rate_limits_reset_idx").on(table.resetAt)]);

export const paymentSettings = sqliteTable("payment_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id").notNull().default(1).unique().references(() => companies.id, { onDelete: "cascade" }),
  pixEnabled: integer("pix_enabled", { mode: "boolean" }).notNull().default(false),
  pixKeyType: text("pix_key_type").notNull().default("cnpj"),
  pixKey: text("pix_key").notNull().default(""),
  pixReceiverName: text("pix_receiver_name").notNull().default(""),
  pixCity: text("pix_city").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
