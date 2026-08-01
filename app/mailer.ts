import { env } from "cloudflare:workers";

type MailKind = "verify" | "reset" | "invite" | "owner_approved" | "owner_rejected";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}

export async function sendAuthEmail({ to, name, url, kind }: { to: string; name: string; url: string; kind: MailKind }) {
  const bindings = env as unknown as Record<string, string | undefined>;
  const apiKey = bindings.RESEND_API_KEY;
  const from = bindings.AUTH_FROM_EMAIL ?? "Mercado+ <acesso@mercadoestoque.com.br>";
  if (!apiKey) return { sent: false, previewUrl: url };

  const subject = kind === "verify" ? "Confirme sua conta no Mercado+" : kind === "invite" ? "Você recebeu acesso ao Mercado+" : kind === "owner_approved" ? "Seu cadastro no Mercado+ foi aprovado" : kind === "owner_rejected" ? "Atualização sobre seu cadastro no Mercado+" : "Altere sua senha do Mercado+";
  const action = kind === "verify" ? "Confirmar minha conta" : kind === "invite" ? "Ativar meu acesso" : kind === "owner_approved" ? "Entrar no Mercado+" : kind === "owner_rejected" ? "Voltar ao Mercado+" : "Alterar minha senha";
  const intro = kind === "verify"
    ? "Sua conta foi criada. Confirme seu e-mail para liberar o acesso ao estoque."
    : kind === "invite"
      ? "O administrador cadastrou você na equipe. Crie sua senha para ativar o acesso ao sistema."
      : kind === "owner_approved"
        ? "Boa notícia: sua solicitação foi aprovada. Sua empresa já está pronta e você pode entrar com a senha cadastrada."
        : kind === "owner_rejected"
          ? "Sua solicitação não foi aprovada neste momento. Se acreditar que houve um engano, envie uma nova solicitação."
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

export async function sendOwnerApprovalRequest({ applicantName, applicantEmail, approveUrl, rejectUrl }: { applicantName: string; applicantEmail: string; approveUrl: string; rejectUrl: string }) {
  const bindings = env as unknown as Record<string, string | undefined>;
  const apiKey = bindings.RESEND_API_KEY;
  const to = bindings.OWNER_APPROVAL_EMAIL ?? "leobsads12@gmail.com";
  const from = bindings.AUTH_FROM_EMAIL ?? "Mercado+ <acesso@mercadoestoque.com.br>";
  if (!apiKey) return { sent: false, previewUrl: approveUrl, rejectPreviewUrl: rejectUrl };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Nova solicitação de cadastro — ${applicantName}`,
      // Texto puro impede que o rastreamento troque os endereços por awstrack.me.
      // O aplicativo de e-mail ainda transforma as URLs reais em links clicáveis.
      text: [
        "MERCADO+ | NOVA SOLICITAÇÃO DE CADASTRO",
        "",
        "Um novo proprietário está aguardando sua decisão:",
        applicantName,
        applicantEmail,
        "",
        "APROVAR CADASTRO:",
        approveUrl,
        "",
        "RECUSAR CADASTRO:",
        rejectUrl,
        "",
        "Os links são de uso único e expiram em 48 horas.",
      ].join("\n"),
    }),
  });
  if (!response.ok) throw new Error("O serviço de e-mail recusou o envio da solicitação.");
  return { sent: true, previewUrl: null, rejectPreviewUrl: null };
}
