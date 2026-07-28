import { eq } from "drizzle-orm";
import { getD1, getDb } from "../../../../db";
import { suppliers } from "../../../../db/schema";
import { formatDocument, formatPhone, isValidDocument, isValidEmail, normalizeEmail } from "../../../validation";
import { requireApiUser } from "../../../auth";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireApiUser(request);
  if (unauthorized) return unauthorized;
  const { id } = await context.params;
  const body = await request.json() as Record<string, unknown>;
  const email = normalizeEmail(body.email);
  if (email && !isValidEmail(email)) return Response.json({ error: "Informe um e-mail válido." }, { status: 400 });
  if (!isValidDocument(body.document)) return Response.json({ error: "Informe um CPF com 11 números ou um CNPJ com 14 números." }, { status: 400 });
  const [supplier] = await (await getDb()).update(suppliers).set({ name: String(body.name ?? "").trim(), document: formatDocument(body.document), contact: String(body.contact ?? ""), email, phone: formatPhone(body.phone), active: body.active !== false, updatedAt: new Date().toISOString() }).where(eq(suppliers.id, Number(id))).returning();
  return supplier ? Response.json({ supplier }) : Response.json({ error: "Fornecedor não encontrado." }, { status: 404 });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireApiUser(request);
  if (unauthorized) return unauthorized;
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
