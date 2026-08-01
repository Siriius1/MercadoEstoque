import { getD1 } from "../db";
import { hashToken } from "./auth";

function clientAddress(request: Request) {
  return request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "local";
}

export async function enforceRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowSeconds: number,
  discriminator = "",
) {
  const identity = await hashToken(`${clientAddress(request)}:${discriminator.toLowerCase()}`);
  const key = `${scope}:${identity}`;
  const resetAt = new Date(Date.now() + windowSeconds * 1000).toISOString();
  const d1 = await getD1();
  const result = await d1.prepare(
    `INSERT INTO rate_limits (key, attempts, reset_at)
     VALUES (?, 1, ?)
     ON CONFLICT(key) DO UPDATE SET
       attempts = CASE WHEN datetime(reset_at) <= CURRENT_TIMESTAMP THEN 1 ELSE attempts + 1 END,
       reset_at = CASE WHEN datetime(reset_at) <= CURRENT_TIMESTAMP THEN excluded.reset_at ELSE reset_at END
     RETURNING attempts, reset_at AS resetAt`,
  ).bind(key, resetAt).first<{ attempts: number; resetAt: string }>();
  if (!result || result.attempts <= limit) return null;
  const retryAfter = Math.max(1, Math.ceil((new Date(result.resetAt).getTime() - Date.now()) / 1000));
  return Response.json(
    { error: "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}
