import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { suppliers } from "../../../../db/schema";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json() as Record<string, unknown>;
  const [supplier] = await (await getDb()).update(suppliers).set({ name: String(body.name ?? "").trim(), document: String(body.document ?? ""), contact: String(body.contact ?? ""), email: String(body.email ?? ""), phone: String(body.phone ?? ""), active: body.active !== false, updatedAt: new Date().toISOString() }).where(eq(suppliers.id, Number(id))).returning();
  return supplier ? Response.json({ supplier }) : Response.json({ error: "Fornecedor não encontrado." }, { status: 404 });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  await (await getDb()).update(suppliers).set({ active: false, updatedAt: new Date().toISOString() }).where(eq(suppliers.id, Number(id)));
  return Response.json({ success: true });
}
