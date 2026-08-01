import { getSessionUser } from "../../../auth";
import { getMercadoApiUrl, getMercadoInternalApiKey } from "../../../mercado-server";

type RouteContext = { params: Promise<{ path: string[] }> };

const cashierPermissions = [
  ["GET", /^\/api\/products$/],
  ["GET", /^\/api\/payment-settings\/pix$/],
  ["GET", /^\/api\/cash-registers\/status$/],
  ["POST", /^\/api\/cash-registers\/open$/],
  ["POST", /^\/api\/sales$/],
  ["GET", /^\/api\/sales\/latest$/],
  ["POST", /^\/api\/sales\/\d+\/cancel$/],
  ["GET", /^\/api\/cash-closures\/preview$/],
  ["POST", /^\/api\/cash-closures$/],
] as const;

function cashierCanAccess(method: string, path: string) {
  return cashierPermissions.some(([allowedMethod, pattern]) => allowedMethod === method && pattern.test(path));
}

async function proxyToMercadoApi(request: Request, context: RouteContext) {
  const user = await getSessionUser(request);
  if (!user) return Response.json({ detail: "Sua sessão expirou. Entre novamente." }, { status: 401 });

  const segments = (await context.params).path;
  if (!segments?.length || segments.some(segment => !segment || segment === "." || segment === "..")) {
    return Response.json({ detail: "Endereço da API inválido." }, { status: 400 });
  }

  const apiPath = `/${segments.map(segment => encodeURIComponent(segment)).join("/")}`;
  if (!apiPath.startsWith("/api/")) return Response.json({ detail: "Operação não permitida." }, { status: 403 });
  if (user.role === "cashier" && !cashierCanAccess(request.method, apiPath)) {
    return Response.json({ detail: "Seu perfil não possui permissão para esta operação." }, { status: 403 });
  }

  try {
    const incomingUrl = new URL(request.url);
    if (incomingUrl.searchParams.has("operatorEmail")) {
      incomingUrl.searchParams.set("operatorEmail", user.email);
    }
    const upstreamUrl = `${getMercadoApiUrl()}${apiPath}${incomingUrl.search}`;
    const headers = new Headers();
    const contentType = request.headers.get("content-type");
    if (contentType) headers.set("Content-Type", contentType);
    headers.set("Accept", "application/json");
    headers.set("X-Mercado-Internal-Key", getMercadoInternalApiKey());
    headers.set("X-Mercado-Tenant", user.companyKey);
    headers.set("X-Mercado-User-Id", String(user.id));
    headers.set("X-Mercado-User-Email", user.email);
    headers.set("X-Mercado-User-Role", user.role);

    const hasBody = !["GET", "HEAD"].includes(request.method);
    let body: ArrayBuffer | undefined;
    if (hasBody) {
      body = await request.arrayBuffer();
      if (contentType?.includes("application/json") && body.byteLength) {
        const payload = JSON.parse(new TextDecoder().decode(body)) as Record<string, unknown>;
        if ("operatorName" in payload) payload.operatorName = user.name;
        if ("operatorEmail" in payload) payload.operatorEmail = user.email;
        body = new TextEncoder().encode(JSON.stringify(payload)).buffer as ArrayBuffer;
      }
    }
    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body,
    });
    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", upstream.headers.get("content-type") || "application/json; charset=utf-8");
    return new Response(await upstream.arrayBuffer(), { status: upstream.status, headers: responseHeaders });
  } catch {
    return Response.json({ detail: "A API do Mercado+ está temporariamente indisponível." }, { status: 502 });
  }
}

export const GET = proxyToMercadoApi;
export const POST = proxyToMercadoApi;
export const PUT = proxyToMercadoApi;
export const PATCH = proxyToMercadoApi;
export const DELETE = proxyToMercadoApi;
