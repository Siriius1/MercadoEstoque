/**
 * O navegador conversa somente com o servidor autenticado do Mercado+.
 * A identificação da empresa e a chave interna nunca são expostas ao cliente.
 */
export const apiUrl = (path: string) => `/api/mercado${path}`;

let wakeRequestId = 0;
const wakingRequests = new Set<number>();

function announceWakeState() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("mercado-api-wake", { detail: { active: wakingRequests.size > 0 } }));
  }
}

const wait = (milliseconds: number) => new Promise(resolve => window.setTimeout(resolve, milliseconds));

export async function mercadoApiFetch(path: string, init: RequestInit = {}) {
  const method = (init.method || "GET").toUpperCase();
  // Escritas como vendas nunca são repetidas automaticamente: isso evita duplicidade.
  const canRetry = method === "GET" || method === "HEAD" || (method === "POST" && path === "/api/demo/seed");
  const delays = canRetry ? [0, 1500, 2500, 4000, 6000, 8000, 10000, 12000] : [0];
  const requestId = ++wakeRequestId;
  try {
    for (let attempt = 0; attempt < delays.length; attempt += 1) {
      if (delays[attempt]) await wait(delays[attempt]);
      try {
        const response = await fetch(apiUrl(path), init);
        const retryable = [502, 503, 504].includes(response.status);
        if (!retryable || attempt === delays.length - 1) return response;
      } catch (error) {
        if (!canRetry || attempt === delays.length - 1) throw error;
      }
      wakingRequests.add(requestId);
      announceWakeState();
    }
    throw new Error("Seus dados ainda estão sendo preparados. Tente novamente em instantes.");
  } finally {
    wakingRequests.delete(requestId);
    announceWakeState();
  }
}
