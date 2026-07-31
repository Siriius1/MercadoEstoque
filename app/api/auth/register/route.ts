import { getD1 } from "../../../../db";
import { hashPassword, hashToken, randomToken } from "../../../auth";
import { sendAuthEmail } from "../../../mailer";
import { isValidEmail, maskEmail, normalizeEmail } from "../../../validation";

export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  const email = normalizeEmail(body.email);
  const password = String(body.password ?? "");
  if (name.length < 2) return Response.json({ error: "Informe seu nome." }, { status: 400 });
  if (!isValidEmail(email)) return Response.json({ error: "Informe um e-mail válido." }, { status: 400 });
  if (password.length < 8) return Response.json({ error: "A senha precisa ter pelo menos 8 caracteres." }, { status: 400 });

  const d1 = await getD1();
  const existing = await d1.prepare("SELECT id, company_id, email_verified_at FROM users WHERE email = ?").bind(email).first<{ id: number; company_id: number; email_verified_at: string | null }>();
  if (existing?.email_verified_at) return Response.json({ error: "Este e-mail já possui uma conta." }, { status: 409 });
  const passwordHash = await hashPassword(password);
  let userId = existing?.id;
  if (userId) {
    await d1.prepare("UPDATE users SET name = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(name, passwordHash, userId).run();
  } else {
    const company = await d1.prepare("INSERT INTO companies (public_key, name) VALUES (?, ?) RETURNING id").bind(randomToken(24), `Mercado de ${name}`).first<{ id: number }>();
    if (!company) return Response.json({ error: "Não foi possível criar o estabelecimento." }, { status: 500 });
    const created = await d1.prepare("INSERT INTO users (company_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'admin') RETURNING id").bind(company.id, name, email, passwordHash).first<{ id: number }>();
    userId = created?.id;
  }
  if (!userId) return Response.json({ error: "Não foi possível criar a conta." }, { status: 500 });

  const token = randomToken();
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await d1.batch([
    d1.prepare("UPDATE auth_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND type = 'verify_email' AND used_at IS NULL").bind(userId),
    d1.prepare("INSERT INTO auth_tokens (user_id, token_hash, type, expires_at) VALUES (?, ?, 'verify_email', ?)").bind(userId, tokenHash, expiresAt),
  ]);
  const confirmationUrl = `${new URL(request.url).origin}/?auth=verify&token=${encodeURIComponent(token)}`;
  const mail = await sendAuthEmail({ to: email, name, url: confirmationUrl, kind: "verify" });
  return Response.json({ message: `Enviamos a confirmação para ${maskEmail(email)}.`, previewUrl: mail.previewUrl }, { status: 201 });
}
