/**
 * O navegador conversa somente com o servidor autenticado do Mercado+.
 * A identificação da empresa e a chave interna nunca são expostas ao cliente.
 */
export const apiUrl = (path: string) => `/api/mercado${path}`;

export function mercadoApiFetch(path: string, init: RequestInit = {}) {
  return fetch(apiUrl(path), init);
}
