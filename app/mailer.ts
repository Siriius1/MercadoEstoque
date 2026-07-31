import { env } from "cloudflare:workers";

type MailKind = "verify" | "reset" | "invite";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}

export async function sendAuthEmail({ to, name, url, kind }: { to: string; name: string; url: string; kind: MailKind }) {
  const bindings = env as unknown as Record<string, string | undefined>;
  const apiKey = bindings.RESEND_API_KEY;
  const from = bindings.AUTH_FROM_EMAIL ?? "Mercado+ <acesso@mercadoestoque.com.br>";
  if (!apiKey) return { sent: false, previewUrl: url };

  const subject = kind === "verify" ? "Confirme sua conta no Mercado+" : kind === "invite" ? "Você recebeu acesso ao Mercado+" : "Altere sua senha do Mercado+";
  const action = kind === "verify" ? "Confirmar minha conta" : kind === "invite" ? "Ativar meu acesso" : "Alterar minha senha";
  const intro = kind === "verify"
    ? "Sua conta foi criada. Confirme seu e-mail para liberar o acesso ao estoque."
    : kind === "invite"
      ? "O administrador cadastrou você na equipe. Crie sua senha para ativar o acesso ao sistema."
      : "Recebemos uma solicitação para alterar sua senha. Se não foi você, ignore esta mensagem.";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#183b32"><h1>Mercado<span style="color:#d7ad25">+</span></h1><p>Olá, ${escapeHtml(name)}.</p><p>${intro}</p><p><a href="${escapeHtml(url)}" style="display:inline-block;background:#f2c744;color:#123b32;padding:12px 18px;border-radius:9px;text-decoration:none;font-weight:700">${action}</a></p><p style="font-size:12px;color:#6e7975">Este link expira automaticamente.</p></div>`,
    }),
  });
  if (!response.ok) throw new Error("O serviço de e-mail recusou o envio.");
  return { sent: true, previewUrl: null };
}
