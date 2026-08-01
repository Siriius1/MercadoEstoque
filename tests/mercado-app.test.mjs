import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

async function worker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

const environment = {
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
};
const executionContext = {
  waitUntil() {},
  passThroughOnException() {},
};

test("renderiza a tela real de acesso do Mercado+", async () => {
  const app = await worker();
  const response = await app.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    environment,
    executionContext,
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Mercado\+ \| Gestão de estoque<\/title>/i);
  assert.match(html, /Acessar o sistema/i);
  assert.match(html, /Testar demonstração/i);
  assert.match(html, /Powered by/i);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/i);
});

test("bloqueia o acesso à passagem da API sem sessão", async () => {
  const app = await worker();
  const response = await app.fetch(
    new Request("http://localhost/api/mercado/api/products"),
    environment,
    executionContext,
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { detail: "Sua sessão expirou. Entre novamente." });
});

test("publica uma PWA instalável sem armazenar vendas offline", async () => {
  const manifest = JSON.parse(await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  assert.equal(manifest.short_name, "Mercado+");
  assert.equal(manifest.display, "standalone");
  assert.deepEqual(
    manifest.icons.map(({ sizes }) => sizes),
    ["192x192", "512x512"],
  );

  const serviceWorker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(serviceWorker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.doesNotMatch(serviceWorker, /cache\.put\(request/);

  for (const icon of ["pwa-192.png", "pwa-512.png"]) {
    assert.ok((await stat(new URL(`../public/${icon}`, import.meta.url))).size > 0);
  }
});
