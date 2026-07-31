import { and, asc, eq } from "drizzle-orm";
import { getD1, getDb } from "../../../db";
import { movements, products, suppliers } from "../../../db/schema";
import { getSessionUser } from "../../auth";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return Response.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 });
  const db = await getDb();
  const rows = await db.select({ id: products.id, sku: products.sku, name: products.name, category: products.category, unit: products.unit, costPrice: products.costPrice, salePrice: products.salePrice, salePriceUpdatedAt: products.salePriceUpdatedAt, currentStock: products.currentStock, minimumStock: products.minimumStock, supplierId: products.supplierId, supplierName: suppliers.name, active: products.active }).from(products).leftJoin(suppliers, eq(products.supplierId, suppliers.id)).where(eq(products.companyId, user.companyId)).orderBy(asc(products.name));
  return Response.json({ products: rows });
}

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return Response.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 });
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
    if (!Number.isInteger(currentStock) || currentStock <= 0) return Response.json({ error: "O estoque inicial deve ser informado em unidades inteiras." }, { status: 400 });

    const d1 = await getD1();
    const supplier = await d1.prepare("SELECT id FROM suppliers WHERE id = ? AND company_id = ?").bind(supplierId, user.companyId).first();
    if (!supplier) return Response.json({ error: "Fornecedor não encontrado neste estabelecimento." }, { status: 400 });
    await d1.prepare("INSERT OR IGNORE INTO product_sequence (company_id, last_value) VALUES (?, 0)").bind(user.companyId).run();
    const sequence = await d1.prepare("UPDATE product_sequence SET last_value = last_value + 1 WHERE company_id = ? RETURNING last_value").bind(user.companyId).first<{ last_value: number }>();
    if (!sequence) throw new Error("Sequência de produtos indisponível.");
    const sku = `#${String(sequence.last_value).padStart(4, "0")}`;

    const db = await getDb();
    const [product] = await db.insert(products).values({ companyId: user.companyId, sku, name, category: String(body.category ?? "Mercearia"), unit: String(body.unit ?? "un"), costPrice, salePrice, currentStock, minimumStock: body.minimumStock === undefined ? 5 : Number(body.minimumStock) || 5, supplierId }).returning();
    if (product.currentStock > 0) await db.insert(movements).values({ companyId: user.companyId, productId: product.id, type: "entrada", quantity: product.currentStock, previousStock: 0, resultingStock: product.currentStock, unitCost: product.costPrice, reason: "Estoque inicial" });
    return Response.json({ product }, { status: 201 });
  } catch {
    return Response.json({ error: "Não foi possível gerar o código e cadastrar o produto." }, { status: 400 });
  }
}
