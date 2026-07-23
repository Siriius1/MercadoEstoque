import { getD1 } from "../../../../db";
import { hashToken } from "../../../auth";

export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const token = String(body.token ?? "");
  if (!token) return Response.json({ error: "Link de confirmação inválido." }, { status: 400 });
  const tokenHash = await hashToken(token);
  const d1 = await getD1();
  const record = await d1.prepare("SELECT id, user_id FROM auth_tokens WHERE token_hash = ? AND type = 'verify_email' AND used_at IS NULL AND datetime(expires_at) > CURRENT_TIMESTAMP").bind(tokenHash).first<{ id: number; user_id: number }>();
  if (!record) return Response.json({ error: "Este link expirou ou já foi utilizado." }, { status: 400 });
  await d1.batch([
    d1.prepare("UPDATE users SET email_verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(record.user_id),
    d1.prepare("UPDATE auth_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?").bind(record.id),
  ]);
  return Response.json({ message: "E-mail confirmado. Agora você já pode entrar." });
}
