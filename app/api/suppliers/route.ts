import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { products, suppliers } from "../../../db/schema";
import { formatDocument, formatPhone, isValidDocument, isValidEmail, normalizeEmail } from "../../validation";
import { getSessionUser } from "../../auth";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return Response.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 });
  const rows = await (await getDb()).select({ id: suppliers.id, name: suppliers.name, document: suppliers.document, contact: suppliers.contact, email: suppliers.email, phone: suppliers.phone, active: suppliers.active, productCount: sql<number>`count(${products.id})` }).from(suppliers).leftJoin(products, and(eq(suppliers.id, products.supplierId), eq(products.companyId, user.companyId))).where(eq(suppliers.companyId, user.companyId)).groupBy(suppliers.id).orderBy(asc(suppliers.name));
  return Response.json({ suppliers: rows });
}

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return Response.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  if (!name) return Response.json({ error: "Nome é obrigatório." }, { status: 400 });
  const email = normalizeEmail(body.email);
  if (email && !isValidEmail(email)) return Response.json({ error: "Informe um e-mail válido." }, { status: 400 });
  if (!isValidDocument(body.document)) return Response.json({ error: "Informe um CPF com 11 números ou um CNPJ com 14 números." }, { status: 400 });
  const [supplier] = await (await getDb()).insert(suppliers).values({ companyId: user.companyId, name, document: formatDocument(body.document), contact: String(body.contact ?? ""), email, phone: formatPhone(body.phone) }).returning();
  return Response.json({ supplier }, { status: 201 });
}
