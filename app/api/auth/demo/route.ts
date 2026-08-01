import { getD1 } from "../../../../db";
import { hashToken, randomToken, sessionCookie } from "../../../auth";
import { enforceRateLimit } from "../../../rate-limit";
import { getMercadoApiUrl, getMercadoInternalApiKey } from "../../../mercado-server";

const DEMO_DURATION_SECONDS = 2 * 60 * 60;

async function cleanupExpiredDemos(d1: Awaited<ReturnType<typeof getD1>>) {
  await d1.prepare("DELETE FROM rate_limits WHERE datetime(reset_at) <= datetime('now', '-24 hours')").run();
  const stale = await d1.prepare(
    "SELECT id, public_key AS publicKey FROM companies WHERE is_demo = 1 AND datetime(created_at) < datetime('now', '-24 hours') LIMIT 50",
  ).all<{ id: number; publicKey: string }>();
  if (!stale.results.length) return;
  let cleanedPostgres = false;
  try {
    const response = await fetch(`${getMercadoApiUrl()}/api/demo/cleanup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Mercado-Internal-Key": getMercadoInternalApiKey(),
        "X-Mercado-Tenant": "system",
        "X-Mercado-User-Role": "admin",
      },
      body: JSON.stringify({ companyKeys: stale.results.map(company => company.publicKey) }),
      signal: AbortSignal.timeout(3000),
    });
    cleanedPostgres = response.ok;
  } catch {
    // A limpeza é oportunista: uma API adormecida não deve impedir uma nova demonstração.
  }
  if (!cleanedPostgres) return;
  await d1.batch(stale.results.map(company => d1.prepare("DELETE FROM companies WHERE id = ? AND is_demo = 1").bind(company.id)));
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "demo", 5, 60 * 60);
  if (limited) return limited;
  const d1 = await getD1();
  await cleanupExpiredDemos(d1);
  const companyKey = `demo_${randomToken(18)}`;
  const sessionToken = randomToken();
  const sessionHash = await hashToken(sessionToken);
  const expiresAt = new Date(Date.now() + DEMO_DURATION_SECONDS * 1000).toISOString();
  const demoCode = companyKey.slice(5, 13).toLowerCase();

  const company = await d1.prepare(
    "INSERT INTO companies (public_key, name, is_demo) VALUES (?, 'Mercado Demonstração', 1) RETURNING id"
  ).bind(companyKey).first<{ id: number }>();
  if (!company) return Response.json({ error: "Não foi possível preparar a demonstração." }, { status: 500 });

  const user = await d1.prepare(
    "INSERT INTO users (company_id, name, email, password_hash, email_verified_at, approval_status, role) VALUES (?, 'Administrador de demonstração', ?, ?, CURRENT_TIMESTAMP, 'approved', 'admin') RETURNING id"
  ).bind(company.id, `demo-${demoCode}@mercadomais.local`, `demo_session$${randomToken()}`).first<{ id: number }>();
  if (!user) return Response.json({ error: "Não foi possível preparar o acesso de demonstração." }, { status: 500 });

  await d1.prepare(
    "INSERT INTO auth_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)"
  ).bind(user.id, sessionHash, expiresAt).run();

  return Response.json(
    { message: "Demonstração criada. Você possui acesso total por 2 horas.", expiresAt },
    {
      headers: {
        "Set-Cookie": sessionCookie(sessionToken, new URL(request.url).protocol === "https:", DEMO_DURATION_SECONDS),
      },
    },
  );
}
