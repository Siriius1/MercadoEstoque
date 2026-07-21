import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { products, suppliers } from "../../../db/schema";

export async function GET() {
  const rows = await (await getDb()).select({ id: suppliers.id, name: suppliers.name, document: suppliers.document, contact: suppliers.contact, email: suppliers.email, phone: suppliers.phone, active: suppliers.active, productCount: sql<number>`count(${products.id})` }).from(suppliers).leftJoin(products, eq(suppliers.id, products.supplierId)).groupBy(suppliers.id).orderBy(asc(suppliers.name));
  return Response.json({ suppliers: rows });
}

export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  if (!name) return Response.json({ error: "Nome é obrigatório." }, { status: 400 });
  const [supplier] = await (await getDb()).insert(suppliers).values({ name, document: String(body.document ?? ""), contact: String(body.contact ?? ""), email: String(body.email ?? ""), phone: String(body.phone ?? "") }).returning();
  return Response.json({ supplier }, { status: 201 });
}
