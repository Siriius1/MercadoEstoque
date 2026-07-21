import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { products, suppliers } from "../../../db/schema";

export async function GET() {
  const db = await getDb();
  const rows = await db.select({ id: products.id, sku: products.sku, name: products.name, category: products.category, unit: products.unit, costPrice: products.costPrice, salePrice: products.salePrice, currentStock: products.currentStock, minimumStock: products.minimumStock, supplierId: products.supplierId, supplierName: suppliers.name, active: products.active }).from(products).leftJoin(suppliers, eq(products.supplierId, suppliers.id)).orderBy(asc(products.name));
  return Response.json({ products: rows });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    const sku = String(body.sku ?? "").trim();
    if (!name || !sku) return Response.json({ error: "Nome e código são obrigatórios." }, { status: 400 });
    const db = await getDb();
    const [product] = await db.insert(products).values({ sku, name, category: String(body.category ?? "Mercearia"), unit: String(body.unit ?? "un"), costPrice: Number(body.costPrice) || 0, salePrice: Number(body.salePrice) || 0, currentStock: Number(body.currentStock) || 0, minimumStock: Number(body.minimumStock) || 0, supplierId: body.supplierId ? Number(body.supplierId) : null }).returning();
    if (product.currentStock > 0) await db.insert((await import("../../../db/schema")).movements).values({ productId: product.id, type: "entrada", quantity: product.currentStock, previousStock: 0, resultingStock: product.currentStock, unitCost: product.costPrice, reason: "Estoque inicial" });
    return Response.json({ product }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("UNIQUE") ? "Este código já está cadastrado." : "Não foi possível cadastrar o produto.";
    return Response.json({ error: message }, { status: 400 });
  }
}
