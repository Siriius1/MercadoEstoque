import { getD1 } from "../../../../db";
import { hashToken, randomToken } from "../../../auth";
import { sendAuthEmail } from "../../../mailer";
import { isValidEmail, maskEmail, normalizeEmail } from "../../../validation";

export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) return Response.json({ error: "Informe um e-mail válido." }, { status: 400 });
  const d1 = await getD1();
  const user = await d1.prepare("SELECT id, name FROM users WHERE email = ? AND email_verified_at IS NOT NULL").bind(email).first<{ id: number; name: string }>();
  let previewUrl: string | null = null;
  if (user) {
    const token = randomToken();
    const tokenHash = await hashToken(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await d1.batch([
      d1.prepare("UPDATE auth_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND type = 'reset_password' AND used_at IS NULL").bind(user.id),
      d1.prepare("INSERT INTO auth_tokens (user_id, token_hash, type, expires_at) VALUES (?, ?, 'reset_password', ?)").bind(user.id, tokenHash, expiresAt),
    ]);
    const resetUrl = `${new URL(request.url).origin}/?auth=reset&token=${encodeURIComponent(token)}`;
    const mail = await sendAuthEmail({ to: email, name: user.name, url: resetUrl, kind: "reset" });
    previewUrl = mail.previewUrl;
  }
  return Response.json({ message: `Se existir uma conta para ${maskEmail(email)}, enviaremos o link de alteração.`, previewUrl });
}
