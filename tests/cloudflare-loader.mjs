export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return { url: "mercado-test:cloudflare-workers", shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url === "mercado-test:cloudflare-workers") {
    return {
      format: "module",
      source: "export const env = {};",
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
