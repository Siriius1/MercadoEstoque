import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { products, suppliers } from "../../../db/schema";
import { formatPhone, isValidEmail, normalizeEmail } from "../../validation";
import { requireApiUser } from "../../auth";

export async function GET(request: Request) {
  const unauthorized = await requireApiUser(request);
  if (unauthorized) return unauthorized;
  const rows = await (await getDb()).select({ id: suppliers.id, name: suppliers.name, document: suppliers.document, contact: suppliers.contact, email: suppliers.email, phone: suppliers.phone, active: suppliers.active, productCount: sql<number>`count(${products.id})` }).from(suppliers).leftJoin(products, eq(suppliers.id, products.supplierId)).groupBy(suppliers.id).orderBy(asc(suppliers.name));
  return Response.json({ suppliers: rows });
}

export async function POST(request: Request) {
  const unauthorized = await requireApiUser(request);
  if (unauthorized) return unauthorized;
  const body = await request.json() as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  if (!name) return Response.json({ error: "Nome é obrigatório." }, { status: 400 });
  const email = normalizeEmail(body.email);
  if (email && !isValidEmail(email)) return Response.json({ error: "Informe um e-mail válido." }, { status: 400 });
  const [supplier] = await (await getDb()).insert(suppliers).values({ name, document: String(body.document ?? ""), contact: String(body.contact ?? ""), email, phone: formatPhone(body.phone) }).returning();
  return Response.json({ supplier }, { status: 201 });
}
