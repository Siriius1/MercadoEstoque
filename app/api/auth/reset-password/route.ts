import { getD1 } from "../../../../db";
import { hashPassword, hashToken } from "../../../auth";

export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const token = String(body.token ?? "");
  const password = String(body.password ?? "");
  if (!token) return Response.json({ error: "Link de alteração inválido." }, { status: 400 });
  if (password.length < 8) return Response.json({ error: "A senha precisa ter pelo menos 8 caracteres." }, { status: 400 });
  const tokenHash = await hashToken(token);
  const d1 = await getD1();
  const record = await d1.prepare("SELECT id, user_id FROM auth_tokens WHERE token_hash = ? AND type = 'reset_password' AND used_at IS NULL AND datetime(expires_at) > CURRENT_TIMESTAMP").bind(tokenHash).first<{ id: number; user_id: number }>();
  if (!record) return Response.json({ error: "Este link expirou ou já foi utilizado." }, { status: 400 });
  const passwordHash = await hashPassword(password);
  await d1.batch([
    d1.prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(passwordHash, record.user_id),
    d1.prepare("UPDATE auth_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?").bind(record.id),
    d1.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(record.user_id),
  ]);
  return Response.json({ message: "Senha alterada com sucesso. Entre novamente." });
}
