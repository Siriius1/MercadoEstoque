import { env } from "cloudflare:workers";
import { getMercadoApiUrl, getMercadoInternalApiKey } from "./mercado-server";

type GooglePayload = {
  aud: string;
  iss: string;
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  hd?: string;
  exp: number;
};

type GoogleJwk = JsonWebKey & { kid: string; alg?: string };
let cachedKeys: { expiresAt: number; keys: GoogleJwk[] } | null = null;

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function decodeJson<T>(value: string) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
}

async function getGoogleKeys() {
  if (cachedKeys && cachedKeys.expiresAt > Date.now()) return cachedKeys.keys;
  const response = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  if (!response.ok) throw new Error("Não foi possível validar a identidade Google.");
  const body = await response.json() as { keys: GoogleJwk[] };
  const maxAge = Number(response.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1] ?? 3600);
  cachedKeys = { keys: body.keys, expiresAt: Date.now() + maxAge * 1000 };
  return body.keys;
}

export function getGoogleClientId() {
  return (env as unknown as Record<string, string | undefined>).GOOGLE_CLIENT_ID ?? "";
}

function validateGooglePayload(payload: GooglePayload) {
  const clientId = getGoogleClientId();
  if (!clientId || payload.aud !== clientId) throw new Error("Credencial destinada a outro aplicativo.");
  if (!["accounts.google.com", "https://accounts.google.com"].includes(payload.iss)) throw new Error("Emissor Google inválido.");
  if (!payload.exp || payload.exp * 1000 <= Date.now()) throw new Error("A autenticação Google expirou.");
  if (!payload.sub || !payload.email || payload.email_verified !== true) throw new Error("O Google não confirmou este e-mail.");
  return { sub: payload.sub, email: payload.email.toLowerCase(), name: payload.name?.trim() || payload.email.split("@")[0], authoritative: payload.email.endsWith("@gmail.com") || Boolean(payload.hd) };
}

async function verifyWithLocalApi(credential: string) {
  const response = await fetch(`${getMercadoApiUrl()}/api/auth/google-profile`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Mercado-Internal-Key": getMercadoInternalApiKey(),
    },
    body: JSON.stringify({ credential }),
  });
  const result = await response.json() as {
    detail?: string;
    profile?: { sub: string; email: string; name: string; authoritative: boolean };
  };
  if (!response.ok || !result.profile) throw new Error(result.detail || "O Google não conseguiu validar esta identificação.");
  return result.profile;
}

export async function verifyGoogleCredential(credential: string, options?: { developmentApi?: boolean }) {
  const parts = credential.split(".");
  if (parts.length !== 3) throw new Error("Credencial Google inválida.");
  // No desenvolvimento a API Python consulta o Google. Em produção a assinatura
  // continua sendo verificada localmente com as chaves públicas do provedor.
  if (options?.developmentApi) return verifyWithLocalApi(credential);
  const header = decodeJson<{ alg: string; kid: string }>(parts[0]);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Credencial Google inválida.");
  const jwk = (await getGoogleKeys()).find(key => key.kid === header.kid);
  if (!jwk) throw new Error("Chave Google não reconhecida.");
  const publicKey = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const validSignature = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, decodeBase64Url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!validSignature) throw new Error("Assinatura Google inválida.");
  return validateGooglePayload(decodeJson<GooglePayload>(parts[1]));
}
