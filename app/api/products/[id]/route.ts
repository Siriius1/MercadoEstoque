import { eq } from "drizzle-orm";
import { getD1, getDb } from "../../../../db";
import { movements, products } from "../../../../db/schema";
import { requireApiUser } from "../../../auth";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireApiUser(request);
  if (unauthorized) return unauthorized;
  const { id } = await context.params;
  const productId = Number(id);
  const body = await request.json() as Record<string, unknown>;
  const db = await getDb();
  const [existing] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!existing) return Response.json({ error: "Produto não encontrado." }, { status: 404 });

  const supplierId = Number(body.supplierId);
  const costPrice = Number(body.costPrice);
  const currentStock = Number(body.currentStock);
  const requestedSalePrice = Number(body.salePrice);
  const salePrice = Number.isFinite(requestedSalePrice) ? requestedSalePrice : existing.salePrice;
  if (!String(body.name ?? "").trim()) return Response.json({ error: "Nome é obrigatório." }, { status: 400 });
  if (!supplierId) return Response.json({ error: "Fornecedor é obrigatório." }, { status: 400 });
  if (!(costPrice > 0)) return Response.json({ error: "Preço de compra deve ser maior que zero." }, { status: 400 });
  if (!(salePrice > 0)) return Response.json({ error: "Preço de venda deve ser maior que zero." }, { status: 400 });
  if (!Number.isFinite(currentStock) || currentStock < 0) return Response.json({ error: "Estoque atual é obrigatório." }, { status: 400 });
  const now = new Date().toISOString();
  const [product] = await db.update(products).set({
    name: String(body.name ?? "").trim(),
    category: String(body.category ?? "Mercearia"),
    unit: String(body.unit ?? "un"),
    costPrice,
    salePrice,
    currentStock,
    salePriceUpdatedAt: salePrice !== existing.salePrice ? now : existing.salePriceUpdatedAt,
    minimumStock: body.minimumStock === undefined ? 5 : Number(body.minimumStock) || 5,
    supplierId,
    active: body.active !== false,
    updatedAt: now,
  }).where(eq(products.id, productId)).returning();
  if (currentStock !== existing.currentStock) {
    await db.insert(movements).values({
      productId,
      type: "ajuste",
      quantity: Math.abs(currentStock - existing.currentStock),
      previousStock: existing.currentStock,
      resultingStock: currentStock,
      unitCost: costPrice,
      reason: "Ajuste pela edição do produto",
      notes: "Saldo alterado no cadastro do produto.",
    });
  }
  return Response.json({ product });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireApiUser(request);
  if (unauthorized) return unauthorized;
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
