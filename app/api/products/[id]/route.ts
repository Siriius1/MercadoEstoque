import { eq } from "drizzle-orm";
import { getD1, getDb } from "../../../../db";
import { products } from "../../../../db/schema";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const productId = Number(id);
  const body = await request.json() as Record<string, unknown>;
  const db = await getDb();
  const [existing] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!existing) return Response.json({ error: "Produto não encontrado." }, { status: 404 });

  const requestedSalePrice = Number(body.salePrice);
  const salePrice = Number.isFinite(requestedSalePrice) ? requestedSalePrice : existing.salePrice;
  const now = new Date().toISOString();
  const [product] = await db.update(products).set({
    name: String(body.name ?? "").trim(),
    category: String(body.category ?? "Mercearia"),
    unit: String(body.unit ?? "un"),
    costPrice: Number(body.costPrice) || 0,
    salePrice,
    salePriceUpdatedAt: salePrice !== existing.salePrice ? now : existing.salePriceUpdatedAt,
    minimumStock: Number(body.minimumStock) || 0,
    supplierId: body.supplierId ? Number(body.supplierId) : null,
    active: body.active !== false,
    updatedAt: now,
  }).where(eq(products.id, productId)).returning();
  return Response.json({ product });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const productId = Number(id);
  if (!Number.isInteger(productId)) return Response.json({ error: "Produto inválido." }, { status: 400 });
  const d1 = await getD1();
  const product = await d1.prepare("SELECT id FROM products WHERE id = ?").bind(productId).first();
  if (!product) return Response.json({ error: "Produto não encontrado." }, { status: 404 });
  await d1.batch([
    d1.prepare("DELETE FROM movements WHERE product_id = ?").bind(productId),
    d1.prepare("DELETE FROM products WHERE id = ?").bind(productId),
  ]);
  return Response.json({ success: true });
}
