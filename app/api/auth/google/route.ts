import { getD1 } from "../../../../db";
import { hashToken, randomToken, sessionCookie } from "../../../auth";
import { verifyGoogleCredential } from "../../../google-auth";
import { enforceRateLimit } from "../../../rate-limit";

export async function POST(request: Request) {
  try {
    const limited = await enforceRateLimit(request, "google-login", 12, 15 * 60);
    if (limited) return limited;
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Origem de acesso inválida." }, { status: 403 });
    const requestUrl = new URL(request.url);
    const body = await request.json() as { credential?: string };
    const profile = await verifyGoogleCredential(String(body.credential ?? ""), {
      developmentApi: ["localhost", "127.0.0.1"].includes(requestUrl.hostname),
    });
    if (!profile.authoritative) return Response.json({ error: "Use uma conta Gmail ou Google Workspace. Para outros endereços, entre com e-mail e senha." }, { status: 403 });
    const d1 = await getD1();
    let user = await d1.prepare("SELECT id, google_sub, approval_status FROM users WHERE google_sub = ?").bind(profile.sub).first<{ id: number; google_sub: string | null; approval_status: string }>();
    if (!user) {
      const existing = await d1.prepare("SELECT id, google_sub, approval_status FROM users WHERE email = ?").bind(profile.email).first<{ id: number; google_sub: string | null; approval_status: string }>();
      if (existing) {
        if (existing.google_sub && existing.google_sub !== profile.sub) return Response.json({ error: "Este e-mail já está ligado a outra conta Google." }, { status: 409 });
        await d1.prepare("UPDATE users SET google_sub = ?, email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(profile.sub, existing.id).run();
        user = existing;
      } else {
        return Response.json({ error: "Este e-mail ainda não possui acesso. Peça ao administrador para cadastrá-lo na equipe." }, { status: 403 });
      }
    }
    if (user.approval_status !== "approved") return Response.json({ error: "Este cadastro ainda não foi autorizado." }, { status: 403 });
    const token = randomToken();
    const tokenHash = await hashToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await d1.prepare("INSERT INTO auth_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)").bind(user.id, tokenHash, expiresAt).run();
    return Response.json({ success: true }, { headers: { "Set-Cookie": sessionCookie(token, requestUrl.protocol === "https:") } });
  } catch (caught) {
    return Response.json({ error: caught instanceof Error ? caught.message : "Não foi possível entrar com o Google." }, { status: 401 });
  }
}
