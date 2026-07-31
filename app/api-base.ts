const configuredApiBase = process.env.NEXT_PUBLIC_MERCADO_API_URL || "";

/**
 * No navegador local usamos a porta atual da API diretamente. Isso impede que
 * um pacote antigo do front-end continue apontando para outra instância local.
 * Em produção, o endereço continua vindo da variável de ambiente hospedada.
 */
export const API_BASE =
  typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? "http://127.0.0.1:8002"
    : configuredApiBase;

export const apiUrl = (path: string) => `${API_BASE}${path}`;

export function mercadoApiFetch(path: string, companyKey: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("X-Mercado-Tenant", companyKey);
  return fetch(apiUrl(path), { ...init, headers });
}
