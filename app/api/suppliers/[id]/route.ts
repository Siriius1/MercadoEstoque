import { eq } from "drizzle-orm";
import { getD1, getDb } from "../../../../db";
import { suppliers } from "../../../../db/schema";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json() as Record<string, unknown>;
  const [supplier] = await (await getDb()).update(suppliers).set({ name: String(body.name ?? "").trim(), document: String(body.document ?? ""), contact: String(body.contact ?? ""), email: String(body.email ?? ""), phone: String(body.phone ?? ""), active: body.active !== false, updatedAt: new Date().toISOString() }).where(eq(suppliers.id, Number(id))).returning();
  return supplier ? Response.json({ supplier }) : Response.json({ error: "Fornecedor não encontrado." }, { status: 404 });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supplierId = Number(id);
  if (!Number.isInteger(supplierId)) return Response.json({ error: "Fornecedor inválido." }, { status: 400 });
  const d1 = await getD1();
  const supplier = await d1.prepare("SELECT id FROM suppliers WHERE id = ?").bind(supplierId).first();
  if (!supplier) return Response.json({ error: "Fornecedor não encontrado." }, { status: 404 });
  const count = await d1.prepare("SELECT count(*) AS total FROM products WHERE supplier_id = ?").bind(supplierId).first<{ total: number }>();
  await d1.batch([
    d1.prepare("DELETE FROM movements WHERE product_id IN (SELECT id FROM products WHERE supplier_id = ?)").bind(supplierId),
    d1.prepare("DELETE FROM products WHERE supplier_id = ?").bind(supplierId),
    d1.prepare("DELETE FROM suppliers WHERE id = ?").bind(supplierId),
  ]);
  return Response.json({ success: true, deletedProducts: count?.total ?? 0 });
}
