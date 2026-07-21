import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { products } from "../../../../db/schema";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json() as Record<string, unknown>;
  const [product] = await (await getDb()).update(products).set({ sku: String(body.sku ?? "").trim(), name: String(body.name ?? "").trim(), category: String(body.category ?? "Mercearia"), unit: String(body.unit ?? "un"), costPrice: Number(body.costPrice) || 0, salePrice: Number(body.salePrice) || 0, minimumStock: Number(body.minimumStock) || 0, supplierId: body.supplierId ? Number(body.supplierId) : null, active: body.active !== false, updatedAt: new Date().toISOString() }).where(eq(products.id, Number(id))).returning();
  return product ? Response.json({ product }) : Response.json({ error: "Produto não encontrado." }, { status: 404 });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  await (await getDb()).update(products).set({ active: false, updatedAt: new Date().toISOString() }).where(eq(products.id, Number(id)));
  return Response.json({ success: true });
}
