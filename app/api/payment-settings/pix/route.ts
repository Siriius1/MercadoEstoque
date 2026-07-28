import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { paymentSettings } from "../../../../db/schema";
import { getSessionUser } from "../../../auth";
import { emptyPixSettings, normalizePixKey, PixKeyType, PixSettings, validatePixSettings } from "../../../pix";

function serialize(row: typeof paymentSettings.$inferSelect | undefined): PixSettings {
  if (!row) return emptyPixSettings;
  return {
    enabled: row.pixEnabled,
    keyType: row.pixKeyType as PixKeyType,
    key: row.pixKey,
    receiverName: row.pixReceiverName,
    city: row.pixCity,
    updatedAt: row.updatedAt,
  };
}

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return Response.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 });
  const row = await (await getDb()).query.paymentSettings.findFirst({ where: eq(paymentSettings.id, 1) });
  return Response.json({ settings: serialize(row) });
}

export async function PUT(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return Response.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 });
  if (user.role !== "admin") return Response.json({ error: "Somente administradores podem alterar o PIX." }, { status: 403 });
  const body = await request.json() as PixSettings;
  const settings: PixSettings = {
    enabled: body.enabled === true,
    keyType: (["cpf", "cnpj", "telefone", "email", "aleatoria"].includes(body.keyType) ? body.keyType : "cnpj") as PixKeyType,
    key: normalizePixKey(body.keyType, body.key),
    receiverName: String(body.receiverName ?? "").trim(),
    city: String(body.city ?? "").trim(),
  };
  const validationError = validatePixSettings(settings);
  if (validationError) return Response.json({ error: validationError }, { status: 400 });
  const values = {
    pixEnabled: settings.enabled,
    pixKeyType: settings.keyType,
    pixKey: settings.key,
    pixReceiverName: settings.receiverName,
    pixCity: settings.city,
    updatedAt: new Date().toISOString(),
  };
  await (await getDb()).insert(paymentSettings).values({ id: 1, ...values }).onConflictDoUpdate({ target: paymentSettings.id, set: values });
  const row = await (await getDb()).query.paymentSettings.findFirst({ where: eq(paymentSettings.id, 1) });
  return Response.json({ settings: serialize(row) });
}
