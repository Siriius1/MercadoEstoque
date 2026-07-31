import { getD1 } from "../../../../db";
import { hashToken, randomToken, sessionCookie } from "../../../auth";

export async function POST(request: Request) {
  const d1 = await getD1();
  const companyKey = randomToken(24);
  const sessionToken = randomToken();
  const sessionHash = await hashToken(sessionToken);
  const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
  const demoCode = companyKey.slice(0, 8).toLowerCase();

  const company = await d1.prepare(
    "INSERT INTO companies (public_key, name, is_demo) VALUES (?, 'Mercado Demonstração', 1) RETURNING id"
  ).bind(companyKey).first<{ id: number }>();
  if (!company) return Response.json({ error: "Não foi possível preparar a demonstração." }, { status: 500 });

  const user = await d1.prepare(
    "INSERT INTO users (company_id, name, email, password_hash, email_verified_at, role) VALUES (?, 'Administrador de demonstração', ?, ?, CURRENT_TIMESTAMP, 'admin') RETURNING id"
  ).bind(company.id, `demo-${demoCode}@mercadomais.local`, `demo_session$${randomToken()}`).first<{ id: number }>();
  if (!user) return Response.json({ error: "Não foi possível preparar o acesso de demonstração." }, { status: 500 });

  await d1.prepare(
    "INSERT INTO auth_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)"
  ).bind(user.id, sessionHash, expiresAt).run();

  return Response.json(
    { message: "Demonstração criada. Você possui acesso total por 6 horas." },
    {
      headers: {
        "Set-Cookie": sessionCookie(sessionToken, new URL(request.url).protocol === "https:", 6 * 60 * 60),
      },
    },
  );
}
