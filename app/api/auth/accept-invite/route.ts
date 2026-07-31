import { getD1 } from "../../../../db";
import { hashPassword, hashToken } from "../../../auth";

export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const token = String(body.token ?? "");
  const password = String(body.password ?? "");
  if (!token) return Response.json({ error: "Convite inválido." }, { status: 400 });
  if (password.length < 8) return Response.json({ error: "A senha precisa ter pelo menos 8 caracteres." }, { status: 400 });

  const tokenHash = await hashToken(token);
  const d1 = await getD1();
  const record = await d1.prepare(
    "SELECT auth_tokens.id, auth_tokens.user_id FROM auth_tokens JOIN users ON users.id = auth_tokens.user_id WHERE auth_tokens.token_hash = ? AND auth_tokens.type = 'employee_invite' AND auth_tokens.used_at IS NULL AND datetime(auth_tokens.expires_at) > CURRENT_TIMESTAMP AND users.email_verified_at IS NULL"
  ).bind(tokenHash).first<{ id: number; user_id: number }>();
  if (!record) return Response.json({ error: "Este convite expirou, já foi usado ou o acesso já está ativo." }, { status: 400 });

  const passwordHash = await hashPassword(password);
  await d1.batch([
    d1.prepare("UPDATE users SET password_hash = ?, email_verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(passwordHash, record.user_id),
    d1.prepare("UPDATE auth_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?").bind(record.id),
    d1.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(record.user_id),
  ]);
  return Response.json({ message: "Acesso ativado. Agora você já pode entrar no Mercado+." });
}
