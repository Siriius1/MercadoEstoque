import { getD1 } from "../../../../db";
import { hashToken } from "../../../auth";
import { sendAuthEmail } from "../../../mailer";

export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const token = String(body.token ?? "");
  const action = body.action === "reject" ? "reject" : body.action === "approve" ? "approve" : "";
  if (!token || !action) return Response.json({ error: "Link de autorização inválido." }, { status: 400 });

  const d1 = await getD1();
  const tokenHash = await hashToken(token);
  const record = await d1.prepare(
    "SELECT auth_tokens.id, users.id AS user_id, users.name, users.email FROM auth_tokens JOIN users ON users.id = auth_tokens.user_id WHERE auth_tokens.token_hash = ? AND auth_tokens.type = 'owner_approval' AND auth_tokens.used_at IS NULL AND datetime(auth_tokens.expires_at) > CURRENT_TIMESTAMP AND users.approval_status = 'pending'"
  ).bind(tokenHash).first<{ id: number; user_id: number; name: string; email: string }>();
  if (!record) return Response.json({ error: "Este pedido expirou, já foi analisado ou não existe." }, { status: 400 });

  await d1.batch([
    d1.prepare(
      action === "approve"
        ? "UPDATE users SET approval_status = 'approved', email_verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        : "UPDATE users SET approval_status = 'rejected', email_verified_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(record.user_id),
    d1.prepare("UPDATE auth_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?").bind(record.id),
    d1.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(record.user_id),
  ]);

  const origin = new URL(request.url).origin;
  const destination = action === "approve" ? `${origin}/?auth=login&welcome=approved` : `${origin}/?auth=register`;
  const mail = await sendAuthEmail({
    to: record.email,
    name: record.name,
    url: destination,
    kind: action === "approve" ? "owner_approved" : "owner_rejected",
  });

  return Response.json({
    decision: action,
    message: action === "approve"
      ? `Cadastro de ${record.name} aprovado com sucesso.`
      : `Solicitação de ${record.name} recusada.`,
    previewUrl: mail.previewUrl,
  });
}
