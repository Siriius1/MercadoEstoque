import { asc, eq } from "drizzle-orm";
import { getD1, getDb } from "../../../db";
import { movements, products, suppliers } from "../../../db/schema";
import { requireApiUser } from "../../auth";

export async function GET(request: Request) {
  const unauthorized = await requireApiUser(request);
  if (unauthorized) return unauthorized;
  const db = await getDb();
  const rows = await db.select({ id: products.id, sku: products.sku, name: products.name, category: products.category, unit: products.unit, costPrice: products.costPrice, salePrice: products.salePrice, salePriceUpdatedAt: products.salePriceUpdatedAt, currentStock: products.currentStock, minimumStock: products.minimumStock, supplierId: products.supplierId, supplierName: suppliers.name, active: products.active }).from(products).leftJoin(suppliers, eq(products.supplierId, suppliers.id)).orderBy(asc(products.name));
  return Response.json({ products: rows });
}

export async function POST(request: Request) {
  const unauthorized = await requireApiUser(request);
  if (unauthorized) return unauthorized;
  try {
    const body = await request.json() as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    if (!name) return Response.json({ error: "Nome é obrigatório." }, { status: 400 });
    const supplierId = Number(body.supplierId);
    const costPrice = Number(body.costPrice);
    const salePrice = Number(body.salePrice);
    const currentStock = Number(body.currentStock);
    if (!supplierId) return Response.json({ error: "Fornecedor é obrigatório." }, { status: 400 });
    if (!(costPrice > 0)) return Response.json({ error: "Preço de compra deve ser maior que zero." }, { status: 400 });
    if (!(salePrice > 0)) return Response.json({ error: "Preço de venda deve ser maior que zero." }, { status: 400 });
    if (!(currentStock > 0)) return Response.json({ error: "Estoque inicial deve ser maior que zero." }, { status: 400 });

    const d1 = await getD1();
    const sequence = await d1.prepare("UPDATE product_sequence SET last_value = last_value + 1 WHERE id = 1 RETURNING last_value").first<{ last_value: number }>();
    if (!sequence) throw new Error("Sequência de produtos indisponível.");
    const sku = `#${String(sequence.last_value).padStart(4, "0")}`;

    const db = await getDb();
    const [product] = await db.insert(products).values({ sku, name, category: String(body.category ?? "Mercearia"), unit: String(body.unit ?? "un"), costPrice, salePrice, currentStock, minimumStock: body.minimumStock === undefined ? 5 : Number(body.minimumStock) || 5, supplierId }).returning();
    if (product.currentStock > 0) await db.insert(movements).values({ productId: product.id, type: "entrada", quantity: product.currentStock, previousStock: 0, resultingStock: product.currentStock, unitCost: product.costPrice, reason: "Estoque inicial" });
    return Response.json({ product }, { status: 201 });
  } catch {
    return Response.json({ error: "Não foi possível gerar o código e cadastrar o produto." }, { status: 400 });
  }
}
