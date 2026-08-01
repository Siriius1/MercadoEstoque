import { hashToken, randomToken } from "./auth";
import { sendAuthEmail } from "./mailer";

type D1Statement = { bind(...values: unknown[]): D1Statement };
type D1Like = {
  batch(statements: D1Statement[]): Promise<unknown>;
  prepare(query: string): D1Statement;
};

export async function createEmployeeInvite({
  d1,
  userId,
  name,
  email,
  origin,
}: {
  d1: D1Like;
  userId: number;
  name: string;
  email: string;
  origin: string;
}) {
  const token = randomToken();
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  await d1.batch([
    d1.prepare("UPDATE auth_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND type = 'employee_invite' AND used_at IS NULL").bind(userId),
    d1.prepare("INSERT INTO auth_tokens (user_id, token_hash, type, expires_at) VALUES (?, ?, 'employee_invite', ?)").bind(userId, tokenHash, expiresAt),
  ]);
  const invitationUrl = `${origin}/?auth=invite&token=${encodeURIComponent(token)}`;
  try {
    return await sendAuthEmail({ to: email, name, url: invitationUrl, kind: "invite" });
  } catch (error) {
    // Enquanto o remetente do Resend estiver no modo de testes, o administrador
    // ainda pode entregar manualmente o convite sem perder o cadastro criado.
    return {
      sent: false,
      previewUrl: invitationUrl,
      deliveryWarning: error instanceof Error ? error.message : "O e-mail não pôde ser enviado.",
    };
  }
}
