import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { movements, products, suppliers } from "../../../db/schema";

export async function GET() {
  const db = await getDb();
  const [summary] = await db.select({ totalProducts: sql<number>`count(*)`, lowStock: sql<number>`sum(case when ${products.currentStock} <= ${products.minimumStock} then 1 else 0 end)`, stockValue: sql<number>`sum(${products.currentStock} * ${products.costPrice})`, retailValue: sql<number>`sum(${products.currentStock} * ${products.salePrice})` }).from(products).where(eq(products.active, true));
  const [supplierSummary] = await db.select({ totalSuppliers: sql<number>`count(*)` }).from(suppliers).where(eq(suppliers.active, true));
  const recent = await db.select({ id: movements.id, productName: products.name, type: movements.type, quantity: movements.quantity, unit: products.unit, createdAt: movements.createdAt }).from(movements).innerJoin(products, eq(movements.productId, products.id)).orderBy(desc(movements.createdAt), desc(movements.id)).limit(6);
  return Response.json({ summary: { ...summary, ...supplierSummary }, recent });
}
