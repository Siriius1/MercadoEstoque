import { env } from "cloudflare:workers";

type RuntimeEnvironment = Record<string, string | undefined>;

function runtimeValue(name: string) {
  return (env as unknown as RuntimeEnvironment)[name] ?? process.env[name];
}

export function getMercadoApiUrl() {
  return (runtimeValue("MERCADO_API_URL") || "http://127.0.0.1:8002").replace(/\/$/, "");
}

export function getMercadoInternalApiKey() {
  const value = runtimeValue("MERCADO_INTERNAL_API_KEY")?.trim();
  if (!value) throw new Error("A chave interna da API do Mercado+ não foi configurada.");
  return value;
}
