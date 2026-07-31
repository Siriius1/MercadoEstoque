import { getD1 } from "../../../../db";
import { hashToken, randomToken, sessionCookie, verifyPassword } from "../../../auth";
import { normalizeEmail } from "../../../validation";

export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const email = normalizeEmail(body.email);
  const password = String(body.password ?? "");
  const d1 = await getD1();
  const user = await d1.prepare("SELECT id, password_hash, email_verified_at, approval_status FROM users WHERE email = ?").bind(email).first<{ id: number; password_hash: string; email_verified_at: string | null; approval_status: string }>();
  if (!user || !(await verifyPassword(password, user.password_hash))) return Response.json({ error: "E-mail ou senha incorretos." }, { status: 401 });
  if (user.approval_status === "pending") return Response.json({ error: "Seu cadastro ainda está aguardando aprovação." }, { status: 403 });
  if (user.approval_status === "rejected") return Response.json({ error: "Esta solicitação não foi aprovada. Você pode enviar um novo pedido." }, { status: 403 });
  if (!user.email_verified_at) return Response.json({ error: "Confirme seu e-mail antes de entrar." }, { status: 403 });
  const token = randomToken();
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await d1.batch([
    d1.prepare("DELETE FROM auth_sessions WHERE datetime(expires_at) <= CURRENT_TIMESTAMP"),
    d1.prepare("INSERT INTO auth_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)").bind(user.id, tokenHash, expiresAt),
  ]);
  return Response.json({ success: true }, { headers: { "Set-Cookie": sessionCookie(token, new URL(request.url).protocol === "https:") } });
}
