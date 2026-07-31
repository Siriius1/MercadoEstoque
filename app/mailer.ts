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
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#173c32"><div style="padding:28px;border:1px solid #e5e0d4;border-radius:18px;background:#fffdf8"><p style="font-size:12px;letter-spacing:2px;color:#a67e13;font-weight:700">MERCADO+</p><h1 style="font-family:Georgia,serif;margin:8px 0 18px">Novo proprietário aguardando sua decisão</h1><p>Uma pessoa solicitou acesso para criar um estabelecimento:</p><div style="background:#f5f3eb;border-radius:12px;padding:16px;margin:18px 0"><strong>${escapeHtml(applicantName)}</strong><br><span style="color:#66736e">${escapeHtml(applicantEmail)}</span></div><p><a href="${escapeHtml(approveUrl)}" style="display:inline-block;background:#f2c744;color:#123b32;padding:12px 18px;border-radius:9px;text-decoration:none;font-weight:700;margin-right:8px">Aprovar cadastro</a><a href="${escapeHtml(rejectUrl)}" style="display:inline-block;border:1px solid #d7a69d;color:#9d3d2d;padding:11px 18px;border-radius:9px;text-decoration:none;font-weight:700">Recusar</a></p><p style="font-size:12px;color:#77817d;margin-top:22px">Os links são de uso único e expiram em 48 horas.</p></div></div>`,
    }),
  });
  if (!response.ok) throw new Error("O serviço de e-mail recusou o envio da solicitação.");
  return { sent: true, previewUrl: null, rejectPreviewUrl: null };
}
