import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { movements, products } from "../../../db/schema";
import { getSessionUser } from "../../auth";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return Response.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 });
  const rows = await (await getDb()).select({ id: movements.id, productId: movements.productId, productName: products.name, sku: products.sku, unit: products.unit, type: movements.type, quantity: movements.quantity, previousStock: movements.previousStock, resultingStock: movements.resultingStock, unitCost: movements.unitCost, reason: movements.reason, notes: movements.notes, createdAt: movements.createdAt }).from(movements).innerJoin(products, eq(movements.productId, products.id)).where(eq(movements.companyId, user.companyId)).orderBy(desc(movements.createdAt), desc(movements.id)).limit(200);
  return Response.json({ movements: rows });
}

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return Response.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const productId = Number(body.productId);
  const type = String(body.type) as "entrada" | "saida" | "ajuste";
  const quantity = Number(body.quantity);
  if (!productId || !["entrada", "saida", "ajuste"].includes(type) || !Number.isFinite(quantity) || quantity < 0) return Response.json({ error: "Movimentação inválida." }, { status: 400 });
  const db = await getDb();
  const [product] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.companyId, user.companyId))).limit(1);
  if (!product) return Response.json({ error: "Produto não encontrado." }, { status: 404 });
  const resultingStock = type === "entrada" ? product.currentStock + quantity : type === "saida" ? product.currentStock - quantity : quantity;
  if (resultingStock < 0) return Response.json({ error: "A saída é maior que o estoque disponível." }, { status: 400 });
  const movementValues = { companyId: user.companyId, productId, type, quantity: type === "ajuste" ? Math.abs(resultingStock - product.currentStock) : quantity, previousStock: product.currentStock, resultingStock, unitCost: Number(body.unitCost) || product.costPrice, reason: String(body.reason ?? ""), notes: String(body.notes ?? "") };
  const [movement] = await db.insert(movements).values(movementValues).returning();
  await db.update(products).set({ currentStock: resultingStock, updatedAt: new Date().toISOString(), ...(type === "entrada" && Number(body.unitCost) > 0 ? { costPrice: Number(body.unitCost) } : {}) }).where(and(eq(products.id, productId), eq(products.companyId, user.companyId)));
  return Response.json({ movement }, { status: 201 });
}
