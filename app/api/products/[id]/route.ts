import { and, eq } from "drizzle-orm";
import { getD1, getDb } from "../../../../db";
import { movements, products } from "../../../../db/schema";
import { getSessionUser } from "../../../auth";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request);
  if (!user) return Response.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 });
  const { id } = await context.params;
  const productId = Number(id);
  const body = await request.json() as Record<string, unknown>;
  const db = await getDb();
  const [existing] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.companyId, user.companyId))).limit(1);
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
  if (!Number.isInteger(currentStock) || currentStock < 0) return Response.json({ error: "O estoque deve ser informado em unidades inteiras." }, { status: 400 });
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
  }).where(and(eq(products.id, productId), eq(products.companyId, user.companyId))).returning();
  if (currentStock !== existing.currentStock) {
    await db.insert(movements).values({
      companyId: user.companyId,
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
  const user = await getSessionUser(request);
  if (!user) return Response.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 });
  const { id } = await context.params;
  const productId = Number(id);
  if (!Number.isInteger(productId)) return Response.json({ error: "Produto inválido." }, { status: 400 });
  const d1 = await getD1();
  const product = await d1.prepare("SELECT id FROM products WHERE id = ? AND company_id = ?").bind(productId, user.companyId).first();
  if (!product) return Response.json({ error: "Produto não encontrado." }, { status: 404 });
  await d1.batch([
    d1.prepare("DELETE FROM movements WHERE product_id = ? AND company_id = ?").bind(productId, user.companyId),
    d1.prepare("DELETE FROM products WHERE id = ? AND company_id = ?").bind(productId, user.companyId),
  ]);
  return Response.json({ success: true });
}
