import { getD1 } from "../../../../db";
import { hashPassword, hashToken, randomToken } from "../../../auth";
import { sendOwnerApprovalRequest } from "../../../mailer";
import { isValidEmail, isValidFullName, normalizeEmail, normalizeFullName } from "../../../validation";
import { enforceRateLimit } from "../../../rate-limit";

export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const name = normalizeFullName(body.name);
  const email = normalizeEmail(body.email);
  const password = String(body.password ?? "");
  if (!isValidFullName(name)) return Response.json({ error: "Informe seu nome e sobrenome." }, { status: 400 });
  if (!isValidEmail(email)) return Response.json({ error: "Informe um e-mail válido." }, { status: 400 });
  if (password.length < 8) return Response.json({ error: "A senha precisa ter pelo menos 8 caracteres." }, { status: 400 });
  const limited = await enforceRateLimit(request, "register", 3, 24 * 60 * 60, email);
  if (limited) return limited;

  const d1 = await getD1();
  const existing = await d1.prepare("SELECT id, company_id, email_verified_at, approval_status, role FROM users WHERE email = ?").bind(email).first<{ id: number; company_id: number; email_verified_at: string | null; approval_status: string; role: string }>();
  if (existing?.approval_status === "approved") return Response.json({ error: "Este e-mail já possui uma conta ou convite de acesso." }, { status: 409 });
  const passwordHash = await hashPassword(password);
  let userId = existing?.id;
  if (userId) {
    await d1.prepare("UPDATE users SET name = ?, password_hash = ?, approval_status = 'pending', email_verified_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(name, passwordHash, userId).run();
  } else {
    const company = await d1.prepare("INSERT INTO companies (public_key, name) VALUES (?, ?) RETURNING id").bind(randomToken(24), `Mercado de ${name}`).first<{ id: number }>();
    if (!company) return Response.json({ error: "Não foi possível criar o estabelecimento." }, { status: 500 });
    const created = await d1.prepare("INSERT INTO users (company_id, name, email, password_hash, approval_status, role) VALUES (?, ?, ?, ?, 'pending', 'admin') RETURNING id").bind(company.id, name, email, passwordHash).first<{ id: number }>();
    userId = created?.id;
  }
  if (!userId) return Response.json({ error: "Não foi possível criar a conta." }, { status: 500 });

  const token = randomToken();
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  await d1.batch([
    d1.prepare("UPDATE auth_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND type = 'owner_approval' AND used_at IS NULL").bind(userId),
    d1.prepare("INSERT INTO auth_tokens (user_id, token_hash, type, expires_at) VALUES (?, ?, 'owner_approval', ?)").bind(userId, tokenHash, expiresAt),
  ]);
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const approveUrl = `${origin}/?auth=approve&token=${encodeURIComponent(token)}`;
  const rejectUrl = `${origin}/?auth=reject&token=${encodeURIComponent(token)}`;
  const mail = await sendOwnerApprovalRequest({ applicantName: name, applicantEmail: email, approveUrl, rejectUrl });
  const isLocal = ["localhost", "127.0.0.1"].includes(requestUrl.hostname);
  if (!mail.sent && !isLocal) {
    return Response.json({ error: "O envio de aprovações ainda não está configurado. Tente novamente mais tarde." }, { status: 503 });
  }
  return Response.json({
    status: "pending",
    message: "Sua solicitação foi enviada para aprovação.",
    previewUrl: isLocal ? mail.previewUrl : null,
    rejectPreviewUrl: isLocal ? mail.rejectPreviewUrl : null,
  }, { status: 201 });
}
